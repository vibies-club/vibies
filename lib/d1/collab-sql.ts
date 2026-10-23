import { projectId } from '../project-core.ts';
import type { AccessDatabase, D1Result } from './access.ts';

// Every rule below is decided inside the write batch that applies it (one D1 transaction).
// Batches are chained by a fresh nonce: the first guarded write records it, later writes
// require it, so a failed guard leaves every statement at zero rows.
export const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const fresh = "julianday(s.created_at) > julianday('now','-24 hours')";
export const me = `(SELECT a.internal_id FROM sessions s JOIN accounts a ON a.github_id=s.github_id
  WHERE s.session_hash=?1 AND ${fresh} AND a.status='approved')`;
export const instructor = `EXISTS (SELECT 1 FROM sessions s JOIN community c ON c.instructor_github_id=s.github_id
  WHERE s.session_hash=?1 AND c.singleton=1 AND ${fresh})`;
export const actor = `(${me} IS NOT NULL OR ${instructor})`;
export const visibleProject = "p.publication='Published' AND p.connection='Connected' AND p.moderation='Visible'";
export const bool = (sql: string) => `json(CASE WHEN ${sql} THEN 'true' ELSE 'false' END)`;
export const instructorName = "(SELECT instructor_nickname FROM community WHERE singleton=1)";

export type Kind = { kind: string };
export type Row = Record<string, unknown>;
export function rows<T>(result: D1Result<T>): T[] {
  if (!result.success) throw new Error('Collaborate unavailable');
  return result.results;
}
export function statements(db: AccessDatabase, args: unknown[]) {
  return (sql: string) => {
    const count = Math.max(0, ...Array.from(sql.matchAll(/\?(\d+)/g), match => Number(match[1])));
    return db.prepare(sql).bind(...args.slice(0, count));
  };
}
export const uuid = (value: unknown): value is string => projectId(value);

export async function single(db: AccessDatabase, args: unknown[], decision: string, writes: string[], final?: string): Promise<Kind & { last?: Row }> {
  const stmt = statements(db, args);
  const results = await db.batch<Row>([stmt(decision), ...writes.map(sql => stmt(sql)), ...(final ? [stmt(final)] : [])]);
  results.forEach(rows);
  return { kind: rows(results[0])[0].kind as string, last: final ? rows(results[results.length - 1])[0] : undefined };
}

export const nick = (account: string) => `CASE WHEN ${account} IS NULL THEN NULL ELSE (SELECT nickname FROM accounts WHERE internal_id=${account}) END`;
