import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { AccessDatabase, D1Statement, D1Result } from '../lib/d1/access.ts';
import * as api from '../lib/d1/collaborate.ts';
import type { JobTerms } from '../lib/collab-core.ts';

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
const terms = (extra: Partial<JobTerms> = {}): JobTerms => ({ title: 'Add a dark mode', description: 'Make the habit screen readable at night.',
  deliverable: 'pull_request', windowDays: 7, money: 120, share: null, projectId: null, milestoneId: null, skills: ['css'],
  criteria: ['Toggle in settings', 'Colors pass contrast'], ...extra });
const job = (sqlite: DatabaseSync, id: string) => sqlite.prepare('SELECT * FROM job_state WHERE id=?').get(id) as Record<string, any>;
const v = (sqlite: DatabaseSync, id: string) => String(job(sqlite, id).version);
const events = (sqlite: DatabaseSync, id: string) => sqlite.prepare('SELECT kind FROM job_events WHERE job_id=? ORDER BY seq').all(id).map((r: any) => r.kind);
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
async function posted(db: AccessDatabase, user = 1, extra: Partial<JobTerms> = {}) {
  const result = await api.job_post(db, hash(user), terms(extra));
  assert.equal(result.kind, 'posted'); return result.id!;
}

test('posting: Members and the Instructor post; shares only from your own product line', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1);
  assert.equal(job(sqlite, id).poster_account_id, 'acc1');
  const funded = await posted(db, 99, { projectId: P2 });
  assert.equal(job(sqlite, funded).poster_is_instructor, 1);
  assert.equal(job(sqlite, funded).poster_account_id, null);
  assert.equal((await api.job_post(db, hash(99), terms({ share: 5, projectId: P1 }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ share: 5, projectId: P2 }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ share: 101, projectId: P1 }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ money: 0 }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ money: null, share: null }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ criteria: [] }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ windowDays: 31 }))).kind, 'invalid');
  assert.equal((await api.job_post(db, hash(1), terms({ share: 5, projectId: P1, money: null }))).kind, 'posted');
  assert.deepEqual(events(sqlite, id), ['posted']);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM job_criteria WHERE job_id=?').get(id)!.n, 2);
});

test('claiming: not your own job, never the Instructor, one claimant, two active claims at most', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1);
  assert.equal((await api.job_claim(db, hash(1), id, '1')).kind, 'forbidden');
  assert.equal((await api.job_claim(db, hash(99), id, '1')).kind, 'forbidden');
  assert.equal((await api.job_claim(db, hash(2), id, '1')).kind, 'claimed');
  assert.equal((await api.job_claim(db, hash(3), id, '2')).kind, 'taken');
  assert.equal((await api.job_claim(db, hash(3), id, '1')).kind, 'taken');
  const a = await posted(db, 1), b = await posted(db, 1);
  assert.equal((await api.job_claim(db, hash(2), a, '1')).kind, 'claimed');
  assert.equal((await api.job_claim(db, hash(2), b, '1')).kind, 'limit');
  assert.equal(job(sqlite, b).state, 'open');
});

