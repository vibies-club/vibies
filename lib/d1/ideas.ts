import { validToken } from '../access-core.ts';
import { projectVersion } from '../project-core.ts';
import { optionalText, text, usdAmount, type IdeaFields } from '../collab-core.ts';
import type { AccessDatabase } from './access.ts';
import { actor, bool, instructor, instructorName, me, nick, now, single, uuid, visibleProject, type Kind, type Row } from './collab-sql.ts';

// Ideas, interest, comments and funding. Same shape as jobs: one batch, a decision first, every write guarded on it.
const ok = (decision: string, kind: string) => `(SELECT kind FROM (${decision}))='${kind}'`;
const version = (value: unknown) => projectVersion(value) ? value : null;
const ideaGate = `WHEN ${me} IS NULL THEN 'forbidden' WHEN i.id IS NULL THEN 'missing' WHEN i.hidden=1 THEN 'hidden_idea'`;
const ownerGate = `${ideaGate} WHEN i.author_account_id IS NOT ${me} THEN 'forbidden' WHEN i.version<>CAST(?3 AS INTEGER) THEN 'stale'`;
/** Hidden ideas and comments stay visible to their author and the Instructor only. */
const seesIdea = `(i.hidden=0 OR i.author_account_id=${me} OR ${instructor})`;
const seesComment = `(c.hidden=0 OR c.author_account_id=${me} OR ${instructor})`;
const ideaRow = 'FROM (SELECT 1) LEFT JOIN ideas i ON i.id=?2';
/** Who may see a product's title and funding: the owner, the Instructor, or anyone when it is public. */
const readable = `(p.owner_account_id=${me} OR (${visibleProject}) OR ${instructor})`;

export async function idea_post(db: AccessDatabase, hash: string | null, f: IdeaFields): Promise<Kind & { id?: string }> {
  if (!validToken(hash)) return { kind: 'invalid' };
  const id = crypto.randomUUID();
  const decision = `SELECT CASE WHEN ${me} IS NULL THEN 'forbidden' ELSE 'posted' END kind`;
  const result = await single(db, [hash, id, f.title, f.problem, f.audience, JSON.stringify(f.help), f.stage], decision, [
    `INSERT INTO ideas(id,author_account_id,title,problem,audience,help,stage) SELECT ?2,${me},?3,?4,?5,?6,?7 WHERE ${ok(decision, 'posted')}`]);
  return result.kind === 'posted' ? { kind: 'posted', id } : { kind: result.kind };
}

export async function idea_edit(db: AccessDatabase, hash: string | null, id: string, basis: unknown, f: IdeaFields): Promise<Kind> {
  const v = version(basis);
  if (!validToken(hash) || !uuid(id) || v === null) return { kind: 'invalid' };
  const decision = `SELECT CASE ${ownerGate} ELSE 'edited' END kind ${ideaRow}`;
  return single(db, [hash, id.toLowerCase(), v, f.title, f.problem, f.audience, JSON.stringify(f.help), f.stage], decision, [
    `UPDATE ideas SET title=?4,problem=?5,audience=?6,help=?7,stage=?8,version=version+1,updated_at=${now},activity_at=${now}
      WHERE id=?2 AND ${ok(decision, 'edited')}`]);
}

/** Turns an idea into one of the author's products, or removes the link with an empty project. */
export async function idea_link(db: AccessDatabase, hash: string | null, id: string, basis: unknown, project: unknown): Promise<Kind> {
  const v = version(basis), target = project === '' || project === null ? null : project;
  if (!validToken(hash) || !uuid(id) || v === null || (target !== null && !uuid(target))) return { kind: 'invalid' };
  const decision = `SELECT CASE ${ownerGate}
    WHEN ?4 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM personal_projects WHERE id=?4 AND owner_account_id=${me}) THEN 'invalid'
    WHEN ?4 IS NULL THEN 'unlinked' ELSE 'linked' END kind ${ideaRow}`;
  return single(db, [hash, id.toLowerCase(), v, target && target.toLowerCase()], decision, [
    `UPDATE ideas SET project_id=?4,stage=CASE WHEN ?4 IS NULL THEN stage ELSE 'building' END,version=version+1,updated_at=${now},activity_at=${now}
      WHERE id=?2 AND (SELECT kind FROM (${decision})) IN ('linked','unlinked')`]);
}

