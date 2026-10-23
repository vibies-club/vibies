import { nickname, validToken } from '../access-core.ts';
import { gateItemId, gateNote, gateProof } from '../course.ts';
import type { AccessDatabase, D1Result } from './access.ts';

const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const fresh = "julianday(s.created_at) > julianday('now','-24 hours')";
// The acting member always comes from the session, so nobody can write another member's checks.
const member = `SELECT a.internal_id FROM sessions s JOIN accounts a ON a.github_id=s.github_id
  WHERE s.session_hash=?1 AND ${fresh} AND a.status='approved'`;
const instructor = `EXISTS (SELECT 1 FROM sessions s JOIN community c ON c.instructor_github_id=s.github_id
  WHERE s.session_hash=?1 AND c.singleton=1 AND ${fresh})`;
const check = (alias: string) => `json_object('sessionNo',${alias}.session_no,'itemId',${alias}.item_id,'state',${alias}.state,'proofUrl',${alias}.proof_url,'memberNote',${alias}.member_note,'instructorNote',${alias}.instructor_note)`;
type Kind = { kind: string };
type Row = Record<string, unknown>;
const session = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 30;
const same = (value: string | null, parse: (input: string) => string | null | false) => value === null || parse(value) === value;

function rows<T>(result: D1Result<T>): T[] {
  if (!result.success) throw new Error('Gates unavailable');
  return result.results;
}
async function mutation(db: AccessDatabase, args: unknown[], queries: string[]): Promise<Kind> {
  const result = await db.batch<Kind>(queries.map(sql => db.prepare(sql).bind(...args.slice(0, Math.max(0, ...Array.from(sql.matchAll(/\?(\d+)/g), m => Number(m[1])))))));
  result.forEach(rows);
  return rows(result[0])[0];
}

export async function gates_mine(db: AccessDatabase, hash: string | null): Promise<Kind & { mine?: Row[] }> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  const row = await db.prepare(`SELECT EXISTS (${member}) allowed,
    (SELECT json_group_array(json(${check('g')})) FROM (SELECT * FROM gate_checks WHERE account_id=(${member}) ORDER BY session_no,item_id) g) mine`)
    .bind(hash).first<{ allowed: number; mine: string }>();
  return row?.allowed ? { kind: 'ok', mine: JSON.parse(row.mine) as Row[] } : { kind: 'forbidden' };
}

/** A member ticks an item done (with an optional proof link and note) or unticks it. Ticking again resolves any flag. The caller checks the item is in the manifest. */
export async function set_gate_check(db: AccessDatabase, hash: string | null, sessionNo: number, itemId: string, done: boolean,
  proofUrl: string | null = null, note: string | null = null): Promise<Kind> {
  if (!validToken(hash) || !session(sessionNo) || !gateItemId(itemId) || typeof done !== 'boolean' ||
    !same(proofUrl, gateProof) || !same(note, gateNote) || (!done && (proofUrl !== null || note !== null))) return { kind: 'invalid' };
  const success = done ? 'done' : 'undone';
  const decide = `SELECT CASE WHEN NOT EXISTS (${member}) THEN 'forbidden' ELSE '${success}' END kind`;
  return mutation(db, [hash, sessionNo, itemId, proofUrl, note], [decide, done
    ? `INSERT INTO gate_checks(account_id,session_no,item_id,state,proof_url,member_note,updated_at)
       SELECT (${member}),?2,?3,'done',?4,?5,${now} WHERE EXISTS (${member})
       ON CONFLICT(account_id,session_no,item_id) DO UPDATE SET state='done',proof_url=excluded.proof_url,member_note=excluded.member_note,instructor_note=NULL,updated_at=excluded.updated_at`
    : `DELETE FROM gate_checks WHERE account_id=(${member}) AND session_no=?2 AND item_id=?3`]);
}

/** The Instructor sends a done item back as needing work with a note, or clears the flag back to done. Member fields stay untouched. */
export async function flag_gate_check(db: AccessDatabase, hash: string | null, memberNickname: string, sessionNo: number, itemId: string,
  needsWork: boolean, note: string | null = null): Promise<Kind> {
  if (!validToken(hash) || nickname(memberNickname) !== memberNickname || !session(sessionNo) || !gateItemId(itemId) || typeof needsWork !== 'boolean' ||
    (needsWork ? note === null || !same(note, gateNote) : note !== null)) return { kind: 'invalid' };
  const target = `SELECT internal_id FROM accounts WHERE nickname=?4 AND status='approved'`;
  const decide = `SELECT CASE WHEN NOT ${instructor} THEN 'forbidden' WHEN NOT EXISTS (${target}) THEN 'missing'
    WHEN NOT EXISTS (SELECT 1 FROM gate_checks WHERE account_id=(${target}) AND session_no=?2 AND item_id=?3
      AND state=CASE WHEN ?5=1 THEN 'done' ELSE 'needs_work' END) THEN 'unchanged'
    ELSE CASE WHEN ?5=1 THEN 'flagged' ELSE 'cleared' END END kind`;
  return mutation(db, [hash, sessionNo, itemId, memberNickname, needsWork ? 1 : 0, note], [decide, needsWork
    ? `UPDATE gate_checks SET state='needs_work',instructor_note=?6,updated_at=${now}
       WHERE account_id=(${target}) AND session_no=?2 AND item_id=?3 AND state='done' AND (${decide})='flagged'`
    : `UPDATE gate_checks SET state='done',instructor_note=NULL,updated_at=${now}
       WHERE account_id=(${target}) AND session_no=?2 AND item_id=?3 AND state='needs_work' AND (${decide})='cleared'`]);
}

/** Every approved member's checks by nickname. Instructor only. */
export async function gates_board(db: AccessDatabase, hash: string | null): Promise<Kind & { members?: Row[] }> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  const row = await db.prepare(`SELECT ${instructor} allowed,
    (SELECT json_group_array(json(m)) FROM (SELECT json_object('nickname',a.nickname,'checks',json((SELECT json_group_array(json(${check('g')}))
      FROM (SELECT * FROM gate_checks WHERE account_id=a.internal_id ORDER BY session_no,item_id) g))) m
      FROM accounts a WHERE a.status='approved' AND a.nickname IS NOT NULL ORDER BY a.nickname_key)) members`)
    .bind(hash).first<{ allowed: number; members: string }>();
  return row?.allowed ? { kind: 'ok', members: JSON.parse(row.members) as Row[] } : { kind: 'forbidden' };
}