test('full lifecycle: deliver locks the tier, changes keep it within 3 days, accept, paid, receipt', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1);
  await api.job_claim(db, hash(2), id, '1');
  assert.equal((await api.job_deliver(db, hash(2), id, v(sqlite, id), 'http://example.com', 'Done')).kind, 'invalid');
  assert.equal((await api.job_deliver(db, hash(3), id, v(sqlite, id), 'https://example.com/pr/1', 'Done')).kind, 'forbidden');
  assert.equal((await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/pr/1', 'Done')).kind, 'delivered');
  assert.equal(job(sqlite, id).locked_tier, 100);
  assert.equal((await api.job_accept(db, hash(2), id, v(sqlite, id))).kind, 'forbidden');
  assert.equal((await api.job_accept(db, hash(3), id, v(sqlite, id))).kind, 'forbidden');
  assert.equal((await api.job_changes(db, hash(1), id, v(sqlite, id), [2], 'Contrast fails on buttons')).kind, 'changes_requested');
  // Late in the window but within 3 days of the change request: the 100% tier holds.
  sqlite.prepare('UPDATE jobs SET claimed_at=?, changes_at=? WHERE id=?').run(ago(10), ago(1), id);
  assert.equal((await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/pr/2', 'Fixed contrast')).kind, 'delivered');
  assert.equal(job(sqlite, id).locked_tier, 100);
  assert.equal((await api.job_accept(db, hash(1), id, '1')).kind, 'stale');
  assert.equal((await api.job_accept(db, hash(1), id, v(sqlite, id))).kind, 'accepted');
  assert.equal(job(sqlite, id).final_tier, 100);
  assert.equal((await api.job_paid(db, hash(1), id, v(sqlite, id), 120, '2026-13-01', null)).kind, 'invalid');
  assert.equal((await api.job_paid(db, hash(1), id, v(sqlite, id), 120, new Date().toISOString().slice(0, 10), 'Sent by bank transfer')).kind, 'paid');
  assert.equal((await api.job_receipt(db, hash(1), id, v(sqlite, id))).kind, 'forbidden');
  assert.equal((await api.job_receipt(db, hash(2), id, v(sqlite, id))).kind, 'receipt_confirmed');
  assert.deepEqual(events(sqlite, id), ['posted', 'claimed', 'delivered', 'changes_requested', 'delivered', 'accepted', 'paid', 'receipt_confirmed']);
  assert.throws(() => sqlite.exec(`UPDATE job_events SET kind='paid' WHERE job_id='${id}'`), /job_events_immutable/);
  assert.throws(() => sqlite.exec(`DELETE FROM job_events WHERE job_id='${id}'`), /job_events_immutable/);
});

test('late delivery pays half, a late resubmission recomputes, rounds are capped, a second reject disputes', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1);
  await api.job_claim(db, hash(2), id, '1');
  sqlite.prepare('UPDATE jobs SET claimed_at=? WHERE id=?').run(ago(8), id);
  await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/a', 'First');
  assert.equal(job(sqlite, id).locked_tier, 50);
  assert.equal((await api.job_reject(db, hash(1), id, v(sqlite, id), 'Nothing meets the criteria')).kind, 'rejected');
  assert.equal(job(sqlite, id).state, 'claimed');
  assert.equal(job(sqlite, id).locked_tier, null);
  await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/b', 'Second');
  await api.job_changes(db, hash(1), id, v(sqlite, id), [1], null);
  await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/c', 'Third');
  await api.job_changes(db, hash(1), id, v(sqlite, id), [1], null);
  await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/d', 'Fourth');
  assert.equal((await api.job_changes(db, hash(1), id, v(sqlite, id), [1], null)).kind, 'rounds');
  assert.equal((await api.job_reject(db, hash(1), id, v(sqlite, id), 'Still nothing')).kind, 'rejected');
  assert.equal(job(sqlite, id).state, 'disputed');
  assert.equal((await api.job_resolve(db, hash(1), id, v(sqlite, id), 'accepted', 50, 'Fair')).kind, 'forbidden');
  assert.equal((await api.job_resolve(db, hash(99), id, v(sqlite, id), 'accepted', 50, 'Half the criteria are met')).kind, 'resolved');
  assert.equal(job(sqlite, id).state, 'accepted');
  assert.equal(job(sqlite, id).final_tier, 50);
});