export async function idea_interest(db: AccessDatabase, hash: string | null, id: string, role: unknown, note: unknown): Promise<Kind> {
  const r = text(role, 1, 40), n = optionalText(note, 500, true);
  if (!validToken(hash) || !uuid(id) || !r || n === undefined) return { kind: 'invalid' };
  const decision = `SELECT CASE ${ideaGate} WHEN i.author_account_id=${me} THEN 'own_idea' ELSE 'interested' END kind ${ideaRow}`;
  return single(db, [hash, id.toLowerCase(), r, n], decision, [
    `INSERT INTO idea_interest(idea_id,account_id,role,note) SELECT ?2,${me},?3,?4 WHERE ${ok(decision, 'interested')}
      ON CONFLICT(idea_id,account_id) DO UPDATE SET role=excluded.role,note=excluded.note`,
    `UPDATE ideas SET activity_at=${now} WHERE id=?2 AND ${ok(decision, 'interested')}`]);
}

export async function idea_uninterest(db: AccessDatabase, hash: string | null, id: string): Promise<Kind> {
  if (!validToken(hash) || !uuid(id)) return { kind: 'invalid' };
  const decision = `SELECT CASE ${ideaGate}
    WHEN NOT EXISTS (SELECT 1 FROM idea_interest WHERE idea_id=?2 AND account_id=${me}) THEN 'invalid' ELSE 'withdrawn' END kind ${ideaRow}`;
  return single(db, [hash, id.toLowerCase()], decision, [
    `DELETE FROM idea_interest WHERE idea_id=?2 AND account_id=${me} AND ${ok(decision, 'withdrawn')}`]);
}

/** Members and the Instructor comment on ideas. Comments are kept as written. */
export async function comment_post(db: AccessDatabase, hash: string | null, id: string, body: unknown): Promise<Kind> {
  const b = text(body, 1, 1000, true);
  if (!validToken(hash) || !uuid(id) || !b) return { kind: 'invalid' };
  const comment = crypto.randomUUID();
  const decision = `SELECT CASE WHEN NOT ${actor} THEN 'forbidden' WHEN i.id IS NULL THEN 'missing' WHEN i.hidden=1 THEN 'hidden_idea' ELSE 'commented' END kind ${ideaRow}`;
  return single(db, [hash, id.toLowerCase(), b, comment], decision, [
    `INSERT INTO comments(id,target_kind,target_id,author_account_id,author_is_instructor,body)
      SELECT ?4,'idea',?2,${me},CASE WHEN ${me} IS NULL THEN 1 ELSE 0 END,?3 WHERE ${ok(decision, 'commented')}`,
    `UPDATE ideas SET activity_at=${now} WHERE id=?2 AND EXISTS (SELECT 1 FROM comments WHERE id=?4)`]);
}

// ---------- Moderation (Instructor only) ----------

export async function idea_moderate(db: AccessDatabase, hash: string | null, id: string, basis: unknown, hidden: boolean): Promise<Kind> {
  const v = version(basis);
  if (!validToken(hash) || !uuid(id) || v === null || typeof hidden !== 'boolean') return { kind: 'invalid' };
  const outcome = hidden ? 'hidden' : 'restored';
  const decision = `SELECT CASE WHEN NOT ${instructor} THEN 'forbidden' WHEN i.id IS NULL THEN 'missing'
    WHEN i.version<>CAST(?3 AS INTEGER) THEN 'stale' WHEN i.hidden=?4 THEN 'unchanged' ELSE '${outcome}' END kind ${ideaRow}`;
  return single(db, [hash, id.toLowerCase(), v, hidden ? 1 : 0], decision, [
    `UPDATE ideas SET hidden=?4,version=version+1,updated_at=${now} WHERE id=?2 AND ${ok(decision, outcome)}`]);
}

