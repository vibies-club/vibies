import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { AccessDatabase, D1Statement, D1Result } from '../lib/d1/access.ts';
import * as api from '../lib/d1/projects.ts';

const hash=(id:number)=>id.toString(16).padStart(64,'0');
class Statement implements D1Statement {
  readonly db:DatabaseSync; readonly sql:string; readonly args:SQLInputValue[];
  constructor(db:DatabaseSync,sql:string,args:SQLInputValue[]=[]) {this.db=db;this.sql=sql;this.args=args;}
  bind(...args:unknown[]) {return new Statement(this.db,this.sql,args as SQLInputValue[]);}
  execute<T>():D1Result<T> {
    const stmt=this.db.prepare(this.sql);
    const results=stmt.columns().length?stmt.all(...this.args) as T[]:(stmt.run(...this.args),[]);
    return {success:true,results};
  }
  async all<T>() {return this.execute<T>();}
  async first<T>() {return this.execute<T>().results[0]??null;}
  async run() {return this.execute<Record<string,unknown>>();}
}
function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../d1/migrations/0001_application.sql',import.meta.url),'utf8'));
  sqlite.exec("UPDATE community SET instructor_github_id='99',instructor_nickname='Tutor',instructor_nickname_key='tutor'");
  for(let id=1;id<=5;id++) {
    const status=id===4?'unapproved':id===5?'revoked':'approved';
    sqlite.prepare('INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,?)')
      .run(crypto.randomUUID(),String(id),`member${id}`,status==='unapproved'?null:`Member ${id}`,status==='unapproved'?null:`member ${id}`,status);
    sqlite.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').run(hash(id),String(id));
  }
  sqlite.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').run(hash(99),'99');
  const db:AccessDatabase={
    prepare:sql=>new Statement(sqlite,sql),
    async batch<T>(statements:D1Statement[]) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {const results=statements.map(stmt=>(stmt as Statement).execute<T>());sqlite.exec('COMMIT');return results;}
      catch(error) {sqlite.exec('ROLLBACK');throw error;}
    },
  };
  return {sqlite,db};
}
async function create(db:AccessDatabase,repository='100',user=1) {
  const result=await api.connect_project(db,hash(user),repository,'Seedling','A synthetic project');
  assert.equal(result.kind,'created');assert(result.id);
  return result.id;
}
function stored(sqlite:DatabaseSync,id:string) {return sqlite.prepare('SELECT * FROM personal_projects WHERE id=?').get(id)!;}
function version(sqlite:DatabaseSync,id:string) {return String(stored(sqlite,id).version);}
function milestones(sqlite:DatabaseSync,id:string) {return sqlite.prepare('SELECT * FROM project_milestones WHERE project_id=? ORDER BY position').all(id);}

test('D1 project connect keeps identity, enforces owner/capacity, and rejects invalid inputs',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    assert.equal((await api.project_actor(db,hash(1))).kind,'ok');
    assert.equal((await api.project_operation_context(db,hash(1),id.toUpperCase())).repositoryId,'100');
    assert.equal((await api.project(db,hash(1),id.toUpperCase())).kind,'ok');
    for(const user of [2,4,5,99]) assert.equal((await api.project_operation_context(db,hash(user),id)).kind,'forbidden');
    for(const user of [4,5,99]) assert.equal((await api.connect_project(db,hash(user),'101','Title','Summary')).kind,'forbidden');
    assert.deepEqual(await api.connect_project(db,hash(1),'100','Changed','Changed'),{kind:'existing',id,version:'1'});
    assert.equal(stored(sqlite,id).title,'Seedling');
    assert.equal((await api.connect_project(db,hash(2),'100','Title','Summary')).kind,'conflict');
    await create(db,'101');await create(db,'102');
    assert.equal((await api.connect_project(db,hash(1),'103','Title','Summary')).kind,'full');
    assert.equal((await api.connect_project(db,hash(1),'100','Changed','Changed')).kind,'existing');
    for(const [title,summary,url] of [[' padded','Summary',null],['Title','Summary','http://example.test'],['Title','bad\u200btext',null],['Title','Summary','https://user@example.test']] as const)
      assert.equal((await api.connect_project(db,hash(1),'104',title,summary,url)).kind,'invalid');
    assert.equal((await api.connect_project(db,hash(1),'0','Title','Summary')).kind,'invalid');
  } finally {sqlite.close();}
});