test('derived state: expiry, auto-acceptance and a revoked claimant need no cron', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1, { windowDays: 2 });
  await api.job_claim(db, hash(2), id, '1');
  assert.equal((await api.job_release(db, hash(1), id, v(sqlite, id))).kind, 'too_early');
  sqlite.prepare('UPDATE jobs SET claimed_at=? WHERE id=?').run(ago(3), id);
  assert.equal(job(sqlite, id).effective_state, 'claimed');
  assert.equal((await api.job_release(db, hash(1), id, v(sqlite, id))).kind, 'released');
  await api.job_claim(db, hash(2), id, v(sqlite, id));
  sqlite.prepare('UPDATE jobs SET claimed_at=? WHERE id=?').run(ago(5), id);
  assert.equal(job(sqlite, id).effective_state, 'open');
  assert.equal(job(sqlite, id).lapse, 'expired');
  assert.equal((await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com', 'Late')).kind, 'invalid');
  assert.equal((await api.job_claim(db, hash(3), id, v(sqlite, id))).kind, 'claimed');
  assert.deepEqual(events(sqlite, id), ['posted', 'claimed', 'released', 'claimed', 'expired', 'claimed']);
  // Revoked claimant: the job reopens at once.
  sqlite.exec("UPDATE accounts SET status='revoked' WHERE internal_id='acc3'");
  assert.equal(job(sqlite, id).effective_state, 'open');
  assert.equal(job(sqlite, id).lapse, 'claimant_left');
  sqlite.exec("UPDATE accounts SET status='approved' WHERE internal_id='acc3'");
  // Auto-acceptance after 7 silent days; the poster records it before marking paid.
  await api.job_deliver(db, hash(3), id, v(sqlite, id), 'https://example.com/x', 'Here it is');
  sqlite.prepare('UPDATE jobs SET delivered_at=? WHERE id=?').run(ago(8), id);
  assert.equal(job(sqlite, id).effective_state, 'accepted');
  assert.equal((await api.job_changes(db, hash(1), id, v(sqlite, id), [1], null)).kind, 'invalid');
  assert.equal((await api.job_paid(db, hash(1), id, v(sqlite, id), 120, new Date().toISOString().slice(0, 10), null)).kind, 'invalid');
  assert.equal((await api.job_accept(db, hash(3), id, v(sqlite, id))).kind, 'accepted');
  assert.equal(job(sqlite, id).state, 'accepted');
  assert.equal(events(sqlite, id).at(-1), 'auto_accepted');
});

test('shares: insufficient line is refused, acceptance activates version N+1 that sums to 100', async () => {
  const { db, sqlite } = fixture();
  sqlite.exec(`INSERT INTO project_team(project_id,account_id,role,status) VALUES('${P1}','acc3','Designer','active')`);
  assert.equal((await api.agreement_propose(db, hash(1), P1, '0', [{ key: 'pixel', role: 'Owner', percent: 80, brings: null },
    { key: 'sprout', role: 'Designer', percent: 20, brings: 'Screens' }])).kind, 'proposed');
  const pending = sqlite.prepare("SELECT id,version FROM share_agreements WHERE status='pending'").get() as any;
  assert.equal((await api.agreement_respond(db, hash(2), P1, pending.id, '1', true)).kind, 'forbidden');
  assert.equal((await api.agreement_respond(db, hash(3), P1, pending.id, '1', true)).kind, 'activated');
  assert.equal((await api.job_post(db, hash(1), terms({ share: 81, money: null, projectId: P1 }))).kind, 'insufficient_share');
  const id = await posted(db, 1, { share: 10, money: null, projectId: P1 });
  await api.job_claim(db, hash(2), id, '1');
  await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com', 'Done');
  // The owner gives share away in the meantime: the job can no longer pay from that line.
  assert.equal((await api.agreement_propose(db, hash(1), P1, '1', [{ key: 'pixel', role: 'Owner', percent: 5, brings: null },
    { key: 'sprout', role: 'Designer', percent: 95, brings: null }])).kind, 'proposed');
  const second = sqlite.prepare("SELECT id FROM share_agreements WHERE status='pending'").get() as any;
  assert.equal((await api.agreement_respond(db, hash(3), P1, second.id, '2', true)).kind, 'activated');
  assert.equal((await api.job_accept(db, hash(1), id, v(sqlite, id))).kind, 'insufficient_share');
  // Back to 80/20 (version 3), then the accept activates version 4.
  await api.agreement_propose(db, hash(1), P1, '2', [{ key: 'pixel', role: 'Owner', percent: 80, brings: null }, { key: 'sprout', role: 'Designer', percent: 20, brings: null }]);
  const third = sqlite.prepare("SELECT id FROM share_agreements WHERE status='pending'").get() as any;
  await api.agreement_respond(db, hash(3), P1, third.id, '3', true);
  assert.equal((await api.job_accept(db, hash(1), id, v(sqlite, id))).kind, 'accepted');
  const active = sqlite.prepare("SELECT * FROM share_agreements WHERE project_id=? AND status='active'").get(P1) as any;
  assert.equal(active.version, 4); assert.equal(active.source, 'job');
  const lines = sqlite.prepare('SELECT account_id,percent FROM share_agreement_lines WHERE agreement_id=? ORDER BY account_id').all(active.id) as any[];
  assert.deepEqual(lines.map(l => [l.account_id, l.percent]), [['acc1', 70], ['acc2', 10], ['acc3', 20]]);
  assert.equal(job(sqlite, id).state, 'paid');
  assert.equal(sqlite.prepare("SELECT status FROM project_team WHERE project_id=? AND account_id='acc2'").get(P1)!.status, 'active');
  // A share-only job counts as paid once the version is active; the claimant confirms it.
  assert.equal((await api.job_receipt(db, hash(2), id, v(sqlite, id))).kind, 'receipt_confirmed');
});