export async function comment_moderate(db: AccessDatabase, hash: string | null, idea: string, comment: string, hidden: boolean): Promise<Kind> {
  if (!validToken(hash) || !uuid(idea) || !uuid(comment) || typeof hidden !== 'boolean') return { kind: 'invalid' };
  const outcome = hidden ? 'comment_hidden' : 'comment_restored';
  const decision = `SELECT CASE WHEN NOT ${instructor} THEN 'forbidden' WHEN c.id IS NULL THEN 'missing'
    WHEN c.hidden=?4 THEN 'unchanged' ELSE '${outcome}' END kind
    FROM (SELECT 1) LEFT JOIN comments c ON c.id=?3 AND c.target_kind='idea' AND c.target_id=?2`;
  return single(db, [hash, idea.toLowerCase(), comment.toLowerCase(), hidden ? 1 : 0], decision, [
    `UPDATE comments SET hidden=?4 WHERE id=?3 AND ${ok(decision, outcome)}`]);
}

// ---------- Funding ----------

const projectRow = 'FROM (SELECT 1) LEFT JOIN personal_projects p ON p.id=?2 LEFT JOIN project_funding f ON f.project_id=p.id';

/** The owner turns "Seeking funding" on or off. Turning it off keeps the goal and every pledge. */
export async function funding_set(db: AccessDatabase, hash: string | null, project: string, basis: unknown, seeking: boolean, goal: unknown): Promise<Kind> {
  const v = basis === '0' ? '0' : version(basis), amount = goal === null || goal === undefined || goal === '' ? null : usdAmount(goal);
  if (!validToken(hash) || !uuid(project) || v === null || (seeking && amount === null) || (goal && amount === null)) return { kind: 'invalid' };
  const decision = `SELECT CASE WHEN p.id IS NULL THEN 'missing' WHEN p.owner_account_id IS NOT ${me} THEN 'forbidden'
    WHEN coalesce(f.version,0)<>CAST(?3 AS INTEGER) THEN 'stale' ELSE 'saved' END kind ${projectRow}`;
  return single(db, [hash, project.toLowerCase(), v, seeking ? 1 : 0, amount], decision, [
    `INSERT INTO project_funding(project_id,seeking,goal_usd) SELECT ?2,?4,?5 WHERE ${ok(decision, 'saved')}
      ON CONFLICT(project_id) DO UPDATE SET seeking=excluded.seeking,goal_usd=coalesce(excluded.goal_usd,goal_usd),
      version=version+1,updated_at=${now}`]);
}

export async function pledge_post(db: AccessDatabase, hash: string | null, project: string, amount: unknown, note: unknown): Promise<Kind> {
  const a = usdAmount(amount), n = optionalText(note, 500, true);
  if (!validToken(hash) || !uuid(project) || a === null || n === undefined) return { kind: 'invalid' };
  const decision = `SELECT CASE WHEN NOT ${actor} THEN 'forbidden' WHEN p.id IS NULL OR NOT ${readable} THEN 'missing'
    WHEN p.owner_account_id=${me} THEN 'own_project' WHEN coalesce(f.seeking,0)=0 THEN 'not_seeking' ELSE 'pledged' END kind ${projectRow}`;
  return single(db, [hash, project.toLowerCase(), crypto.randomUUID(), a, n], decision, [
    `INSERT INTO pledges(id,project_id,pledger_account_id,pledger_is_instructor,amount_usd,note)
      SELECT ?3,?2,${me},CASE WHEN ${me} IS NULL THEN 1 ELSE 0 END,?4,?5 WHERE ${ok(decision, 'pledged')}`]);
}