test('D1 publish, connection and editing preserve independent states and permanent onboarding',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    const owner=stored(sqlite,id).owner_account_id as string;
    assert.equal((await api.publish_project(db,hash(1),id,'1')).kind,'published');
    assert.equal(sqlite.prepare('SELECT onboarding_completed FROM accounts WHERE internal_id=?').get(owner)?.onboarding_completed,1);
    assert.equal((await api.publish_project(db,hash(1),id,'1')).kind,'stale');
    assert.equal((await api.publish_project(db,hash(1),id,'2')).kind,'already_published');
    assert.equal((await api.moderate_project(db,hash(99),id,'2',true)).kind,'hidden');
    assert.equal((await api.record_project_connection(db,hash(1),id,'3',false)).kind,'disconnected');
    assert.equal(stored(sqlite,id).publication,'Published');assert.equal(stored(sqlite,id).moderation,'Hidden');
    const checkedAt=stored(sqlite,id).last_checked_at;
    assert.equal((await api.record_project_connection(db,hash(1),id,'4',false)).kind,'disconnected');
    assert.equal(stored(sqlite,id).last_checked_at,checkedAt);
    assert.equal((await api.edit_project(db,hash(1),id,'5','New name','New summary','https://example.test')).kind,'edited');
    assert.equal((await api.record_project_connection(db,hash(1),id,'6',true)).kind,'connected');
    assert.equal(stored(sqlite,id).moderation,'Hidden');
    sqlite.prepare("UPDATE personal_projects SET publication='Archived' WHERE id=?").run(id);
    assert.equal((await api.publish_project(db,hash(1),id,'7')).kind,'invalid');
    assert.equal((await api.edit_project(db,hash(1),id,'7','Archived name','Still editable')).kind,'edited');
    assert.equal((await api.delete_project(db,hash(1),id,'8')).kind,'deleted');
    assert.equal(sqlite.prepare('SELECT onboarding_completed FROM accounts WHERE internal_id=?').get(owner)?.onboarding_completed,1);
  } finally {sqlite.close();}
});

test('D1 reads preserve owner, community and Instructor visibility including revoked-owner publications',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    assert.equal((await api.project(db,hash(1),id)).kind,'ok');
    assert.equal((await api.project(db,hash(2),id)).kind,'missing');
    assert.equal((await api.project(db,hash(99),id)).kind,'missing');
    assert.equal((await api.projects(db,hash(1))).mine?.length,1);
    assert.equal((await api.projects(db,hash(2))).community?.length,0);
    await api.publish_project(db,hash(1),id,'1');
    const reader=(await api.project(db,hash(2),id)).project!;
    assert.equal(reader.isOwner,false);assert.equal(reader.version,undefined);assert.equal(reader.publication,undefined);
    assert.deepEqual(reader.roadmap,{milestones:[],totalCount:0,completedCount:0,percentage:null});
    const tutor=(await api.project(db,hash(99),id)).project!;
    assert.equal(tutor.version,'2');assert.equal(tutor.publication,undefined);
    await api.moderate_project(db,hash(99),id,'2',true);
    assert.equal((await api.project(db,hash(2),id)).kind,'missing');
    assert.equal((await api.project(db,hash(99),id)).project?.moderation,'Hidden');
    assert.equal((await api.projects(db,hash(99))).community?.length,0);
    await api.moderate_project(db,hash(99),id,'3',false);
    sqlite.exec("UPDATE accounts SET status='revoked' WHERE github_id='1'");
    assert.equal((await api.project(db,hash(1),id)).kind,'forbidden');
    assert.equal((await api.project(db,hash(2),id)).kind,'ok');
    assert.equal((await api.projects(db,hash(2))).community?.length,1);
    for(const user of [4,5]) {
      assert.equal((await api.project(db,hash(user),id)).kind,'forbidden');
      assert.equal((await api.projects(db,hash(user))).kind,'forbidden');
    }
  } finally {sqlite.close();}
});