test('agreements: non-listed and stale responses fail; sum and acceptance are enforced by the schema', async () => {
  const { db, sqlite } = fixture();
  assert.equal((await api.agreement_propose(db, hash(1), P1, '0', [{ key: 'sprout', role: 'Designer', percent: 100, brings: null }])).kind, 'not_team');
  assert.equal((await api.agreement_propose(db, hash(2), P1, '0', [{ key: 'pixel', role: 'Owner', percent: 100, brings: null }])).kind, 'forbidden');
  assert.equal((await api.team_invite(db, hash(1), P1, 'Sprout', 'Designer')).kind, 'invited');
  assert.equal((await api.team_invite(db, hash(1), P1, 'sprout', 'Designer')).kind, 'exists');
  assert.equal((await api.team_invite(db, hash(1), P1, 'Nobody', 'Designer')).kind, 'no_member');
  assert.equal((await api.team_invite(db, hash(1), P1, 'Pixel', 'Designer')).kind, 'invalid');
  assert.equal((await api.team_respond(db, hash(2), P1, true)).kind, 'invalid');
  assert.equal((await api.team_respond(db, hash(3), P1, true)).kind, 'joined');
  assert.equal((await api.agreement_propose(db, hash(1), P1, '0', [{ key: 'pixel', role: 'Owner', percent: 50, brings: null },
    { key: 'sprout', role: 'Designer', percent: 50, brings: null }])).kind, 'proposed');
  assert.equal((await api.agreement_propose(db, hash(1), P1, '0', [{ key: 'pixel', role: 'Owner', percent: 100, brings: null }])).kind, 'stale');
  const first = sqlite.prepare("SELECT id FROM share_agreements WHERE status='pending'").get() as any;
  // A new proposal replaces the pending one; answering the old one is stale.
  assert.equal((await api.agreement_propose(db, hash(1), P1, '1', [{ key: 'pixel', role: 'Owner', percent: 60, brings: null },
    { key: 'sprout', role: 'Designer', percent: 40, brings: null }])).kind, 'proposed');
  assert.equal((await api.agreement_respond(db, hash(3), P1, first.id, '1', true)).kind, 'stale');
  const second = sqlite.prepare("SELECT id FROM share_agreements WHERE status='pending'").get() as any;
  assert.equal((await api.agreement_respond(db, hash(3), P1, second.id, '2', false)).kind, 'declined');
  assert.equal(sqlite.prepare('SELECT status FROM share_agreements WHERE id=?').get(second.id)!.status, 'declined');
  assert.equal((await api.agreement_propose(db, hash(1), P1, '2', [{ key: 'pixel', role: 'Owner', percent: 100, brings: null }])).kind, 'activated');
  // Schema: activation with a total other than 100, or without every acceptance, aborts.
  sqlite.exec(`INSERT INTO share_agreements(id,project_id,version,source) VALUES('x','${P1}',9,'proposal')`);
  sqlite.exec("INSERT INTO share_agreement_lines VALUES('x','acc1','Owner',90,NULL)");
  sqlite.exec("INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) VALUES('x','acc1','accepted')");
  assert.throws(() => sqlite.exec(`UPDATE share_agreements SET status='superseded',activated_at='x' WHERE project_id='${P1}' AND status='active'; UPDATE share_agreements SET status='active',activated_at='x' WHERE id='x'`), /agreement_not_ready/);
  assert.throws(() => sqlite.exec("INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) VALUES('x','acc2','accepted')"), /acceptance_not_listed/);
  assert.throws(() => sqlite.exec("UPDATE share_agreement_acceptances SET decision='declined' WHERE agreement_id='x'"), /acceptances_immutable/);
  assert.equal((await api.team_leave(db, hash(3), P1)).kind, 'left');
});

