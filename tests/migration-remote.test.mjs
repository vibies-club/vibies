import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync, readdirSync } from 'node:fs';
import { createRemoteMigrationTransport, createHttpMigrationTransport } from '../scripts/migration-remote.mjs';
import { columns, rehearseImport } from '../scripts/migration-snapshot.mjs';

const reviewed = { accountId: 'a'.repeat(32), databaseId: '11111111-1111-4111-8111-111111111111', environment: 'staging' };
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../d1/migrations/', import.meta.url)).sort()) {
    if (file.endsWith('.sql')) sqlite.exec(readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8'));
  }
  sqlite.exec('CREATE TABLE IF NOT EXISTS deployment_identity (singleton INTEGER PRIMARY KEY, account_id TEXT, database_id TEXT, environment_id TEXT, created_at TEXT)');
  sqlite.prepare('INSERT INTO deployment_identity VALUES (1,?,?,?,?)').run(reviewed.accountId, reviewed.databaseId, reviewed.environment, '2026-10-15T00:00:00Z');
  sqlite.exec('DELETE FROM demo_projects; DELETE FROM community; DELETE FROM _ownership');
  const state = { batches: 0, disposed: 0, stopped: 0, conversions: 0, failRead: false, failBatch: false };
  const database = {
    prepare(sql) {
      const wrap = params => ({
        sql, params,
        bind: (...values) => wrap(values),
        first: async column => {
          if (state.failRead) throw new Error('synthetic-private-provider-error');
          const row = sqlite.prepare(sql).get(...params);
          return column ? row?.[column] ?? null : row ?? null;
        },
        all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) }),
      });
      return wrap([]);
    },
    async batch(statements) {
      state.batches++;
      if (state.failBatch) throw new Error('synthetic-private-provider-error');
      sqlite.exec('BEGIN');
      try {
        for (const {sql, params} of statements) sqlite.prepare(sql).run(...params);
        sqlite.exec('COMMIT');
        return statements.map(() => ({success: true}));
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    withSession: () => database,
  };
  const dependencies = {
    loadWrangler: async () => ({ maybeStartOrUpdateRemoteProxySession: async config => {
      assert.equal(process.env.WRANGLER_WRITE_LOGS, 'false');
      assert.equal(process.env.WRANGLER_SEND_METRICS, 'false');
      assert.equal(process.env.WRANGLER_LOG, 'none');
      assert.deepEqual(config, { name: 'vibies-migration', account_id: reviewed.accountId, bindings: {DB: {type: 'd1', database_id: reviewed.databaseId, remote: true}} });
      return {session: {remoteProxyConnectionString: 'synthetic-connection', dispose: async () => {state.stopped++;}}};
    }}),
    loadMiniflare: async () => ({
      convertV4MiniflareOptions: config => {state.conversions++; return config;},
      Miniflare: class {
        constructor(config) {
          assert.equal(config.d1Persist, false);
          assert.deepEqual(config.d1Databases.DB, {id: reviewed.databaseId, remoteProxyConnectionString: 'synthetic-connection'});
        }
        getD1Database = async () => database;
        dispose = async () => {state.disposed++;};
      },
      Log: class {}, LogLevel: {NONE: 0},
    }),
  };
  return {sqlite, state, dependencies};
}

test('reviewed remote identity is verified before a guarded synthetic import', async () => {
  const f = fixture();
  const transport = await createRemoteMigrationTransport(reviewed, f.dependencies);
  try {
    assert.deepEqual(await transport.identity(), {environment: 'staging', databaseId: reviewed.databaseId, state: 'disabled', empty: true});
    const expected = {environment: 'staging', sourceProject: 'synthetic', destinationDatabase: reviewed.databaseId, schemaHash: 'a'.repeat(64)};
    const snapshot = {
      format: 1, ...expected, capturedAt: '2026-10-15T00:00:00Z',
      sequences: {sign_in_attempts: '1', instructor_audit: '1', demo_projects: '9007199254740994'},
      tables: {
        ...Object.fromEntries(Object.keys(columns).map(table => [table, []])),
        _ownership: [{project: 'vibies', feature: 'issue-5-access'}],
        community: [{singleton: true, instructor_github_id: null, instructor_nickname: null, instructor_nickname_key: null}],
        demo_projects: [{id: '9007199254740993', title: 'Synthetic', summary: 'Synthetic', created_at: '2026-10-15T00:00:00Z'}],
      },
    };
    const manifest = await rehearseImport(snapshot, expected, transport);
    assert.equal(Object.keys(manifest.tables).length, 10);
    assert.equal((await transport.readTables(['demo_projects'])).demo_projects[0].id, '9007199254740993');
    assert.equal((await transport.readSequences(['demo_projects'])).demo_projects, '9007199254740993');
  } finally { await transport.dispose(); f.sqlite.close(); }
  assert.equal(f.state.conversions, 1);
  assert.equal(f.state.disposed, 1);
  assert.equal(f.state.stopped, 1);
});

