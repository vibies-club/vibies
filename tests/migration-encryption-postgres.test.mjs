import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, chmod, rm, readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { sourceExportSql, saveEncryptedBackup, decryptSnapshot } from '../scripts/migration-export.mjs';
import { runIsolatedGpg, decryptOpenPgpInMemory } from '../scripts/migration-gpg.mjs';
import { columns, rehearseImport, sha256 } from '../scripts/migration-snapshot.mjs';

const connection=process.env.VIBIES_MIGRATION_TEST_DATABASE_URL;
test('real pgcrypto OpenPGP ciphertext decrypts in memory and reconciles all ten tables', {skip:!connection,timeout:60000},async()=>{
 const url=new URL(connection);
 assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='60584'&&url.pathname==='/vibies_access_test'&&!url.password,'Only the isolated trust-connected PG17 fixture is allowed');
 const admin=postgres(connection,{max:1,onnotice:()=>{}});
 const name=`vibies_migration_export_${randomBytes(6).toString('hex')}`;
 const home=await mkdtemp('/tmp/vme-');await chmod(home,0o700);
 let sql;let created=false;let mf;
 try {
  await admin.unsafe(`CREATE DATABASE ${name}`);created=true;
  const target=new URL(connection);target.pathname=`/${name}`;
  sql=postgres(target.toString(),{max:1,onnotice:()=>{}});
  // The isolated PostgreSQL service starts without Supabase's API roles.
  await sql.unsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$`);
  await sql.unsafe('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions');
  await sql.unsafe(await readFile(new URL('../supabase/access.sql',import.meta.url),'utf8'));
  await sql.unsafe(await readFile(new URL('../supabase/demo-projects.sql',import.meta.url),'utf8'));
  await sql.unsafe(`
  UPDATE vibies_private.community SET instructor_github_id='999', instructor_nickname='Guide';
  INSERT INTO vibies_private.accounts(internal_id,github_id,github_username,nickname,status,onboarding_completed) VALUES ('00000000-0000-4000-8000-000000000001','9007199254740993','synthetic','ÉLAN','approved',true);
  INSERT INTO vibies_private.sessions(session_hash,github_id,created_at) VALUES ('synthetic-session','9007199254740993','2026-10-15T01:02:03.123456Z');
  INSERT INTO vibies_private.sign_in_flows(state_hash,browser_hash,created_at) VALUES ('synthetic-state','synthetic-browser','2026-10-15T01:02:03.123456Z');
  INSERT INTO vibies_private.sign_in_attempts(id,browser_hash,created_at) OVERRIDING SYSTEM VALUE VALUES (41,'synthetic-browser','2026-10-15T01:02:03.123456Z');
  SELECT setval('vibies_private.sign_in_attempts_id_seq',71,false);
  INSERT INTO vibies_private.instructor_audit(id,previous_github_id,new_github_id,reason,created_at) OVERRIDING SYSTEM VALUE VALUES (8,NULL,'999',E'Synthetic quote '' and newline\\n雪','2026-10-15T01:02:03.123456Z');
  SELECT setval('vibies_private.instructor_audit_id_seq',90,true);
  INSERT INTO vibies_private.personal_projects(id,owner_account_id,repository_id,title,summary,version,created_at,updated_at) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','9007199254740993','Synthetic project','Synthetic summary',9007199254740993,'2026-10-15T01:02:03.123456Z','2026-10-15T01:02:03.123456Z');
  INSERT INTO vibies_private.project_milestones(id,project_id,title,position,created_at,updated_at) VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Synthetic step',1,'2026-10-15T01:02:03.123456Z','2026-10-15T01:02:03.123456Z');
  SELECT setval('public.demo_projects_id_seq',20,false);`);
  await runIsolatedGpg({homedir:home,args:['--rfc4880','--pinentry-mode','loopback','--passphrase','','--quick-generate-key','Synthetic Migration <migration@vibies.invalid>','rsa2048','cert','1d']});
  const listing=(await runIsolatedGpg({homedir:home,args:['--with-colons','--list-keys']})).toString('utf8');
  const fingerprint=listing.split('\n').find(line=>line.startsWith('fpr:'))?.split(':')[9];
  assert.match(fingerprint,/^[A-F0-9]{40}$/);
  await runIsolatedGpg({homedir:home,args:['--rfc4880','--pinentry-mode','loopback','--passphrase','','--quick-add-key',fingerprint,'rsa2048','encr','1d']});
  const publicKey=(await runIsolatedGpg({homedir:home,args:['--armor','--export','migration@vibies.invalid']})).toString('utf8');
  const expected={environment:'staging',sourceProject:'synthetic',destinationDatabase:'synthetic-d1'};
  // Independent canonical column manifest; no source row values are displayed.
  const metadata=await sql.unsafe(`SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE (table_schema='vibies_private' AND table_name IN (${Object.keys(columns).filter(x=>x!=='demo_projects').map(x=>`'${x}'`).join(',')})) OR (table_schema='public' AND table_name='demo_projects') ORDER BY table_schema,table_name,ordinal_position`);
  expected.schemaHash=sha256(metadata.map(row=>`${row.table_schema}.${row.table_name}.${row.column_name}:${row.data_type}:${row.is_nullable}`).join('\n'));
  const result=await sql.unsafe(sourceExportSql({...expected,publicKey}));
  const encrypted=result.flat().find(row=>row.encrypted_snapshot)?.encrypted_snapshot;
  assert.equal(typeof encrypted,'string');
  const ciphertext=Buffer.from(encrypted,'base64');
  assert.ok(ciphertext.length>1000);
  assert.ok(!ciphertext.includes(Buffer.from('Synthetic summary')));
  await saveEncryptedBackup({ciphertext,path:`${home}/snapshot.pgp`,repositoryRoot:process.cwd()});
  await assert.rejects(decryptSnapshot(ciphertext.subarray(0,Math.floor(ciphertext.length/2)),bytes=>decryptOpenPgpInMemory(bytes,{homedir:home})), /Snapshot decryption failed/);
  const snapshot=await decryptSnapshot(ciphertext,bytes=>decryptOpenPgpInMemory(bytes,{homedir:home}));
  assert.equal(snapshot.schemaHash,expected.schemaHash);
  assert.equal(snapshot.tables.accounts[0].nickname_key,'élan');
  assert.equal(snapshot.tables.personal_projects[0].version,'9007199254740993');
  assert.equal(snapshot.tables.sessions[0].created_at,'2026-10-15T01:02:03.123456Z');
  mf=new Miniflare({workers:[{modules:true,compatibilityDate:'2026-08-06',script:"export default {fetch(){return new Response('Synthetic encrypted migration');}}",d1Databases:{DB:'synthetic-encrypted-roundtrip'}}]});
  const db=await mf.getD1Database('DB');
  const schema=await readFile(new URL('../d1/migrations/0001_application.sql',import.meta.url),'utf8');
  await db.batch(schema.replace(/^--.*$/gm,'').split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean).map(statement=>db.prepare(statement)));
  const transport={identity:async()=>({environment:'staging',databaseId:'synthetic-d1',state:'disabled',empty:true}),
   batch:async statements=>db.batch(statements.map(({sql,params})=>db.prepare(sql).bind(...params))),
   readTables:async tables=>Object.fromEntries(await Promise.all(tables.map(async table=>{
     const projection=columns[table].map(column=>(column==='version'||column==='position'||(column==='id'&&['sign_in_attempts','instructor_audit','demo_projects'].includes(table)))?`CAST("${column}" AS TEXT) AS "${column}"`:`"${column}"`).join(',');
     return [table,(await db.prepare(`SELECT ${projection} FROM "${table}"`).all()).results];
   }))),
   readSequences:async tables=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await db.prepare('SELECT CAST(seq AS TEXT) AS seq FROM sqlite_sequence WHERE name=?').bind(table).first('seq')]))),
  };
  const manifest=await rehearseImport(snapshot,expected,transport);
  assert.equal(Object.values(manifest.tables).reduce((sum,table)=>sum+table.count,0),10);
  assert.equal(await db.prepare("INSERT INTO sign_in_attempts(browser_hash) VALUES('next') RETURNING id").first('id'),71);
  assert.equal(await db.prepare("INSERT INTO instructor_audit(new_github_id,reason) VALUES('999','next') RETURNING id").first('id'),91);
  assert.equal(await db.prepare("INSERT INTO demo_projects(title,summary) VALUES('next','next') RETURNING id").first('id'),20);
 } finally {
  await mf?.dispose();
  await sql?.end();
  if(created)await admin.unsafe(`DROP DATABASE ${name}`);
  await admin.end();
  await new Promise(resolve=>{const child=spawn(process.platform === 'darwin' ? '/opt/homebrew/bin/gpgconf' : '/usr/bin/gpgconf',['--homedir',home,'--kill','gpg-agent'],{stdio:'ignore'});child.on('error',resolve);child.on('close',resolve);});
  await rm(home,{recursive:true,force:true});
 }
});
