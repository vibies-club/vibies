import { isReadOnly } from "../read-only.ts";
import { nickname, validToken, type Access } from "../access-core.ts";

/** Structural subset shared by the Worker binding and isolated SQLite tests. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta?: { changes?: number };
}
export interface AccessDatabase {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}

const freshSession = "julianday(s.created_at) > julianday('now', '-24 hours')";
const instructor = `EXISTS (SELECT 1 FROM sessions s JOIN community c
  ON c.instructor_github_id = s.github_id WHERE c.singleton = 1
  AND s.session_hash = ?1 AND ${freshSession})`;
const configured = "EXISTS (SELECT 1 FROM community WHERE singleton = 1 AND instructor_github_id IS NOT NULL)";
const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
export type MemberChangeKind = "ok" | "forbidden" | "invalid" | "missing" | "nickname" | "duplicate" | "full";
export type MemberAccount = { githubId: string; username: string; nickname: string | null; status: "unapproved" | "approved" | "revoked" };

function checked<T>(result: D1Result<T>): T[] {
  if (!result.success) throw new Error("Access unavailable");
  return result.results;
}

export async function access_state(db: AccessDatabase, hash: string | null): Promise<Access> {
  if (!validToken(hash)) return { kind: "signed_out" };
  type SessionAccess = {
    github_id: string; instructor_github_id: string | null; instructor_nickname: string | null;
    nickname: string | null; status: string | null; onboarding_completed: number | null;
  };
  const results = await db.batch<SessionAccess>([
    ...(!isReadOnly() ? [db.prepare("DELETE FROM sessions WHERE session_hash = ? AND julianday(created_at) <= julianday('now', '-24 hours')").bind(hash)] : []),
    db.prepare(`SELECT s.github_id, c.instructor_github_id,
    c.instructor_nickname, a.nickname, a.status, a.onboarding_completed
    FROM sessions s CROSS JOIN community c LEFT JOIN accounts a ON a.github_id = s.github_id
    WHERE c.singleton = 1 AND s.session_hash = ? AND ${freshSession}`).bind(hash),
  ]);
  results.forEach(checked);
  const row = checked(results[results.length - 1])[0];
  if (!row) return { kind: "signed_out" };
  if (row.github_id === row.instructor_github_id && row.instructor_nickname)
    return { kind: "instructor", nickname: row.instructor_nickname };
  if (row.status === "approved" && row.nickname)
    return { kind: "member", nickname: row.nickname, onboardingComplete: row.onboarding_completed === 1 };
  return { kind: "denied" };
}

export async function members(db: AccessDatabase, hash: string | null): Promise<
  { kind: "ok"; activeCount: number; accounts: MemberAccount[] } | { kind: "forbidden" }> {
  if (!validToken(hash)) return { kind: "forbidden" };
  // Authorization and projection share one statement/snapshot, including the empty list case.
  const row = await db.prepare(`SELECT (SELECT count(*) FROM accounts WHERE status = 'approved') activeCount,
    (SELECT json_group_array(json_object('githubId', github_id, 'username', github_username,
      'nickname', nickname, 'status', status)) FROM
      (SELECT * FROM accounts ORDER BY github_username, github_id)) accounts
    WHERE ${instructor}`).bind(hash).first<{ activeCount: number; accounts: string }>();
  return row ? { kind: "ok", activeCount: row.activeCount, accounts: JSON.parse(row.accounts) as MemberAccount[] }
    : { kind: "forbidden" };
}

export async function change_member(db: AccessDatabase, hash: string | null, githubId: string,
  action: string | null, requestedNickname: string | null = null): Promise<{ kind: MemberChangeKind }> {
  if (!validToken(hash)) return { kind: "forbidden" };
  const normalized = nickname(requestedNickname);
  const key = normalized?.toLowerCase() ?? null;
  // This decision is recomputed inside every write. The batch holds one SQLite transaction;
  // no authorization read outside the transaction can permit a later unauthorized write.
  const decision = `SELECT CASE
    WHEN NOT (${instructor}) THEN 'forbidden'
    WHEN ?2 IS NULL OR ?2 NOT IN ('approve','reapprove','revoke','dismiss') OR ?3 = 0 THEN 'invalid'
    WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE github_id = ?4) THEN 'missing'
    WHEN ?2 = 'approve' AND ?5 IS NULL THEN 'nickname'
    WHEN ?2 = 'approve' AND status = 'approved' THEN CASE WHEN nickname = ?5 THEN 'ok' ELSE 'invalid' END
    WHEN ?2 = 'approve' AND status <> 'unapproved' THEN 'invalid'
    WHEN ?2 <> 'approve' AND ?7 IS NOT NULL THEN 'invalid'
    WHEN ?2 = 'approve' AND (EXISTS (SELECT 1 FROM accounts WHERE nickname_key = ?6 AND github_id <> ?4)
      OR EXISTS (SELECT 1 FROM community WHERE singleton = 1 AND instructor_nickname_key = ?6)) THEN 'duplicate'
    WHEN ?2 = 'reapprove' AND status NOT IN ('revoked','approved') THEN 'invalid'
    WHEN ?2 = 'revoke' AND status NOT IN ('revoked','approved') THEN 'invalid'
    WHEN ?2 = 'dismiss' AND status <> 'unapproved' THEN 'invalid'
    WHEN ((?2 = 'approve' AND status = 'unapproved') OR (?2 = 'reapprove' AND status = 'revoked'))
      AND (SELECT count(*) FROM accounts WHERE status = 'approved') >= 8 THEN 'full'
    ELSE 'ok' END kind
    FROM (SELECT 1) LEFT JOIN accounts ON github_id = ?4`;
  const args = [hash, action, /^[1-9][0-9]{0,63}$/.test(githubId) ? 1 : 0, githubId, normalized, key, requestedNickname];
  const stmt = (sql: string) => db.prepare(sql).bind(...args);
  const allowed = `(${decision}) = 'ok'`;
  const queries = [stmt(decision)];
  if (action === "dismiss") {
    queries.push(stmt(`DELETE FROM sessions WHERE github_id = ?4 AND ${allowed}`));
    queries.push(stmt(`DELETE FROM accounts WHERE github_id = ?4 AND ${allowed}`));
  } else {
    queries.push(stmt(`UPDATE accounts SET
      status = CASE WHEN ?2 IN ('approve','reapprove') THEN 'approved' WHEN ?2 = 'revoke' THEN 'revoked' ELSE status END,
      nickname = CASE WHEN ?2 = 'approve' THEN ?5 ELSE nickname END,
      nickname_key = CASE WHEN ?2 = 'approve' THEN ?6 ELSE nickname_key END
      WHERE github_id = ?4 AND ${allowed}`));
  }
  const results = await db.batch<{ kind: MemberChangeKind }>(queries);
  results.forEach(checked);
  return { kind: checked(results[0])[0].kind };
}

export async function begin_sign_in(db: AccessDatabase, browserHash: string, stateHash: string): Promise<{
  kind: "ok" | "limited" | "unconfigured";
}> {
  if (!validToken(browserHash) || !validToken(stateHash)) {
    const row = await db.prepare(`SELECT ${configured} configured`).first<{ configured: number }>();
    return { kind: row?.configured ? "limited" : "unconfigured" };
  }
  const queries = [
    db.prepare(`DELETE FROM sign_in_attempts WHERE ${configured} AND julianday(created_at) <= julianday('now', '-10 minutes')`),
    db.prepare(`DELETE FROM sign_in_flows WHERE ${configured} AND julianday(created_at) <= julianday('now', '-10 minutes')`),
    db.prepare(`INSERT INTO sign_in_attempts (browser_hash, created_at) SELECT ?1, ${now}
      WHERE ${configured} AND (SELECT count(*) FROM sign_in_attempts WHERE browser_hash = ?1) < 10`).bind(browserHash),
    // changes() refers to the preceding insertion in this same atomic batch.
    db.prepare(`INSERT INTO sign_in_flows (state_hash, browser_hash, created_at)
      SELECT ?1, ?2, ${now} WHERE changes() = 1 ON CONFLICT (state_hash) DO NOTHING RETURNING state_hash`).bind(stateHash, browserHash),
    db.prepare(`SELECT ${configured} configured`),
  ];
  const results = await db.batch(queries);
  results.forEach(checked);
  return { kind: !checked(results[4])[0]?.configured ? "unconfigured" : checked(results[3]).length ? "ok" : "limited" };
}

export async function consume_sign_in(db: AccessDatabase, browserHash: string, stateHash: string): Promise<boolean> {
  if (!validToken(browserHash) || !validToken(stateHash)) return false;
  return checked(await db.prepare(`DELETE FROM sign_in_flows WHERE browser_hash = ? AND state_hash = ?
    AND julianday(created_at) > julianday('now', '-10 minutes') RETURNING state_hash`)
    .bind(browserHash, stateHash).all()).length === 1;
}

export async function finish_sign_in(db: AccessDatabase, githubId: string, username: string,
  sessionHash: string, oldSessionHash: string | null = null): Promise<void> {
  if (!/^[1-9][0-9]{0,63}$/.test(githubId) || !/^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)
    || !validToken(sessionHash) || (oldSessionHash !== null && (!validToken(oldSessionHash) || oldSessionHash === sessionHash)))
    throw new Error("Invalid sign-in result");
  // The session's NOT NULL github_id is an assertion: missing Instructor rolls back
  // all prior cleanup/account writes instead of returning partial logical success.
  const results = await db.batch([
    db.prepare("DELETE FROM sessions WHERE julianday(created_at) <= julianday('now', '-24 hours') OR session_hash = ?").bind(oldSessionHash),
    db.prepare(`INSERT INTO accounts (internal_id, github_id, github_username)
      SELECT ?1, ?2, ?3 FROM community WHERE singleton = 1 AND instructor_github_id IS NOT NULL AND instructor_github_id <> ?2
      ON CONFLICT (github_id) DO UPDATE SET github_username = excluded.github_username`)
      .bind(crypto.randomUUID(), githubId, username),
    db.prepare(`INSERT INTO sessions (session_hash, github_id, created_at, auth_provider)
      VALUES (?1, CASE WHEN ${configured} THEN ?2 ELSE NULL END, ${now}, 'github')`).bind(sessionHash, githubId),
  ]);
  results.forEach(checked);
}

export async function end_session(db: AccessDatabase, hash: string | null): Promise<void> {
  if (validToken(hash)) checked(await db.prepare("DELETE FROM sessions WHERE session_hash = ?").bind(hash).run());
}