test('visibility, moderation and reads', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1);
  assert.equal((await api.job_moderate(db, hash(1), id, '1', true)).kind, 'forbidden');
  assert.equal((await api.job_moderate(db, hash(99), id, '1', true)).kind, 'hidden');
  assert.equal((await api.collab_job(db, hash(2), id)).kind, 'missing');
  assert.equal(((await api.collab_board(db, hash(2))).jobs as unknown[]).length, 0);
  assert.equal((await api.collab_job(db, hash(1), id)).kind, 'ok');
  assert.equal((await api.job_claim(db, hash(2), id, v(sqlite, id))).kind, 'hidden_job');
  assert.equal((await api.job_moderate(db, hash(99), id, v(sqlite, id), false)).kind, 'restored');
  const board = await api.collab_board(db, hash(2));
  assert.equal((board.jobs as any[])[0].poster, 'Pixel');
  assert.equal(board.viewer, 'member');
  const detail = await api.collab_job(db, hash(2), id) as any;
  assert.equal(detail.job.events, null);
  assert.deepEqual(detail.job.criteria, ['Toggle in settings', 'Colors pass contrast']);
  assert.equal((await api.collab_board(db, hash(4))).kind, 'ok');
  sqlite.exec("UPDATE accounts SET status='revoked' WHERE internal_id='acc4'");
  assert.equal((await api.collab_board(db, hash(4))).kind, 'forbidden');
  const team = await api.collab_team(db, hash(1), P1) as any;
  assert.equal(team.team.isOwner, true);
  assert.deepEqual(team.team.candidates, ['Nova', 'Sprout']);
});

const detailOf = (sqlite: DatabaseSync, id: string) =>
  JSON.parse((sqlite.prepare('SELECT detail FROM job_events WHERE job_id=? ORDER BY seq DESC LIMIT 1').get(id) as any).detail);
async function delivered(db: AccessDatabase, sqlite: DatabaseSync, poster: number, claimant: number, extra: Partial<JobTerms>) {
  const id = await posted(db, poster, extra);
  assert.equal((await api.job_claim(db, hash(claimant), id, '1')).kind, 'claimed');
  assert.equal((await api.job_deliver(db, hash(claimant), id, v(sqlite, id), 'https://example.com/pr', 'Done')).kind, 'delivered');
  return id;
}

test('resolve settles a share from a deleted product as 0 and records the shortfall', async () => {
  const { db, sqlite } = fixture();
  const id = await delivered(db, sqlite, 1, 2, { share: 10, money: 50, projectId: P1 });
  sqlite.exec(`DELETE FROM personal_projects WHERE id='${P1}'`);
  assert.equal((await api.job_accept(db, hash(1), id, v(sqlite, id))).kind, 'project_missing');
  assert.equal((await api.job_dispute(db, hash(1), id, v(sqlite, id), 'The product is gone')).kind, 'disputed');
  assert.equal((await api.job_resolve(db, hash(99), id, v(sqlite, id), 'accepted', 100, 'Money stands, the share cannot')).kind, 'resolved');
  const row = job(sqlite, id);
  assert.equal(row.state, 'accepted'); assert.equal(row.share_granted, 0); assert.equal(row.final_tier, 100);
  assert.deepEqual([detailOf(sqlite, id).share, detailOf(sqlite, id).shortfall], [0, 10]);
  assert.equal((await api.job_paid(db, hash(1), id, v(sqlite, id), 50, new Date().toISOString().slice(0, 10), null)).kind, 'paid');
});