/** The pledger withdraws an open pledge, or the owner records it as received outside the site. */
export async function pledge_close(db: AccessDatabase, hash: string | null, project: string, pledge: string, outcome: 'withdrawn' | 'received'): Promise<Kind> {
  if (!validToken(hash) || !uuid(project) || !uuid(pledge) || !['withdrawn', 'received'].includes(outcome)) return { kind: 'invalid' };
  const allowed = outcome === 'withdrawn'
    ? `(g.pledger_account_id=${me} OR (g.pledger_is_instructor=1 AND ${instructor}))`
    : `(SELECT owner_account_id FROM personal_projects WHERE id=g.project_id)=${me}`;
  const decision = `SELECT CASE WHEN NOT ${actor} THEN 'forbidden' WHEN g.id IS NULL THEN 'missing' WHEN NOT coalesce(${allowed},0) THEN 'forbidden'
    WHEN g.status<>'pledged' THEN 'invalid' ELSE '${outcome}' END kind FROM (SELECT 1) LEFT JOIN pledges g ON g.id=?2 AND g.project_id=?3`;
  return single(db, [hash, pledge.toLowerCase(), project.toLowerCase()], decision, [
    `UPDATE pledges SET status='${outcome}',closed_at=${now} WHERE id=?2 AND ${ok(decision, outcome)}`]);
}

// ---------- Reads ----------

const projectTitle = (column: string) => `(SELECT CASE WHEN ${readable} THEN p.title END FROM personal_projects p WHERE p.id=${column})`;
const ideaSummary = `'id',i.id,'title',i.title,'problem',i.problem,'audience',i.audience,'help',json(i.help),'stage',i.stage,
  'author',${nick('i.author_account_id')},'isMine',${bool(`i.author_account_id=${me}`)},'projectId',i.project_id,'projectTitle',${projectTitle('i.project_id')},
  'interestCount',(SELECT count(*) FROM idea_interest x JOIN accounts a ON a.internal_id=x.account_id AND a.status='approved' WHERE x.idea_id=i.id),
  'commentCount',(SELECT count(*) FROM comments c WHERE c.target_kind='idea' AND c.target_id=i.id AND ${seesComment}),
  'hidden',${bool('i.hidden=1')},
  'interested',${bool(`EXISTS (SELECT 1 FROM idea_interest WHERE idea_id=i.id AND account_id=${me})`)},
  'createdAt',i.created_at,'activityAt',i.activity_at`;

export async function ideas_feed(db: AccessDatabase, hash: string | null): Promise<Kind & Row> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  const row = await db.prepare(`SELECT CASE WHEN ${me} IS NOT NULL THEN 'member' ELSE 'instructor' END viewer,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object(${ideaSummary}) item FROM ideas i WHERE ${seesIdea} ORDER BY i.activity_at DESC, i.id)) ideas
    WHERE ${actor}`).bind(hash).first<Row>();
  if (!row) return { kind: 'forbidden' };
  return { kind: 'ok', viewer: row.viewer, ideas: JSON.parse(row.ideas as string) };
}

