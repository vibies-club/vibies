import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { columns, prepareSnapshot, rehearseImport, sha256 } from '../scripts/migration-snapshot.mjs';
import { sourceExportSql, saveEncryptedBackup, decryptSnapshot } from '../scripts/migration-export.mjs';
const expected = {environment:'staging',sourceProject:'synthetic',destinationDatabase:'synthetic-d1',schemaHash:'a'.repeat(64)};
const instant = '2026-10-15T01:02:03.123456Z';
function snapshot() {
 return {format:1,...expected,capturedAt:instant,sequences:{sign_in_attempts:'42',instructor_audit:'70',demo_projects:'20'},tables:{
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
}
function fixture() {
 const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
 for (const name of readdirSync(new URL('../d1/migrations/',import.meta.url)).sort()) if(name.endsWith('.sql')) db.exec(readFileSync(new URL(`../d1/migrations/${name}`,import.meta.url),'utf8'));
 let calls=0;
 return {db, get calls(){return calls;},transport:{
 identity: async()=>({environment:'staging',databaseId:'synthetic-d1',state:'disabled',empty:true}),
 batch:async statements=>{ calls++; db.exec('BEGIN'); try {for(const {sql,params} of statements) db.prepare(sql).run(...params);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}},
 readTables:async tables=>Object.fromEntries(tables.map(table=>{const query=db.prepare(`SELECT * FROM "${table}"`); query.setReadBigInts(true); return [table,query.all()];})),
 readSequences:async tables=>Object.fromEntries(tables.map(table=>{const query=db.prepare('SELECT seq FROM sqlite_sequence WHERE name=?');query.setReadBigInts(true);return [table,query.get(table)?.seq ?? 0n];})),
 }};
}
test('synthetic all-table roundtrip preserves large IDs, timestamps, nulls, Unicode, sequences and legacy provenance',async()=>{
 const f=fixture();try {
 const manifest=await rehearseImport(snapshot(),expected,f.transport);
 assert.equal(Object.keys(manifest.tables).length,10);
 assert.equal(f.db.prepare('SELECT auth_provider FROM sessions').get().auth_provider,'legacy');
 assert.equal(f.db.prepare('SELECT created_at FROM sessions').get().created_at,instant);
 assert.equal(f.db.prepare("INSERT INTO sign_in_attempts(browser_hash) VALUES('synthetic-next') RETURNING id").get().id,42);
 assert.equal(f.db.prepare("INSERT INTO instructor_audit(new_github_id,reason) VALUES('999','synthetic-next') RETURNING id").get().id,70);
 assert.equal(f.db.prepare("INSERT INTO demo_projects(title,summary) VALUES('synthetic-next','synthetic-next') RETURNING id").get().id,20);
 assert.ok(!JSON.stringify(manifest).includes('Synthetic project'));
 }finally{f.db.close();}
});
test('wrong environment/source/database/schema or populated destination cannot import',async()=>{
 for(const key of Object.keys(expected)) {const f=fixture();try{await assert.rejects(rehearseImport(snapshot(),{...expected,[key]:'wrong'},f.transport),/validation/);assert.equal(f.calls,0);}finally{f.db.close();}}
 for(const identity of [{environment:'staging',databaseId:'synthetic-d1',state:'active',empty:true},{environment:'staging',databaseId:'synthetic-d1',state:'disabled',empty:false},{environment:'staging',databaseId:'wrong',state:'disabled',empty:true}]) {
 const f=fixture(); try {f.transport.identity=async()=>identity;await assert.rejects(rehearseImport(snapshot(),expected,f.transport));assert.equal(f.calls,0);}finally{f.db.close();}
 }
});
test('partial tables, unsafe numbers, nickname collisions and stale sequences fail closed',()=>{
 for(const change of [s=>delete s.tables.sessions,s=>s.tables.accounts[0].extra='unexpected',s=>s.tables.personal_projects[0].version=9007199254740992,s=>s.sequences.demo_projects='1',s=>s.tables.accounts[0].nickname_key='guide']){const s=snapshot();change(s);assert.throws(()=>prepareSnapshot(s,expected),/validation/);}
});
test('constraint failure rolls back entire import and redacts provider error',async()=>{
 const f=fixture();const s=snapshot();s.tables.project_milestones[0].project_id='missing-private-value';
 try{await assert.rejects(rehearseImport(s,expected,f.transport),error=>error.message==='Migration rehearsal failed; destination must remain disabled'); assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count,0);}finally{f.db.close();}
});
test('readback mutation prevents success, canonical hashes ignore row order',async()=>{
 const a=snapshot();a.tables.demo_projects.push({...a.tables.demo_projects[0],id:'2'});const b=structuredClone(a);b.tables.demo_projects.reverse();assert.deepEqual(prepareSnapshot(a,expected).manifest,prepareSnapshot(b,expected).manifest);
 const f=fixture();const read=f.transport.readTables;f.transport.readTables=async names=>{const rows=await read(names);rows.sessions[0].created_at='changed';return rows;};try{await assert.rejects(rehearseImport(snapshot(),expected,f.transport));}finally{f.db.close();}
});
test('source SQL is one read-only repeatable snapshot with encryption and lossless projection',()=>{
 const sql=sourceExportSql({...expected,publicKey:'-----BEGIN PGP PUBLIC KEY BLOCK-----\nsynthetic\n-----END PGP PUBLIC KEY BLOCK-----'});
 assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/pgp_pub_encrypt/);assert.match(sql,/lower\(t.nickname collate pg_catalog\."unicode"\)/);assert.match(sql,/t\."version"::text/);assert.match(sql,/last_value \+ 1/);assert.match(sql,/SS.US/);for(const table of Object.keys(columns))assert.ok(sql.includes(table));
});
test('ciphertext backup is exclusive, outside repo and mode 0600; decrypt bytes are wiped',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vibies-migration-'));const path=join(directory,'backup.pgp');const ciphertext=Buffer.from('synthetic encrypted bytes');
 try {const result=await saveEncryptedBackup({ciphertext,path,repositoryRoot:process.cwd()});assert.equal(result.sha256,sha256(ciphertext));assert.deepEqual(await readFile(path),ciphertext);assert.equal((await stat(path)).mode & 0o777,0o600);await assert.rejects(saveEncryptedBackup({ciphertext,path,repositoryRoot:process.cwd()}));await assert.rejects(saveEncryptedBackup({ciphertext,path:join(process.cwd(),'forbidden.pgp'),repositoryRoot:process.cwd()}));
 const bytes=Buffer.from(JSON.stringify(snapshot()));const decoded=await decryptSnapshot(ciphertext,async()=>bytes);assert.equal(decoded.environment,'staging');assert.ok(bytes.every(byte=>byte===0));await assert.rejects(decryptSnapshot(ciphertext,async()=>{throw new Error('private plaintext');}),error=>!error.message.includes('private'));}finally{await rm(directory,{recursive:true,force:true});}
});