test('resolve settles two 60% jobs as far as the poster line reaches; a granted share cannot be undone', async () => {
  const { db, sqlite } = fixture();
  const a = await delivered(db, sqlite, 1, 2, { share: 60, money: null, projectId: P1 });
  const b = await delivered(db, sqlite, 1, 3, { share: 60, money: null, projectId: P1 });
  assert.equal((await api.job_accept(db, hash(1), a, v(sqlite, a))).kind, 'accepted');
  assert.equal((await api.job_accept(db, hash(1), b, v(sqlite, b))).kind, 'insufficient_share');
  assert.equal((await api.job_dispute(db, hash(1), b, v(sqlite, b), 'My line is too small now')).kind, 'disputed');
  assert.equal((await api.job_resolve(db, hash(99), b, v(sqlite, b), 'paid', 100, 'Settle what the line covers')).kind, 'resolved');
  assert.equal(job(sqlite, b).share_granted, 40);
  assert.equal(job(sqlite, b).receipt_at, null);
  assert.deepEqual([detailOf(sqlite, b).share, detailOf(sqlite, b).shortfall], [40, 20]);
  const active = sqlite.prepare("SELECT id FROM share_agreements WHERE project_id=? AND status='active'").get(P1) as any;
  const lines = sqlite.prepare('SELECT account_id,percent FROM share_agreement_lines WHERE agreement_id=? ORDER BY account_id').all(active.id) as any[];
  assert.deepEqual(lines.map(l => [l.account_id, l.percent]), [['acc2', 60], ['acc3', 40]]);
  // The claimant can still say it did not arrive; open and cancel cannot take a granted share back.
  assert.equal((await api.job_not_received(db, hash(3), b, v(sqlite, b), 'I do not see it')).kind, 'disputed');
  assert.equal(events(sqlite, b).at(-1), 'not_received');
  for (const outcome of ['open', 'cancelled'])
    assert.equal((await api.job_resolve(db, hash(99), b, v(sqlite, b), outcome, null, 'Undo')).kind, 'invalid', outcome);
  assert.equal((await api.job_resolve(db, hash(99), b, v(sqlite, b), 'paid', 100, 'It is in version 3')).kind, 'resolved');
  assert.equal(job(sqlite, b).share_granted, 40);
  assert.equal((await api.job_receipt(db, hash(3), b, v(sqlite, b))).kind, 'receipt_confirmed');
});

test('hidden jobs: parties keep acting; others cannot see or claim', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1);
  await api.job_claim(db, hash(2), id, '1');
  assert.equal((await api.job_moderate(db, hash(99), id, v(sqlite, id), true)).kind, 'hidden');
  assert.equal((await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/pr', 'Done')).kind, 'delivered');
  assert.equal((await api.job_accept(db, hash(1), id, v(sqlite, id))).kind, 'accepted');
  assert.equal((await api.collab_job(db, hash(3), id)).kind, 'missing');
  const other = await posted(db, 1);
  await api.job_moderate(db, hash(99), other, '1', true);
  assert.equal((await api.job_claim(db, hash(3), other, v(sqlite, other))).kind, 'hidden_job');
  assert.equal((await api.job_cancel(db, hash(1), other, v(sqlite, other))).kind, 'cancelled');
});

test('reject clears the delivery time; release works from changes after 3 days; minimum share is 2%', async () => {
  const { db, sqlite } = fixture();
  const id = await delivered(db, sqlite, 1, 2, {});
  assert.equal((await api.job_reject(db, hash(1), id, v(sqlite, id), 'Nothing meets the criteria')).kind, 'rejected');
  assert.equal(job(sqlite, id).delivered_at, null);
  await api.job_deliver(db, hash(2), id, v(sqlite, id), 'https://example.com/b', 'Again');
  assert.equal((await api.job_changes(db, hash(1), id, v(sqlite, id), [2], null)).kind, 'changes_requested');
  assert.equal((await api.job_release(db, hash(1), id, v(sqlite, id))).kind, 'too_early');
  sqlite.prepare('UPDATE jobs SET changes_at=? WHERE id=?').run(ago(4), id);
  assert.equal(job(sqlite, id).effective_state, 'changes');
  assert.equal((await api.job_release(db, hash(1), id, v(sqlite, id))).kind, 'released');
  assert.equal(job(sqlite, id).state, 'open');
  assert.equal((await api.job_post(db, hash(1), terms({ share: 1, money: null, projectId: P1 }))).kind, 'invalid');
  assert.throws(() => sqlite.exec(`UPDATE jobs SET share_percent=1,project_id='${P1}' WHERE id='${id}'`), /CHECK/);
});