export async function idea_page(db: AccessDatabase, hash: string | null, id: string): Promise<Kind & Row> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  if (!uuid(id)) return { kind: 'missing' };
  const row = await db.prepare(`SELECT CASE WHEN ${actor} THEN 1 ELSE 0 END authorized,
    CASE WHEN ${me} IS NOT NULL THEN 'member' ELSE 'instructor' END viewer,
    (SELECT json_object(${ideaSummary},'version',CAST(i.version AS TEXT),
      'interest',json((SELECT json_group_array(json_object('nickname',a.nickname,'role',x.role,'note',x.note,'at',x.created_at,
        'team',(SELECT status FROM project_team WHERE project_id=i.project_id AND account_id=x.account_id AND status IN ('invited','active'))))
        FROM (SELECT * FROM idea_interest WHERE idea_id=i.id ORDER BY created_at) x JOIN accounts a ON a.internal_id=x.account_id AND a.status='approved')),
      'mine',(SELECT json_object('role',role,'note',note) FROM idea_interest WHERE idea_id=i.id AND account_id=${me}),
      'myTeam',(SELECT status FROM project_team WHERE project_id=i.project_id AND account_id=${me} AND status IN ('invited','active')),
      'comments',json((SELECT json_group_array(json_object('id',c.id,'hidden',${bool('c.hidden=1')},'author',CASE WHEN c.author_is_instructor=1 THEN ${instructorName} ELSE ${nick('c.author_account_id')} END,
        'byInstructor',${bool('c.author_is_instructor=1')},'body',c.body,'at',c.created_at))
        FROM (SELECT * FROM comments WHERE target_kind='idea' AND target_id=i.id ORDER BY created_at, id) c WHERE ${seesComment})),
      'products',CASE WHEN i.author_account_id=${me} THEN json((SELECT json_group_array(json_object('id',id,'title',title))
        FROM (SELECT id,title FROM personal_projects WHERE owner_account_id=${me} ORDER BY created_at,id))) END)
      FROM ideas i WHERE i.id=?2 AND ${seesIdea}) idea`).bind(hash, id.toLowerCase()).first<Row>();
  if (!row?.authorized) return { kind: 'forbidden' };
  if (!row.idea) return { kind: 'missing' };
  return { kind: 'ok', viewer: row.viewer, idea: JSON.parse(row.idea as string) };
}

/** Funding on a product page. Totals are visible to every reader; single pledges only to the owner and the pledger. */
export async function project_funding(db: AccessDatabase, hash: string | null, project: string): Promise<Kind & Row> {
  if (!validToken(hash)) return { kind: 'forbidden' };
  if (!uuid(project)) return { kind: 'missing' };
  const mine = `(g.pledger_account_id=${me} OR (g.pledger_is_instructor=1 AND ${instructor}))`;
  const row = await db.prepare(`SELECT CASE WHEN ${actor} THEN 1 ELSE 0 END authorized,
    (SELECT json_object('projectId',p.id,'isOwner',${bool(`p.owner_account_id=${me}`)},'seeking',${bool('coalesce(f.seeking,0)=1')},
      'goal',f.goal_usd,'version',CAST(coalesce(f.version,0) AS TEXT),
      'pledged',(SELECT coalesce(sum(amount_usd),0) FROM pledges WHERE project_id=p.id AND status IN ('pledged','received')),
      'received',(SELECT coalesce(sum(amount_usd),0) FROM pledges WHERE project_id=p.id AND status='received'),
      'backers',(SELECT count(DISTINCT coalesce(pledger_account_id,'instructor')) FROM pledges WHERE project_id=p.id AND status IN ('pledged','received')),
      'pledges',json((SELECT json_group_array(json_object('id',g.id,'pledger',CASE WHEN g.pledger_is_instructor=1 THEN ${instructorName} ELSE ${nick('g.pledger_account_id')} END,
        'amount',g.amount_usd,'note',g.note,'status',g.status,'at',g.created_at,'closedAt',g.closed_at,'mine',${bool(mine)}))
        FROM (SELECT * FROM pledges WHERE project_id=p.id ORDER BY created_at DESC, id) g WHERE p.owner_account_id=${me} OR ${mine})))
      FROM personal_projects p LEFT JOIN project_funding f ON f.project_id=p.id WHERE p.id=?2 AND ${readable}) funding`)
    .bind(hash, project.toLowerCase()).first<Row>();
  if (!row?.authorized) return { kind: 'forbidden' };
  if (!row.funding) return { kind: 'missing' };
  return { kind: 'ok', funding: JSON.parse(row.funding as string) };
}