test('local D1/workerd preserves bound large integers and atomic import with exact readback', async()=>{
 const { Miniflare } = await import('miniflare');
 const mf=new Miniflare({workers:[{modules:true,compatibilityDate:'2026-08-06',script:"export default { fetch() { return new Response('Synthetic migration rehearsal'); } };",d1Databases:{DB:'synthetic-migration-rehearsal'}}]});
 try {
 const db=await mf.getD1Database('DB');
 for(const name of readdirSync(new URL('../d1/migrations/',import.meta.url)).sort()) if(name.endsWith('.sql')) {
 const schema=readFileSync(new URL(`../d1/migrations/${name}`,import.meta.url),'utf8');
 const statements=[]; let pending='';
 for(const line of schema.replace(/^--.*$/gm,'').split('\n')) {
 pending += line + '\n';
 if(line.trim().endsWith(';') && (!/^\s*CREATE TRIGGER/i.test(pending) || /^\s*END;\s*$/i.test(line) || /\bBEGIN\b.*\bEND;\s*$/i.test(line))) { statements.push(pending.trim()); pending=''; }
 }
 await db.batch(statements.map(sql=>db.prepare(sql)));
 }
 const transport={
 identity:async()=>({environment:'staging',databaseId:'synthetic-d1',state:await db.prepare('SELECT state FROM deployment_activation').first('state'),empty:await db.prepare('SELECT count(*) AS n FROM accounts').first('n')===0}),
 batch:async statements=>db.batch(statements.map(({sql,params})=>db.prepare(sql).bind(...params))),
 readTables:async tables=>Object.fromEntries(await Promise.all(tables.map(async table=>{
 // D1 JSON numbers lose >53-bit precision; cast integer fields before transfer.
 const select=columns[table].map(column=>(column==='version'||column==='position'||(column==='id'&&['sign_in_attempts','instructor_audit','demo_projects'].includes(table)))?`CAST("${column}" AS TEXT) AS "${column}"`:`"${column}"`).join(',');
 return [table,(await db.prepare(`SELECT ${select} FROM "${table}"`).all()).results];
 }))),
 readSequences:async tables=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await db.prepare('SELECT CAST(seq AS TEXT) AS seq FROM sqlite_sequence WHERE name=?').bind(table).first('seq')]))),
 };
 const manifest=await rehearseImport(snapshot(),expected,transport);
 assert.equal(manifest.tables.personal_projects.count,1);
 assert.equal(await db.prepare('SELECT CAST(version AS TEXT) AS v FROM personal_projects').first('v'),'9007199254740993');
 assert.equal(await db.prepare('SELECT state FROM deployment_activation').first('state'),'disabled');
 assert.equal(await db.prepare("INSERT INTO sign_in_attempts(browser_hash) VALUES('synthetic-next') RETURNING id").first('id'),42);
 // A failed write after an earlier write in the same D1 batch rolls back both.
 await assert.rejects(transport.batch([{sql:'DELETE FROM sessions',params:[]},{sql:"INSERT INTO project_milestones(id,project_id,title,position) VALUES('bad','missing','Synthetic',1)",params:[]}]));
 assert.equal(await db.prepare('SELECT count(*) AS n FROM sessions').first('n'),1);
 }finally{await mf.dispose();}
});