test('D1 roadmap handles progress, content, completion, reorder, deletion and stale versions',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    assert.equal((await api.add_project_milestone(db,hash(1),id.toUpperCase(),'1','First','Waiting')).kind,'added');
    assert.equal((await api.add_project_milestone(db,hash(1),id,'2','Second')).kind,'added');
    assert.equal((await api.add_project_milestone(db,hash(1),id,'3','Third')).kind,'added');
    const [first,second,third]=milestones(sqlite,id);
    assert.equal((await api.edit_project_milestone(db,hash(1),id,first.id as string,'4','First','Waiting')).kind,'unchanged');
    assert.equal(version(sqlite,id),'4');
    assert.equal((await api.set_project_milestone_completion(db,hash(1),id,first.id as string,'4',true)).kind,'completed');
    assert.equal(milestones(sqlite,id)[0].blocked_note,null);
    assert.equal((await api.edit_project_milestone(db,hash(1),id,first.id as string,'5','First','Blocked')).kind,'invalid');
    assert.equal((await api.set_project_milestone_completion(db,hash(1),id,first.id as string,'5',true)).kind,'unchanged');
    assert.equal((await api.project(db,hash(1),id)).project?.lastCheckedAt,stored(sqlite,id).last_checked_at);
    assert.equal(((await api.project(db,hash(1),id)).project?.roadmap as {percentage:number}).percentage,33);
    const before=milestones(sqlite,id);
    assert.equal((await api.move_project_milestone(db,hash(1),id,(second.id as string).toUpperCase(),'5','up')).kind,'moved');
    assert.deepEqual(milestones(sqlite,id).map(row=>row.id),[second.id,first.id,third.id]);
    for(const row of milestones(sqlite,id)) {
      const original=before.find(item=>item.id===row.id)!;
      for(const field of ['title','completed','blocked_note','created_at']) assert.equal(row[field],original[field]);
    }
    assert.equal((await api.move_project_milestone(db,hash(1),id,second.id as string,'6','up')).kind,'unchanged');
    assert.equal((await api.delete_project_milestone(db,hash(1),id,first.id as string,'6')).kind,'deleted');
    assert.deepEqual(milestones(sqlite,id).map(row=>row.position),[1,2]);
    assert.equal((await api.edit_project_milestone(db,hash(1),id,third.id as string,'6','Changed')).kind,'stale');
    assert.equal((await api.set_project_milestone_completion(db,hash(1),id,second.id as string,'7',false)).kind,'unchanged');
    assert.equal((await api.set_project_milestone_completion(db,hash(1),id,third.id as string,'7',true)).kind,'completed');
    assert.equal((await api.set_project_milestone_completion(db,hash(1),id,third.id as string,'8',false)).kind,'reopened');
    assert.equal((await api.edit_project_milestone(db,hash(1),id,third.id as string,'9','Updated','Still blocked')).kind,'edited');
    assert.equal((await api.delete_project(db,hash(1),id,'10')).kind,'deleted');
    assert.deepEqual(milestones(sqlite,id),[]);
  } finally {sqlite.close();}
});

test('D1 every project mutation denies other owners, Instructor owner actions, revoked and expired sessions',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    await api.add_project_milestone(db,hash(1),id,'1','First');
    const mid=milestones(sqlite,id)[0].id as string;
    const commands=[
      (h:string)=>api.publish_project(db,h,id,'2'),
      (h:string)=>api.edit_project(db,h,id,'2','Change','Summary'),
      (h:string)=>api.record_project_connection(db,h,id,'2',false),
      (h:string)=>api.delete_project(db,h,id,'2'),
      (h:string)=>api.add_project_milestone(db,h,id,'2','Second'),
      (h:string)=>api.edit_project_milestone(db,h,id,mid,'2','Change'),
      (h:string)=>api.set_project_milestone_completion(db,h,id,mid,'2',true),
      (h:string)=>api.move_project_milestone(db,h,id,mid,'2','down'),
      (h:string)=>api.delete_project_milestone(db,h,id,mid,'2'),
    ];
    const before=stored(sqlite,id);const roadmap=milestones(sqlite,id);
    for(const user of [2,4,5,99]) for(const command of commands) assert.equal((await command(hash(user))).kind,'forbidden');
    sqlite.prepare("UPDATE sessions SET created_at='2000-01-01T00:00:00Z' WHERE session_hash=?").run(hash(1));
    for(const command of commands) assert.equal((await command(hash(1))).kind,'forbidden');
    assert.deepEqual(stored(sqlite,id),before);assert.deepEqual(milestones(sqlite,id),roadmap);
    assert.equal((await api.moderate_project(db,hash(2),id,'2',true)).kind,'forbidden');
    assert.equal((await api.moderate_project(db,hash(99),id,'2',true)).kind,'forbidden'); // Draft
  } finally {sqlite.close();}
});

test('D1 roadmap capacity and optimistic concurrent writes are atomic',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    const race=await Promise.all([api.add_project_milestone(db,hash(1),id,'1','A'),api.add_project_milestone(db,hash(1),id,'1','B')]);
    assert.deepEqual(race.map(row=>row.kind).sort(),['added','stale']);
    for(let n=2;n<=20;n++) assert.equal((await api.add_project_milestone(db,hash(1),id,String(n),`Step ${n}`)).kind,'added');
    assert.equal((await api.add_project_milestone(db,hash(1),id,'21','Overflow')).kind,'full');
    assert.equal(version(sqlite,id),'21');assert.equal(milestones(sqlite,id).length,20);
    const mid=milestones(sqlite,id)[0].id as string;
    assert.equal((await api.move_project_milestone(db,hash(1),id,mid,'21','down')).kind,'moved');
    assert.equal(milestones(sqlite,id).length,20);
    assert.deepEqual(milestones(sqlite,id).map(row=>row.position),Array.from({length:20},(_,n)=>n+1));
  } finally {sqlite.close();}
});

