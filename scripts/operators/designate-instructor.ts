import { nickname } from "../../lib/access-core.ts";
import type { AccessDatabase } from "../../lib/d1/access.ts";

/**
 * Operator-only equivalent of vibies_private.designate_instructor.
 * Invoke with an explicitly selected D1 binding in trusted operator tooling.
 * Never import this module into an HTTP handler or the public domain dispatcher.
 * Possession of the database binding is the operator authority; a session is not.
 */
export async function designateInstructor(
  db: AccessDatabase, githubId: unknown, requestedNickname: unknown, reason: unknown,
): Promise<void> {
  const normalized = nickname(requestedNickname);
  const trimmedReason = typeof reason === "string" ? reason.replace(/^ +| +$/g, "") : "";
  if (typeof githubId !== "string" || !/^[1-9][0-9]{0,63}$/.test(githubId)
    || normalized === null || [...trimmedReason].length < 1 || [...trimmedReason].length > 500) {
    throw new Error("Invalid Instructor designation");
  }

  const previousOrTarget = "github_id = ?1 OR github_id = (SELECT instructor_github_id FROM community WHERE singleton = 1)";
  // D1 batches are transactions. Assert eligibility in the first write using the
  // audit's NOT NULL constraint, so rejected or missing community state cannot
  // permit cleanup. Later errors roll the audit and all cleanup back together.
  const results = await db.batch([
    db.prepare(`INSERT INTO instructor_audit (previous_github_id, new_github_id, reason)
      VALUES ((SELECT instructor_github_id FROM community WHERE singleton = 1),
        CASE WHEN EXISTS (SELECT 1 FROM community WHERE singleton = 1)
          AND NOT EXISTS (SELECT 1 FROM accounts WHERE github_id = ?1 AND status IN ('approved','revoked'))
          AND NOT EXISTS (SELECT 1 FROM accounts WHERE nickname_key = ?2 AND github_id <> ?1)
        THEN ?1 ELSE NULL END, ?3)`).bind(githubId, normalized.toLowerCase(), trimmedReason),
    // Preserve immutable provider links/identity maps. Remove the credentials
    // that could otherwise outlive recovery, including unconsumed link grants.
    db.prepare(`DELETE FROM google_sessions WHERE userId IN
      (SELECT user_id FROM google_identity_map WHERE ${previousOrTarget})`).bind(githubId),
    db.prepare(`DELETE FROM google_link_grants WHERE user_id IN
      (SELECT user_id FROM google_identity_map WHERE ${previousOrTarget})`).bind(githubId),
    db.prepare(`DELETE FROM sessions WHERE ${previousOrTarget}`).bind(githubId),
    db.prepare("DELETE FROM accounts WHERE github_id = ?1 AND status = 'unapproved'").bind(githubId),
    db.prepare(`UPDATE community SET instructor_github_id = ?1,
      instructor_nickname = ?2, instructor_nickname_key = ?3 WHERE singleton = 1`)
      .bind(githubId, normalized, normalized.toLowerCase()),
  ]);
  if (results.some(result => !result.success)) throw new Error("Instructor designation unavailable");
}