test('identity rejects wrong reviewed destination, active state and populated auxiliary tables', async () => {
 for (const mutate of [
  db => db.exec("UPDATE deployment_identity SET environment_id='production'"),
  db => db.exec("UPDATE deployment_activation SET state='reconciled',environment_id='staging',snapshot_hash='synthetic',reconciled_at='2026-10-15T00:00:00Z'"),
  db => db.exec("INSERT INTO google_verifications VALUES('synthetic','synthetic','synthetic','2026-10-16','2026-10-15','2026-10-15')"),
 ]) {
  const f=fixture();
  // The identity is immutable in the deployment schema; simulate a different target record.
  for (const row of f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='deployment_identity'").all()) f.sqlite.exec(`DROP TRIGGER "${row.name}"`);
  mutate(f.sqlite);
  const transport=await createRemoteMigrationTransport(reviewed,f.dependencies);
  try { await assert.rejects(transport.identity(), /Remote migration failed/); assert.equal(f.state.batches,0); }
  finally { await transport.dispose(); f.sqlite.close(); }
 }
});

test('atomic guard refuses a destination populated after successful preflight', async () => {
 const f=fixture(); const transport=await createRemoteMigrationTransport(reviewed,f.dependencies);
 try {
  await transport.identity();
  f.sqlite.exec("INSERT INTO google_verifications VALUES('race','synthetic','synthetic','2026-10-16','2026-10-15','2026-10-15')");
  await assert.rejects(transport.batch([{sql:"INSERT INTO demo_projects(title,summary) VALUES('must not import','synthetic')",params:[]}]), /Remote migration failed/);
  assert.deepEqual((await transport.readTables(['demo_projects'])).demo_projects,[]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '_migration_guard_%'").get().n,0);
 } finally { await transport.dispose(); f.sqlite.close(); }
});

test('late constraint failure rolls back import and guard table', async () => {
 const f=fixture(); const transport=await createRemoteMigrationTransport(reviewed,f.dependencies);
 try {
  await assert.rejects(transport.batch([
   {sql:"INSERT INTO demo_projects(title,summary) VALUES('must roll back','synthetic')",params:[]},
   {sql:"INSERT INTO project_milestones(id,project_id,title,position) VALUES('bad','missing','synthetic',1)",params:[]},
  ]), /Remote migration failed/);
  assert.deepEqual((await transport.readTables(['demo_projects'])).demo_projects,[]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '_migration_guard_%'").get().n,0);
 } finally { await transport.dispose(); f.sqlite.close(); }
});

test('provider failures and invalid inputs reveal no provider error or private payload', async () => {
 const f=fixture(); const transport=await createRemoteMigrationTransport(reviewed,f.dependencies);
 const redacted = error => error.message === 'Remote migration failed; destination must remain disabled' && !error.cause;
 try {
  f.state.failRead=true; await assert.rejects(transport.identity(),redacted); f.state.failRead=false;
  f.state.failBatch=true; await assert.rejects(transport.batch([{sql:'SELECT ?',params:['private-payload']}]),redacted);
  const prior=f.state.batches;
  await assert.rejects(transport.batch([{sql:'SELECT ?',params:['x'.repeat(1024*1024)]}]),redacted);
  await assert.rejects(transport.readTables(['sqlite_master']),redacted);
  await assert.rejects(transport.readSequences(['accounts']),redacted);
  assert.equal(f.state.batches,prior);
 } finally { await transport.dispose(); f.sqlite.close(); }
 await assert.rejects(transport.identity(),redacted);
 const broken=fixture();
 broken.dependencies.loadMiniflare=async()=>({
  Miniflare:class {constructor(){throw new Error('private-initialization-failure');}},
  Log:class {}, LogLevel:{NONE:0},
 });
 try {
  await assert.rejects(createRemoteMigrationTransport(reviewed,broken.dependencies),redacted);
  assert.equal(broken.state.stopped,1);
 } finally{broken.sqlite.close();}
});

test('local workerd executes the transport guard atomically and preserves exact integers', async () => {
 const {Miniflare,Log,LogLevel,convertV4MiniflareOptions}=createRequire(createRequire(import.meta.url).resolve('wrangler'))('miniflare');
 const local=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {};',compatibilityDate:'2026-08-06',d1Databases:{DB:'synthetic-remote-transport'},d1Persist:false,log:new Log(LogLevel.NONE)}));
 let transport;
 try {
  const db=await local.getD1Database('DB');
  for(const file of readdirSync(new URL('../d1/migrations/',import.meta.url)).sort()) {
   if(!file.endsWith('.sql')) continue;
   const schema=readFileSync(new URL(`../d1/migrations/${file}`,import.meta.url),'utf8');
   const statements=[]; let pending='';
   for(const line of schema.replace(/^--.*$/gm,'').split('\n')) {
    pending+=line+'\n';
    if(line.trim().endsWith(';') && (!/^\s*CREATE TRIGGER/i.test(pending) || /^\s*END;\s*$/i.test(line) || /\bBEGIN\b.*\bEND;\s*$/i.test(line))) {statements.push(pending.trim());pending='';}
   }
   await db.batch(statements.map(sql=>db.prepare(sql)));
  }
  await db.batch([
   db.prepare('CREATE TABLE IF NOT EXISTS deployment_identity (singleton INTEGER PRIMARY KEY, account_id TEXT, database_id TEXT, environment_id TEXT, created_at TEXT)'),
   db.prepare('INSERT INTO deployment_identity VALUES (1,?,?,?,?)').bind(reviewed.accountId,reviewed.databaseId,reviewed.environment,'2026-10-15T00:00:00Z'),
   db.prepare('DELETE FROM demo_projects'),db.prepare('DELETE FROM community'),db.prepare('DELETE FROM _ownership'),
  ]);
  transport=await createRemoteMigrationTransport(reviewed,{
   loadWrangler:async()=>({maybeStartOrUpdateRemoteProxySession:async()=>({session:{remoteProxyConnectionString:'synthetic-no-network',dispose:async()=>{}}})}),
   loadMiniflare:async()=>({Miniflare:class {getD1Database=async()=>db;dispose=async()=>{};},Log,LogLevel}),
  });
  await transport.identity();
  await assert.rejects(transport.batch([
   {sql:"INSERT INTO demo_projects(title,summary) VALUES('rollback','synthetic')",params:[]},
   {sql:"INSERT INTO project_milestones(id,project_id,title,position) VALUES('bad','missing','synthetic',1)",params:[]},
  ]),/Remote migration failed/);
  assert.deepEqual((await transport.readTables(['demo_projects'])).demo_projects,[]);
  await transport.identity();
  await transport.batch([{sql:'INSERT INTO demo_projects(id,title,summary) VALUES(?,?,?)',params:['9007199254740993','Synthetic','Synthetic']}]);
  assert.equal((await transport.readTables(['demo_projects'])).demo_projects[0].id,'9007199254740993');
  assert.equal((await transport.readSequences(['demo_projects'])).demo_projects,'9007199254740993');
  await assert.rejects(transport.batch([{sql:'DELETE FROM demo_projects',params:[]}]),/Remote migration failed/);
  assert.equal((await transport.readTables(['demo_projects'])).demo_projects.length,1);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '_migration_guard_%'").first('n'),0);
 } finally {await transport?.dispose();await local.dispose();}
});

function httpFixture() {
 const f=fixture();
 const calls=[];
 const {unstable_splitSqlQuery}=createRequire(import.meta.url)('wrangler');
 const dependencies={spawn(executable,args,options){
  calls.push({executable,args,options});
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=()=>{child.emit('close',1);return true;};
  let request='';child.stdin.on('data',chunk=>request+=chunk);
  child.stdin.on('finish',()=>queueMicrotask(()=>{
   try{
    const {target,sql}=JSON.parse(request);
    assert.equal(target.databaseId,reviewed.databaseId);
    f.sqlite.exec('BEGIN');
    const results=unstable_splitSqlQuery(sql).map(statement=>({success:true,results:f.sqlite.prepare(statement).all()}));
    f.sqlite.exec('COMMIT');
    child.stdout.write(JSON.stringify({ok:true,results}));child.emit('close',0);
   }catch{
    try{f.sqlite.exec('ROLLBACK');}catch{}
    child.stderr.write('sensitive-provider-detail');child.stdout.write(JSON.stringify({ok:false}));child.emit('close',1);
   }
  }));
  return child;
 }};
 return {...f,calls,dependencies};
}

test('HTTP transport keeps SQL in pipes and atomically imports exact integers and hostile text',async()=>{
 const f=httpFixture();const transport=await createHttpMigrationTransport(reviewed,f.dependencies);
 try{
  await transport.identity();
  await assert.rejects(transport.batch([
   {sql:'INSERT INTO demo_projects(title,summary) VALUES(?,?)',params:['must roll back','synthetic']},
   {sql:'INSERT INTO project_milestones(id,project_id,title,position) VALUES(?,?,?,?)',params:['bad','missing','synthetic',1]},
  ]),/Remote migration failed/);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM demo_projects').get().n,0);
  const text="Quote '; DROP TABLE accounts; -- ?\n雪";
  await transport.batch([{sql:'INSERT INTO demo_projects(id,title,summary) VALUES(?,?,?)',params:['9007199254740993',text,text]}]);
  const rows=await transport.readTables(['demo_projects']);
  assert.equal(rows.demo_projects[0].id,'9007199254740993');assert.equal(rows.demo_projects[0].title,text);
  assert.equal((await transport.readSequences(['demo_projects'])).demo_projects,'9007199254740993');
  assert.ok(f.calls.length>0);
  for(const call of f.calls){
   assert.deepEqual(call.args,[new URL('../scripts/migration-remote.mjs',import.meta.url).pathname,'--http-query-child']);
   assert.deepEqual(call.options.stdio,['pipe','pipe','pipe']);
   assert.equal(call.options.env.WRANGLER_WRITE_LOGS,'false');assert.equal(call.options.env.WRANGLER_SEND_METRICS,'false');
  }
 }finally{await transport.dispose();f.sqlite.close();}
 await assert.rejects(transport.identity(),/Remote migration failed/);
});

test('HTTP transport rechecks identity and emptiness in the atomic write and rejects invalid bindings',async()=>{
 const f=httpFixture();const transport=await createHttpMigrationTransport(reviewed,f.dependencies);
 try{
  await transport.identity();
  f.sqlite.exec("INSERT INTO demo_projects(title,summary) VALUES('raced','synthetic')");
  await assert.rejects(transport.batch([{sql:'DELETE FROM demo_projects',params:[]}]),/Remote migration failed/);
  assert.equal(f.sqlite.prepare('SELECT title FROM demo_projects').get().title,'raced');
  await assert.rejects(transport.identity(),/Remote migration failed/);
  const count=f.calls.length;
  await assert.rejects(transport.batch([{sql:'SELECT ?',params:[]}]),/Remote migration failed/);
  assert.equal(f.calls.length,count);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '_migration_guard_%'").get().n,0);
 }finally{await transport.dispose();f.sqlite.close();}
});

test('HTTP transport reconciles every source table with sessions, relationships and sequence gaps',async()=>{
 const f=httpFixture();const transport=await createHttpMigrationTransport(reviewed,f.dependencies);
 const expected={environment:'staging',sourceProject:'synthetic',destinationDatabase:reviewed.databaseId,schemaHash:'a'.repeat(64)};
 const instant='2026-10-15T01:02:03.123456Z';
 const snapshot={format:1,...expected,capturedAt:instant,sequences:{sign_in_attempts:'42',instructor_audit:'70',demo_projects:'20'},tables:{
  _ownership:[{project:'vibies',feature:'issue-5-access'}],
  community:[{singleton:true,instructor_github_id:'999',instructor_nickname:'Guide',instructor_nickname_key:'guide'}],
  accounts:[{internal_id:'account-one',github_id:'9007199254740993',github_username:'synthetic',nickname:'ÉLAN',nickname_key:'élan',status:'approved',onboarding_completed:true}],
  sessions:[{session_hash:'synthetic-session',github_id:'9007199254740993',created_at:instant}],
  sign_in_flows:[{state_hash:'synthetic-state',browser_hash:'synthetic-browser',created_at:instant}],
  sign_in_attempts:[{id:'41',browser_hash:'synthetic-browser',created_at:instant}],
  instructor_audit:[{id:'8',previous_github_id:null,new_github_id:'999',reason:"Synthetic 'quote';\nUnicode 雪",created_at:instant}],
  personal_projects:[{id:'project-one',owner_account_id:'account-one',repository_id:'9007199254740993',title:'Project',summary:'Synthetic project',demo_url:null,publication:'Draft',connection:'Connected',moderation:'Visible',last_checked_at:null,created_at:instant,updated_at:instant,version:'9007199254740993'}],
  project_milestones:[{id:'milestone-one',project_id:'project-one',title:'First step',completed:false,blocked_note:null,position:'1',created_at:instant,updated_at:instant}],
  demo_projects:[{id:'1',title:'Demo',summary:'Synthetic demo',created_at:instant}],
 }};
 try{
  const manifest=await rehearseImport(snapshot,expected,transport);
  assert.ok(Object.values(manifest.tables).every(table=>table.count===1));
  assert.equal(f.sqlite.prepare('SELECT auth_provider FROM sessions').get().auth_provider,'legacy');
  assert.equal(f.sqlite.prepare('SELECT created_at FROM sessions').get().created_at,instant);
  assert.equal((await transport.readTables(['personal_projects'])).personal_projects[0].version,'9007199254740993');
  assert.equal((await transport.readSequences(['sign_in_attempts'])).sign_in_attempts,'41');
 }finally{await transport.dispose();f.sqlite.close();}
});