test('D1 failed child writes roll back parent version and failed onboarding rolls back publication',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    sqlite.exec("CREATE TRIGGER fail_child BEFORE INSERT ON project_milestones BEGIN SELECT RAISE(ABORT,'injected child failure'); END");
    await assert.rejects(api.add_project_milestone(db,hash(1),id,'1','First'),/injected child failure/);
    assert.equal(version(sqlite,id),'1');assert.equal(milestones(sqlite,id).length,0);
    sqlite.exec('DROP TRIGGER fail_child');
    sqlite.exec("CREATE TRIGGER fail_onboarding BEFORE UPDATE OF onboarding_completed ON accounts BEGIN SELECT RAISE(ABORT,'injected onboarding failure'); END");
    await assert.rejects(api.publish_project(db,hash(1),id,'1'),/injected onboarding failure/);
    assert.equal(stored(sqlite,id).publication,'Draft');assert.equal(version(sqlite,id),'1');
    sqlite.exec('DROP TRIGGER fail_onboarding');
    sqlite.prepare('UPDATE personal_projects SET version=9223372036854775807 WHERE id=?').run(id);
    await assert.rejects(api.edit_project(db,hash(1),id,'9223372036854775807','Changed','Summary'),/NOT NULL/);
    assert.equal(sqlite.prepare('SELECT title FROM personal_projects WHERE id=?').get(id)?.title,'Seedling');
  } finally {sqlite.close();}
});


test('D1 roadmap snapshots cannot overwrite a concurrent edit or write after revocation',async()=> {
  const {db,sqlite}=fixture();
  try {
    const id=await create(db);
    await api.add_project_milestone(db,hash(1),id,'1','First');
    await api.add_project_milestone(db,hash(1),id,'2','Second');
    const mid=milestones(sqlite,id)[0].id as string;
    const base=milestones(sqlite,id);
    let intercepted=false;
    const stale:AccessDatabase={...db,async batch<T>(queries:D1Statement[]) {
      if(!intercepted) {
        intercepted=true;
        sqlite.prepare("UPDATE project_milestones SET title='Concurrent edit' WHERE id=?").run(mid);
        sqlite.prepare('UPDATE personal_projects SET version=version+1 WHERE id=?').run(id);
      }
      return db.batch<T>(queries);
    }};
    assert.equal((await api.move_project_milestone(stale,hash(1),id,mid,'3','down')).kind,'stale');
    assert.equal(milestones(sqlite,id)[0].title,'Concurrent edit');
    assert.deepEqual(milestones(sqlite,id).map(row=>row.id),base.map(row=>row.id));
    const revoked:AccessDatabase={...db,async batch<T>(queries:D1Statement[]) {
      sqlite.exec("UPDATE accounts SET status='revoked' WHERE github_id='1'");
      return db.batch<T>(queries);
    }};
    assert.equal((await api.delete_project_milestone(revoked,hash(1),id,mid,'4')).kind,'forbidden');
    assert.equal(milestones(sqlite,id).length,2);assert.equal(version(sqlite,id),'4');
    sqlite.exec("UPDATE accounts SET status='approved' WHERE github_id='1'");
    sqlite.exec("CREATE TRIGGER fail_reinsert BEFORE INSERT ON project_milestones BEGIN SELECT RAISE(ABORT,'reinsert failed'); END");
    await assert.rejects(api.move_project_milestone(db,hash(1),id,mid,'4','down'),/reinsert failed/);
    assert.equal(milestones(sqlite,id).length,2);assert.equal(version(sqlite,id),'4');
    assert.equal(milestones(sqlite,id)[0].title,'Concurrent edit');
  } finally {sqlite.close();}
});

test('D1 project races preserve three-project limit and a unique repository owner',async()=> {
  const {db,sqlite}=fixture();
  try {
    const results=await Promise.all(Array.from({length:4},(_,n)=>api.connect_project(db,hash(1),String(200+n),'Concurrent','Synthetic')));
    assert.equal(results.filter(row=>row.kind==='created').length,3);
    assert.equal(results.filter(row=>row.kind==='full').length,1);
    const duplicate=await Promise.all([api.connect_project(db,hash(2),'500','Second','Synthetic'),api.connect_project(db,hash(3),'500','Third','Synthetic')]);
    assert.deepEqual(duplicate.map(row=>row.kind).sort(),['conflict','created']);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM personal_projects WHERE repository_id='500'").get()?.n,1);
  } finally {sqlite.close();}
});
