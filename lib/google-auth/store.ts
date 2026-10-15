import { assertWritable } from "../read-only.ts";
import { token, validToken } from "../access-core.ts";
import type { AccessDatabase } from "../d1/access.ts";

const approved = `(s.github_id = (SELECT instructor_github_id FROM community WHERE singleton=1)
  OR EXISTS (SELECT 1 FROM accounts a WHERE a.github_id=s.github_id AND a.status='approved'))`;
const recent = `s.auth_provider='github' AND julianday(s.created_at)>julianday('now','-5 minutes')
  AND julianday(s.created_at)<=julianday('now')`;

/** Call only after the route checks a same-origin POST. All authorization is repeated in SQL. */
export async function beginGoogleLink(db: AccessDatabase, sessionHash: string, grantHash: string) {
  assertWritable();
  if (!validToken(sessionHash) || !validToken(grantHash)) return null;
  const userId = token();
  const results = await db.batch([
    db.prepare(`DELETE FROM google_link_grants WHERE expires_at <= unixepoch('now')`),
    db.prepare(`INSERT INTO google_users(id,name,email,emailVerified,createdAt,updatedAt)
      SELECT ?1,'Member',?1 || '@vibies.invalid',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
      FROM sessions s WHERE s.session_hash=?2 AND ${recent} AND ${approved}
      AND NOT EXISTS (SELECT 1 FROM google_identity_map m WHERE m.github_id=s.github_id)`)
      .bind(userId, sessionHash),
    db.prepare(`INSERT INTO google_identity_map(user_id,github_id)
      SELECT ?1,s.github_id FROM sessions s JOIN google_users u ON u.id=?1
      WHERE s.session_hash=?2 AND ${recent} AND ${approved}
      ON CONFLICT(github_id) DO NOTHING`).bind(userId, sessionHash),
    db.prepare(`INSERT INTO google_link_grants(grant_hash,user_id,session_hash,expires_at)
      SELECT ?1,m.user_id,s.session_hash,unixepoch('now')+300
      FROM sessions s JOIN google_identity_map m ON m.github_id=s.github_id
      WHERE s.session_hash=?2 AND ${recent} AND ${approved}
      AND NOT EXISTS (SELECT 1 FROM google_accounts a WHERE a.userId=m.user_id)
      ON CONFLICT(user_id) DO NOTHING RETURNING user_id`).bind(grantHash, sessionHash),
  ]);
  if (results.some((result) => !result.success)) throw new Error("Google sign-in unavailable");
  return (results[3].results[0]?.user_id as string | undefined) ?? null;
}

/** Checked again by the account insertion trigger; this read alone never authorizes a link. */
export async function googleLinkGrant(db: AccessDatabase, grantHash: string, sessionHash: string) {
  if (!validToken(grantHash) || !validToken(sessionHash)) return null;
  return db.prepare(`SELECT g.user_id FROM google_link_grants g JOIN sessions s ON s.session_hash=g.session_hash
    WHERE g.grant_hash=?1 AND s.session_hash=?2 AND g.expires_at>unixepoch('now')
    AND ${recent} AND ${approved}`).bind(grantHash, sessionHash).first<{ user_id: string }>();
}

/** Never upserts a GitHub identity or renews the source session. */
export async function finishGoogleSignIn(db: AccessDatabase, userId: string, sessionHash: string, betterSessionToken: string) {
  assertWritable();
  if (!validToken(userId) || !validToken(sessionHash) || !betterSessionToken) return false;
  const results = await db.batch([
    db.prepare(`INSERT INTO sessions(session_hash,github_id,created_at,auth_provider)
      SELECT ?1,m.github_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'google'
      FROM google_identity_map m JOIN google_accounts a ON a.userId=m.user_id
      JOIN google_sessions b ON b.userId=m.user_id
      WHERE m.user_id=?2 AND b.token=?3 AND julianday(b.expiresAt)>julianday('now')
      AND (m.github_id=(SELECT instructor_github_id FROM community WHERE singleton=1)
        OR EXISTS(SELECT 1 FROM accounts v WHERE v.github_id=m.github_id AND v.status='approved'))
      RETURNING session_hash`).bind(sessionHash, userId, betterSessionToken),
    db.prepare("DELETE FROM google_sessions WHERE token=?").bind(betterSessionToken),
  ]);
  if (results.some((result) => !result.success)) throw new Error("Google sign-in unavailable");
  return results[0].results.length === 1;
}

export async function cancelGoogleLink(db: AccessDatabase, grantHash: string) {
  assertWritable();
  if (!validToken(grantHash)) return;
  const results = await db.batch([
    db.prepare("DELETE FROM google_sessions WHERE userId IN (SELECT user_id FROM google_link_grants WHERE grant_hash=?)").bind(grantHash),
    db.prepare("DELETE FROM google_link_grants WHERE grant_hash=?").bind(grantHash),
  ]);
  if (results.some((result) => !result.success)) throw new Error("Google sign-in unavailable");
}
