import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { AccessDatabase, D1Statement, D1Result } from '../lib/d1/access.ts';
import * as api from '../lib/d1/ideas.ts';
import * as collab from '../lib/d1/collaborate.ts';
import type { IdeaFields } from '../lib/collab-core.ts';

const hash = (id: number) => id.toString(16).padStart(64, '0');
class Statement implements D1Statement {
  readonly db: DatabaseSync; readonly sql: string; readonly args: SQLInputValue[];
  constructor(db: DatabaseSync, sql: string, args: SQLInputValue[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args: unknown[]) { return new Statement(this.db, this.sql, args as SQLInputValue[]); }
  execute<T>(): D1Result<T> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.columns().length ? stmt.all(...this.args) as T[] : (stmt.run(...this.args), []);
    return { success: true, results };
  }
  async all<T>() { return this.execute<T>(); }
  async first<T>() { return this.execute<T>().results[0] ?? null; }
  async run() { return this.execute<Record<string, unknown>>(); }
}
const P1 = 'aaaaaaaa-1111-4111-8111-111111111111', P2 = 'bbbbbbbb-2222-4222-8222-222222222222';
// Synthetic people: 1 Pixel (owns P1), 2 Nova (owns P2), 3 Sprout, 4 Comet (revoked later in tests), 99 the Instructor.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../d1/migrations/', import.meta.url)).sort())
    if (file.endsWith('.sql')) sqlite.exec(readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8'));
  sqlite.exec("UPDATE community SET instructor_github_id='99',instructor_nickname='Hivekeeper',instructor_nickname_key='hivekeeper'");
  ['Pixel', 'Nova', 'Sprout', 'Comet'].forEach((name, index) => {
    const id = index + 1;
    sqlite.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,'approved')")
      .run(`acc${id}`, String(id), `member${id}`, name, name.toLowerCase());
    sqlite.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').run(hash(id), String(id));
  });
  sqlite.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').run(hash(99), '99');
  sqlite.exec(`INSERT INTO personal_projects(id,owner_account_id,repository_id,title,summary,publication) VALUES
    ('${P1}','acc1','101','Habit Hive','Synthetic','Published'),('${P2}','acc2','102','Recipe Swap','Synthetic','Published')`);
  const db: AccessDatabase = {
    prepare: sql => new Statement(sqlite, sql),
    async batch<T>(statements: D1Statement[]) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(stmt => (stmt as Statement).execute<T>()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, db };
}
const fields = (extra: Partial<IdeaFields> = {}): IdeaFields => ({ title: 'Swap leftovers', problem: 'Students throw away food every week.',
  audience: 'Students in shared flats', help: ['designer', 'funding'], stage: 'idea', ...extra });
const idea = (sqlite: DatabaseSync, id: string) => sqlite.prepare('SELECT * FROM ideas WHERE id=?').get(id) as Record<string, any>;
const v = (sqlite: DatabaseSync, id: string) => String(idea(sqlite, id).version);
async function shared(db: AccessDatabase, user = 1) {
  const result = await api.idea_post(db, hash(user), fields());
  assert.equal(result.kind, 'posted'); return result.id!;
}

test('ideas: members share and edit their own; the Instructor and strangers cannot; stale versions are refused', async () => {
  const { db, sqlite } = fixture();
  assert.equal((await api.idea_post(db, hash(99), fields())).kind, 'forbidden');
  assert.equal((await api.idea_post(db, hash(5), fields())).kind, 'forbidden');
  assert.equal((await api.idea_post(db, 'short', fields())).kind, 'invalid');
  const id = await shared(db, 1);
  assert.equal(idea(sqlite, id).author_account_id, 'acc1');
  assert.equal((await api.idea_edit(db, hash(2), id, '1', fields({ title: 'Mine now' }))).kind, 'forbidden');
  assert.equal((await api.idea_edit(db, hash(99), id, '1', fields())).kind, 'forbidden');
  assert.equal((await api.idea_edit(db, hash(1), id, '1', fields({ stage: 'exploring' }))).kind, 'edited');
  assert.equal((await api.idea_edit(db, hash(1), id, '1', fields({ stage: 'building' }))).kind, 'stale');
  assert.equal(idea(sqlite, id).stage, 'exploring');
  assert.throws(() => sqlite.exec(`UPDATE ideas SET help='["investor"]' WHERE id='${id}'`), /idea_help/);
  assert.throws(() => sqlite.exec(`DELETE FROM ideas WHERE id='${id}'`), /ideas_are_kept/);
  assert.equal((await api.idea_edit(db, hash(1), '00000000-0000-4000-8000-000000000000', '1', fields())).kind, 'missing');
});