test('edit after an expired claim reopens cleanly', async () => {
  const { db, sqlite } = fixture();
  const id = await posted(db, 1, { windowDays: 2 });
  await api.job_claim(db, hash(2), id, '1');
  sqlite.prepare('UPDATE jobs SET claimed_at=? WHERE id=?').run(ago(5), id);
  assert.equal(job(sqlite, id).effective_state, 'open');
  assert.equal((await api.job_edit(db, hash(1), id, v(sqlite, id), terms({ title: 'Add a dark mode, take two' }))).kind, 'edited');
  assert.deepEqual(events(sqlite, id), ['posted', 'claimed', 'expired', 'edited']);
  assert.equal(job(sqlite, id).claimant_account_id, null);
  assert.equal((await api.job_claim(db, hash(3), id, v(sqlite, id))).kind, 'claimed');
});

test('shares consent: a version that lowers an approved holder waits for them; team removal changes nothing', async () => {
  const { db, sqlite } = fixture();
  sqlite.exec(`INSERT INTO project_team(project_id,account_id,role,status) VALUES('${P1}','acc3','Designer','active'),('${P1}','acc4','Writer','active')`);
  await api.agreement_propose(db, hash(1), P1, '0', [{ key: 'pixel', role: 'Owner', percent: 50, brings: null },
    { key: 'sprout', role: 'Designer', percent: 30, brings: null }, { key: 'comet', role: 'Writer', percent: 20, brings: null }]);
  const first = sqlite.prepare("SELECT id FROM share_agreements WHERE status='pending'").get() as any;
  await api.agreement_respond(db, hash(3), P1, first.id, '1', true);
  assert.equal((await api.agreement_respond(db, hash(4), P1, first.id, '1', true)).kind, 'activated');
  // Removing Sprout from the team leaves the active lines as they were.
  assert.equal((await api.team_remove(db, hash(1), P1, 'Sprout')).kind, 'removed');
  const lines = (agreement: string) => (sqlite.prepare('SELECT account_id,percent FROM share_agreement_lines WHERE agreement_id=? ORDER BY account_id').all(agreement) as any[]).map(l => [l.account_id, l.percent]);
  assert.deepEqual(lines(first.id), [['acc1', 50], ['acc3', 30], ['acc4', 20]]);
  // Version 2 drops Sprout: it waits for Sprout even though Sprout is not listed.
  assert.equal((await api.agreement_propose(db, hash(1), P1, '1', [{ key: 'pixel', role: 'Owner', percent: 80, brings: null },
    { key: 'comet', role: 'Writer', percent: 20, brings: null }])).kind, 'proposed');
  const second = sqlite.prepare("SELECT id FROM share_agreements WHERE status='pending'").get() as any;
  assert.equal((await api.agreement_respond(db, hash(4), P1, second.id, '2', true)).kind, 'accepted');
  const board = await api.collab_board(db, hash(3)) as any;
  assert.deepEqual(board.pending.map((p: any) => [p.version, p.myChange]), [[2, { from: 30, to: 0 }]]);
  assert.equal((await api.collab_team(db, hash(3), P1) as any).team.myDecision, 'needed');
  assert.equal((await api.agreement_respond(db, hash(2), P1, second.id, '2', true)).kind, 'forbidden');
  // The schema refuses to activate it behind Sprout's back.
  assert.throws(() => sqlite.exec(`UPDATE share_agreements SET status='active',activated_at='x' WHERE id='${second.id}'`), /agreement_not_ready/);
  assert.equal((await api.agreement_respond(db, hash(3), P1, second.id, '2', true)).kind, 'activated');
  assert.deepEqual(lines(second.id), [['acc1', 80], ['acc4', 20]]);
  // A revoked holder does not block: version 3 drops Comet at once.
  sqlite.exec("UPDATE accounts SET status='revoked' WHERE internal_id='acc4'");
  assert.equal((await api.agreement_propose(db, hash(1), P1, '2', [{ key: 'pixel', role: 'Owner', percent: 100, brings: null }])).kind, 'activated');
});
