import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(new URL('../d1/migrations/', import.meta.url)).sort()) {
    if (file.endsWith('.sql')) db.exec(readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8'));
  }
  return db;
}
function account(db, id, status = 'unapproved', nickname = null, key = nickname?.toLowerCase() ?? null) {
  db.prepare('INSERT INTO accounts(internal_id,github_id,github_username,status,nickname,nickname_key) VALUES(?,?,?,?,?,?)').run(`account-${id}`, String(id), `member${id}`, status, nickname, key);
}
function project(db, id, owner = 'account-1') {
  db.prepare('INSERT INTO personal_projects(id,owner_account_id,repository_id,title,summary) VALUES(?,?,?,?,?)').run(`project-${id}`, owner, String(id), 'Project', 'Work in progress');
}

test('fresh schema retains all ten source tables and starts private access disabled', () => {
  const db = fixture();
  try {
    const names = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(x => x.name));
    for (const name of ['_ownership','community','accounts','sessions','sign_in_flows','sign_in_attempts','instructor_audit','personal_projects','project_milestones','demo_projects']) assert(names.has(name), name);
    assert.equal(db.prepare('SELECT state FROM deployment_activation').get().state, 'disabled');
    assert.throws(() => db.exec("UPDATE deployment_activation SET state='active'"));
    assert.throws(() => db.exec('DELETE FROM deployment_activation'));
    assert.throws(() => db.exec('INSERT INTO community(singleton) VALUES(2)'));
    db.exec("UPDATE deployment_activation SET state='reconciled',environment_id='synthetic',snapshot_hash='fixture',reconciled_at='2026-10-15T00:00:00Z'");
    db.exec("UPDATE deployment_activation SET state='active',activated_at='2026-10-15T00:00:01Z'");
    assert.throws(() => db.exec("UPDATE deployment_activation SET state='disabled'"));
  } finally { db.close(); }
});