test('ideas: interest, comments and linking a product, with activity order', async () => {
  const { db, sqlite } = fixture();
  const first = await shared(db, 1), second = await shared(db, 2);
  assert.equal((await api.idea_interest(db, hash(1), first, 'Designer', null)).kind, 'own_idea');
  assert.equal((await api.idea_interest(db, hash(99), first, 'Designer', null)).kind, 'forbidden');
  assert.equal((await api.idea_interest(db, hash(2), first, 'Designer', 'I can do the screens')).kind, 'interested');
  assert.equal((await api.idea_interest(db, hash(2), first, 'Builder', null)).kind, 'interested');
  assert.equal((sqlite.prepare('SELECT role FROM idea_interest WHERE idea_id=?').get(first) as any).role, 'Builder');
  sqlite.exec("UPDATE ideas SET activity_at='2026-01-01T00:00:00.000Z'");
  assert.equal((await api.comment_post(db, hash(99), second, 'Talk to the canteen first.')).kind, 'commented');
  assert.equal((await api.comment_post(db, hash(3), second, '   ')).kind, 'invalid');
  const feed = await api.ideas_feed(db, hash(3)) as any;
  assert.deepEqual(feed.ideas.map((i: any) => i.id), [second, first]);
  const page = await api.idea_page(db, hash(1), second) as any;
  assert.equal(page.idea.comments[0].author, 'Hivekeeper'); assert.equal(page.idea.comments[0].byInstructor, true);
  assert.throws(() => sqlite.exec("UPDATE comments SET body='edited'"), /comments_immutable/);
  assert.equal((await api.idea_uninterest(db, hash(2), first)).kind, 'withdrawn');
  assert.equal((await api.idea_uninterest(db, hash(2), first)).kind, 'invalid');

  assert.equal((await api.idea_link(db, hash(1), first, v(sqlite, first), P2)).kind, 'invalid');
  assert.equal((await api.idea_link(db, hash(2), first, v(sqlite, first), P1)).kind, 'forbidden');
  assert.equal((await api.idea_link(db, hash(1), first, v(sqlite, first), P1)).kind, 'linked');
  assert.equal(idea(sqlite, first).stage, 'building');
  await api.idea_interest(db, hash(3), first, 'Tester', null);
  assert.equal((await collab.team_invite(db, hash(1), P1, 'Sprout', 'Tester')).kind, 'invited');
  const linked = await api.idea_page(db, hash(3), first) as any;
  assert.equal(linked.idea.projectTitle, 'Habit Hive'); assert.equal(linked.idea.myTeam, 'invited');
  assert.equal(linked.idea.interest[0].team, 'invited'); assert.equal(linked.idea.products, null);
  sqlite.exec(`DELETE FROM personal_projects WHERE id='${P1}'`);
  assert.equal(idea(sqlite, first).project_id, null);
});

test('funding: owner sets a goal; members and the Instructor pledge; totals are shared and single pledges are private', async () => {
  const { db, sqlite } = fixture();
  assert.equal((await api.pledge_post(db, hash(3), P1, '50', null)).kind, 'not_seeking');
  assert.equal((await api.funding_set(db, hash(2), P1, '0', true, '500')).kind, 'forbidden');
  assert.equal((await api.funding_set(db, hash(1), P1, '0', true, null)).kind, 'invalid');
  assert.equal((await api.funding_set(db, hash(1), P1, '0', true, '$1,500')).kind, 'saved');
  assert.equal((await api.funding_set(db, hash(1), P1, '0', false, null)).kind, 'stale');
  assert.equal((await api.pledge_post(db, hash(1), P1, '50', null)).kind, 'own_project');
  assert.equal((await api.pledge_post(db, hash(3), P1, '0', null)).kind, 'invalid');
  assert.equal((await api.pledge_post(db, hash(3), P1, '2000000', null)).kind, 'invalid');
  assert.equal((await api.pledge_post(db, hash(3), P1, '200', 'After payday')).kind, 'pledged');
  assert.equal((await api.pledge_post(db, hash(99), P1, '300', null)).kind, 'pledged');
  assert.equal((await api.pledge_post(db, hash(4), P1, '50', null)).kind, 'pledged');
  const pledges = sqlite.prepare('SELECT id,pledger_account_id p,pledger_is_instructor i FROM pledges ORDER BY amount_usd').all() as any[];
  const [small, mid, big] = pledges;
  assert.equal(big.i, 1);
  assert.equal((await api.pledge_close(db, hash(3), small.id, 'withdrawn')).kind, 'forbidden');
  assert.equal((await api.pledge_close(db, hash(4), small.id, 'withdrawn')).kind, 'withdrawn');
  assert.equal((await api.pledge_close(db, hash(4), small.id, 'withdrawn')).kind, 'invalid');
  assert.equal((await api.pledge_close(db, hash(3), mid.id, 'received')).kind, 'forbidden');
  assert.equal((await api.pledge_close(db, hash(1), mid.id, 'received')).kind, 'received');
  assert.equal((await api.pledge_close(db, hash(99), big.id, 'withdrawn')).kind, 'withdrawn');
  assert.throws(() => sqlite.exec(`UPDATE pledges SET status='pledged' WHERE id='${mid.id}'`), /pledge_transition|CHECK/);
  assert.throws(() => sqlite.exec(`UPDATE pledges SET amount_usd=1 WHERE id='${mid.id}'`), /pledge_immutable/);
  assert.throws(() => sqlite.exec(`DELETE FROM pledges WHERE id='${mid.id}'`), /pledges_are_kept/);
  const owner = (await api.project_funding(db, hash(1), P1) as any).funding;
  assert.equal(owner.goal, 1500); assert.equal(owner.pledged, 200); assert.equal(owner.received, 200); assert.equal(owner.pledges.length, 3);
  const other = (await api.project_funding(db, hash(4), P1) as any).funding;
  assert.equal(other.pledged, 200); assert.equal(other.backers, 1); assert.deepEqual(other.pledges.map((p: any) => p.status), ['withdrawn']);
  assert.equal((await api.funding_set(db, hash(1), P1, '1', false, null)).kind, 'saved');
  assert.equal((sqlite.prepare('SELECT goal_usd g FROM project_funding').get() as any).g, 1500);
  assert.equal((await api.pledge_post(db, hash(3), P1, '20', null)).kind, 'not_seeking');
});