test('member capacity is enforced for inserts and reapproval while revoked nicknames stay reserved', () => {
  const db = fixture();
  try {
    for (let id = 1; id <= 8; id++) account(db, id, 'approved', `Member ${id}`);
    assert.throws(() => account(db, 9, 'approved', 'Ninth'), /member_capacity/);
    account(db, 9, 'revoked', 'Ninth');
    assert.throws(() => db.exec("UPDATE accounts SET status='approved' WHERE github_id='9'"), /member_capacity/);
    db.exec("UPDATE accounts SET status='revoked' WHERE github_id='1'");
    db.exec("UPDATE accounts SET status='approved' WHERE github_id='9'");
    assert.throws(() => account(db, 10, 'revoked', 'MEMBER 1'), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO accounts(internal_id,github_id,github_username,status) VALUES('bad','bad','bad','approved')"));
  } finally { db.close(); }
});

test('explicit Unicode keys enforce collisions including the Instructor namespace', () => {
  const db = fixture();
  try {
    db.exec("UPDATE community SET instructor_github_id='99',instructor_nickname='Instructör',instructor_nickname_key='instructör'");
    assert.throws(() => account(db, 1, 'approved', 'INSTRUCTÖR', 'instructör'), /nickname_reserved/);
    account(db, 1, 'approved', 'Élan', 'élan');
    assert.throws(() => account(db, 2, 'revoked', 'ÉLAN', 'élan'), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE community SET instructor_nickname='Élan',instructor_nickname_key='élan'"), /nickname_reserved/);
    assert.throws(() => db.exec("UPDATE accounts SET nickname_key=NULL WHERE github_id='1'"));
  } finally { db.close(); }
});

test('project ownership, capacity, finite states and repository identity are constrained', () => {
  const db = fixture();
  try {
    account(db, 1); account(db, 2);
    for (let id = 1; id <= 3; id++) project(db, id);
    assert.throws(() => project(db, 4), /project_capacity/);
    project(db, 4, 'account-2');
    assert.throws(() => db.exec("UPDATE personal_projects SET owner_account_id='account-1' WHERE id='project-4'"), /project_capacity/);
    assert.throws(() => project(db, 5, 'missing'), /FOREIGN KEY/);
    assert.throws(() => db.exec("UPDATE personal_projects SET repository_id='1' WHERE id='project-4'"), /UNIQUE/);
    for (const [column, value] of [['publication','Public'],['connection','Unknown'],['moderation','Removed'],['version','0']]) {
      assert.throws(() => db.prepare(`UPDATE personal_projects SET ${column}=? WHERE id='project-1'`).run(value));
    }
    assert.throws(() => db.exec("DELETE FROM accounts WHERE internal_id='account-1'"), /FOREIGN KEY/);
  } finally { db.close(); }
});

test('milestones enforce 20 positions, completion semantics, safe atomic reorder and delete cascades', () => {
  const db = fixture();
  try {
    account(db, 1); project(db, 1);
    const insert = db.prepare('INSERT INTO project_milestones(id,project_id,title,position) VALUES(?,?,?,?)');
    for (let position = 1; position <= 20; position++) insert.run(`milestone-${position}`, 'project-1', `Step ${position}`, position);
    assert.throws(() => insert.run('overflow', 'project-1', 'Overflow', 21));
    assert.throws(() => insert.run('duplicate', 'project-1', 'Duplicate', 1), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE project_milestones SET completed=1,blocked_note='Wait' WHERE id='milestone-1'"));
    const before = db.prepare('SELECT * FROM project_milestones WHERE position <= 2 ORDER BY position').all();
    const restore = db.prepare('INSERT INTO project_milestones(id,project_id,title,completed,blocked_note,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
    db.exec('BEGIN');
    db.exec("DELETE FROM project_milestones WHERE project_id='project-1' AND position <= 2");
    for (const row of before) restore.run(row.id,row.project_id,row.title,row.completed,row.blocked_note,3-row.position,row.created_at,row.updated_at);
    db.exec('COMMIT');
    for (const row of before) {
      const after = db.prepare('SELECT * FROM project_milestones WHERE id=?').get(row.id);
      assert.deepEqual({...after,position:row.position}, {...row});
    }
    db.exec("DELETE FROM personal_projects WHERE id='project-1'");
    assert.equal(db.prepare('SELECT count(*) AS n FROM project_milestones').get().n, 0);
  } finally { db.close(); }
});

test('batch-style rollback prevents partial mutation and imported IDs/timestamps retain precision', () => {
  const db = fixture();
  try {
    account(db, 1); project(db, 1);
    const timestamp = '2026-10-15T00:00:00.123456Z';
    db.prepare('INSERT INTO sessions(session_hash,github_id,created_at) VALUES(?,?,?)').run('session','1',timestamp);
    assert.equal(db.prepare('SELECT created_at,auth_provider FROM sessions').get().created_at,timestamp);
    assert.equal(db.prepare('SELECT auth_provider FROM sessions').get().auth_provider,'legacy');
    db.exec("INSERT INTO sign_in_attempts(id,browser_hash) VALUES(100,'synthetic'); INSERT INTO sign_in_attempts(browser_hash) VALUES('synthetic')");
    assert.equal(db.prepare('SELECT max(id) AS id FROM sign_in_attempts').get().id,101);
    db.exec('BEGIN');
    try {
      db.exec("UPDATE personal_projects SET publication='Published' WHERE id='project-1'");
      db.exec("UPDATE accounts SET status='invalid' WHERE github_id='1'");
      assert.fail('constraint should abort statement');
    } catch {
      db.exec('ROLLBACK');
    }
    assert.equal(db.prepare('SELECT publication FROM personal_projects').get().publication,'Draft');
    db.exec("INSERT INTO instructor_audit(new_github_id,reason) VALUES('99','Synthetic recovery'); DELETE FROM accounts WHERE github_id='2'");
    assert.equal(db.prepare('SELECT count(*) AS n FROM instructor_audit').get().n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

// Real independent SQLite connections contend for the last place; a read-then-write
// check outside the database would allow both applicants to observe seven members.
test('concurrent approvals cannot claim the same eighth Member place', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vibies-d1-schema-'));
  const path = join(directory, 'capacity.sqlite');
  const db = new DatabaseSync(path);
  try {
    for (const file of readdirSync(new URL('../d1/migrations/', import.meta.url)).sort()) {
      if (file.endsWith('.sql')) db.exec(readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8'));
    }
    for (let id = 1; id <= 7; id++) account(db,id,'approved',`Member ${id}`);
    account(db,8); account(db,9);
    const contenders = [8,9].map(id => new Promise((resolve,reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(workerData.path);
        db.exec('PRAGMA busy_timeout=5000');
        parentPort.postMessage('ready');
        parentPort.once('message', () => {
          try {
            db.prepare("UPDATE accounts SET status='approved',nickname=?,nickname_key=? WHERE github_id=?").run('Member '+workerData.id,'member '+workerData.id,String(workerData.id));
            parentPort.postMessage('approved');
          } catch(error) { parentPort.postMessage(error.message); }
          finally { db.close(); }
        });
      `, {eval:true, workerData:{path,id}});
      worker.on('error',reject);
      worker.on('message',message => {
        if (message === 'ready') worker.postMessage('approve');
        else resolve(message);
      });
    }));
    const outcomes = await Promise.all(contenders);
    assert.equal(outcomes.filter(value => value === 'approved').length,1);
    assert.equal(outcomes.filter(value => value.includes('member_capacity')).length,1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM accounts WHERE status='approved'").get().n,8);
  } finally { db.close(); rmSync(directory,{recursive:true,force:true}); }
});


test('destination identity is operator-created, singleton and immutable', () => {
  const db = fixture();
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM deployment_identity').get().n, 0);
    const insert = db.prepare('INSERT INTO deployment_identity(account_id,database_id,environment_id) VALUES(?,?,?)');
    assert.throws(() => insert.run('bad', 'bad', 'production'));
    insert.run('a'.repeat(32), '00000000-0000-0000-0000-000000000001', 'staging');
    assert.throws(() => insert.run('a'.repeat(32), '00000000-0000-0000-0000-000000000002', 'production'));
    assert.throws(() => db.exec("UPDATE deployment_identity SET environment_id='production'"), /destination_identity_immutable/);
    assert.throws(() => db.exec('DELETE FROM deployment_identity'), /destination_identity_required/);
  } finally { db.close(); }
});

test('gate checks belong to an account and keep sessions, ids, states, proof links and notes bounded', () => {
  const db = fixture();
  try {
    account(db, 1, 'approved', 'Member 1');
    const check = (session, item, state = 'done', proof = null, note = null, owner = 'account-1', flag = null) =>
      db.prepare("INSERT INTO gate_checks(account_id,session_no,item_id,state,proof_url,member_note,instructor_note,updated_at) VALUES(?,?,?,?,?,?,?,'2026-10-23T00:00:00Z')").run(owner, session, item, state, proof, note, flag);
    check(18, 's18-deploy', 'done', 'https://example.com/proof', 'Shipped.');
    check(18, 's18-readme', 'needs_work', null, 'Done, I think.', 'account-1', 'Add one line about what it does.');
    assert.throws(() => check(18, 's18-deploy'), /UNIQUE|PRIMARY/);
    assert.throws(() => check(18, 'x', 'done', null, null, 'account-missing'), /FOREIGN KEY/);
    for (const session of [0, 31, 18.5]) assert.throws(() => check(session, `n-${String(session).replace('.', '')}`), /CHECK/, String(session));
    for (const item of ['', 'a'.repeat(41), 'S18', 's18 deploy', 's18_deploy']) assert.throws(() => check(17, item), /CHECK/, item);
    assert.throws(() => check(17, 'state', 'verified'), /CHECK/);
    for (const proof of ['http://example.com', 'javascript:alert(1)', `https://${'a'.repeat(505)}`]) assert.throws(() => check(17, 'proof', 'done', proof), /CHECK/);
    assert.throws(() => check(17, 'note', 'done', null, 'x'.repeat(501)), /CHECK/);
    assert.throws(() => check(17, 'flag', 'needs_work', null, null, 'account-1', 'x'.repeat(501)), /CHECK/);
    check(17, 'bounds', 'needs_work', `https://${'a'.repeat(504)}`, 'x'.repeat(500), 'account-1', 'y'.repeat(500));
    assert.equal(db.prepare('SELECT count(*) n FROM gate_checks').get().n, 3);
  } finally { db.close(); }
});

test('collaborate: posters, immutable job events, agreement activation and project deletion', () => {
  const db = fixture();
  try {
    account(db, 1, 'approved', 'Pixel'); account(db, 2, 'approved', 'Nova'); project(db, 1);
    const job = (id, poster, instructor, money, share, projectId = null) => db.prepare(`INSERT INTO jobs(id,poster_account_id,poster_is_instructor,title,description,deliverable,window_days,money_usd,share_percent,project_id)
      VALUES(?,?,?,'Fix the header','Make it sticky','pull_request',7,?,?,?)`).run(id, poster, instructor, money, share, projectId);
    assert.throws(() => job('j0', 'account-1', 1, 10, null), /CHECK/);
    assert.throws(() => job('j0', null, 0, 10, null), /CHECK/);
    assert.throws(() => job('j0', 'account-1', 0, null, null), /CHECK/);
    assert.throws(() => job('j0', null, 1, null, 5, 'project-1'), /share_project|CHECK/);
    assert.throws(() => job('j0', 'account-2', 0, null, 5, 'project-1'), /share_project/);
    job('j1', 'account-1', 0, 50, 5, 'project-1'); job('j2', null, 1, 80, null);
    assert.throws(() => db.exec("DELETE FROM jobs WHERE id='j2'"), /jobs_are_kept/);
    db.exec("INSERT INTO job_events(op,job_id,kind,actor_kind,actor_account_id) VALUES('op1','j1','posted','member','account-1')");
    assert.throws(() => db.exec("UPDATE job_events SET kind='edited'"), /job_events_immutable/);
    assert.throws(() => db.exec('DELETE FROM job_events'), /job_events_immutable/);
    assert.throws(() => db.exec("INSERT INTO job_events(op,job_id,kind,actor_kind) VALUES('op1','j1','edited','system')"), /UNIQUE/);

    db.exec("INSERT INTO share_agreements(id,project_id,version,source) VALUES('a1','project-1',1,'proposal')");
    assert.throws(() => db.exec("INSERT INTO share_agreements(id,project_id,version,source) VALUES('a2','project-1',2,'proposal')"), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO share_agreements(id,project_id,version,source,status,activated_at) VALUES('a2','project-1',2,'proposal','active','x')"), /agreement_starts_pending/);
    db.exec("INSERT INTO share_agreement_lines(agreement_id,account_id,role,percent) VALUES('a1','account-1','Owner',70),('a1','account-2','Designer',20)");
    assert.throws(() => db.exec("INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) VALUES('a1','account-3','accepted')"), /acceptance_not_listed/);
    db.exec("INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) VALUES('a1','account-1','accepted'),('a1','account-2','accepted')");
    assert.throws(() => db.exec("UPDATE share_agreements SET status='active',activated_at='2026-10-23T00:00:00Z' WHERE id='a1'"), /agreement_not_ready/);
    assert.throws(() => db.exec("UPDATE share_agreement_lines SET percent=30 WHERE account_id='account-2'"), /agreement_lines_fixed/);
    db.exec("UPDATE share_agreements SET status='replaced' WHERE id='a1'");
    db.exec("INSERT INTO share_agreements(id,project_id,version,source) VALUES('a2','project-1',2,'proposal')");
    db.exec("INSERT INTO share_agreement_lines(agreement_id,account_id,role,percent) VALUES('a2','account-1','Owner',80),('a2','account-2','Designer',20)");
    db.exec("INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) VALUES('a2','account-1','accepted')");
    assert.throws(() => db.exec("UPDATE share_agreements SET status='active',activated_at='2026-10-23T00:00:00Z' WHERE id='a2'"), /agreement_not_ready/);
    db.exec("INSERT INTO share_agreement_acceptances(agreement_id,account_id,decision) VALUES('a2','account-2','accepted')");
    db.exec("UPDATE share_agreements SET status='active',activated_at='2026-10-23T00:00:00Z' WHERE id='a2'");
    assert.throws(() => db.exec("UPDATE share_agreement_acceptances SET decision='declined'"));
    assert.throws(() => db.exec("UPDATE share_agreements SET status='pending' WHERE id='a2'"), /agreement_transition/);
    assert.throws(() => db.exec("DELETE FROM share_agreements WHERE id='a2'"), /agreement_history_kept/);

    db.exec("DELETE FROM personal_projects WHERE id='project-1'");
    assert.equal(db.prepare('SELECT count(*) n FROM share_agreements').get().n, 0);
    assert.equal(db.prepare("SELECT project_id FROM jobs WHERE id='j1'").get().project_id, null);
  } finally { db.close(); }
});

test('ideas, comments and pledges keep their records and their authors', () => {
  const db = fixture();
  try {
    account(db, 1, 'approved', 'Pixel'); account(db, 2, 'approved', 'Nova'); project(db, 1);
    const idea = (id, help = '[]', projectId = null) => db.prepare("INSERT INTO ideas(id,author_account_id,title,problem,audience,help,stage,project_id) VALUES(?,'account-1','Swap','Food waste','Flats',?,'idea',?)").run(id, help, projectId);
    assert.throws(() => idea('i0', '["investor"]'), /idea_help/);
    assert.throws(() => idea('i0', '[]', 'project-1'), /idea_project/);
    idea('i1', '["designer","funding"]');
    assert.throws(() => db.exec("UPDATE ideas SET stage='launched'"), /CHECK/);
    assert.throws(() => db.exec("UPDATE ideas SET author_account_id='account-2'"), /idea_immutable/);
    assert.throws(() => db.exec("INSERT INTO idea_interest(idea_id,account_id,role) VALUES('i1','account-1','Me')"), /interest_author/);
    db.exec("INSERT INTO idea_interest(idea_id,account_id,role) VALUES('i1','account-2','Designer')");
    assert.throws(() => db.exec("INSERT INTO comments(id,target_kind,target_id,author_account_id,body) VALUES('c0','idea','missing','account-2','Hi')"), /comment_target/);
    assert.throws(() => db.exec("INSERT INTO comments(id,target_kind,target_id,author_account_id,author_is_instructor,body) VALUES('c0','idea','i1','account-2',1,'Hi')"), /CHECK/);
    db.exec("INSERT INTO comments(id,target_kind,target_id,author_is_instructor,body) VALUES('c1','idea','i1',1,'Ask the canteen')");
    assert.throws(() => db.exec('DELETE FROM comments'), /comments_immutable/);

    const pledge = (id, who) => db.prepare("INSERT INTO pledges(id,project_id,pledger_account_id,pledger_is_instructor,amount_usd) VALUES(?,'project-1',?,?,50)").run(id, who, who ? 0 : 1);
    assert.throws(() => pledge('g0', 'account-2'), /pledge_not_seeking/);
    assert.throws(() => db.exec("INSERT INTO project_funding(project_id,seeking) VALUES('project-1',1)"), /CHECK/);
    db.exec("INSERT INTO project_funding(project_id,seeking,goal_usd) VALUES('project-1',1,500)");
    assert.throws(() => pledge('g0', 'account-1'), /pledge_owner/);
    pledge('g1', 'account-2'); pledge('g2', null);
    assert.throws(() => db.exec("UPDATE pledges SET status='received' WHERE id='g1'"), /CHECK/);
    db.exec("UPDATE pledges SET status='received',closed_at='2026-10-23T00:00:00Z' WHERE id='g1'");
    assert.throws(() => db.exec("UPDATE pledges SET status='withdrawn' WHERE id='g1'"), /pledge_transition/);
    assert.throws(() => db.exec("DELETE FROM pledges WHERE id='g2'"), /pledges_are_kept/);
    db.exec("UPDATE ideas SET project_id='project-1' WHERE id='i1'");
    db.exec("DELETE FROM personal_projects WHERE id='project-1'");
    assert.equal(db.prepare('SELECT count(*) n FROM pledges').get().n, 0);
    assert.equal(db.prepare("SELECT project_id FROM ideas WHERE id='i1'").get().project_id, null);
  } finally { db.close(); }
});
