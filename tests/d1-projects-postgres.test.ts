import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import postgres from 'postgres';
import * as api from '../lib/d1/projects.ts';
import type { AccessDatabase } from '../lib/d1/access.ts';

const databaseUrl=process.env.VIBIES_TEST_DATABASE_URL;
const hash=(id:number)=>id.toString(16).padStart(64,'0');
const casts={
  connect_project:['text','text','text','text','text'],
  project_actor:['text'],project_operation_context:['text','uuid'],
  projects:['text'],project:['text','uuid'],
  publish_project:['text','uuid','bigint'],record_project_connection:['text','uuid','bigint','boolean'],
  edit_project:['text','uuid','bigint','text','text','text'],delete_project:['text','uuid','bigint'],
  moderate_project:['text','uuid','bigint','boolean'],
  add_project_milestone:['text','uuid','bigint','text','text'],
  edit_project_milestone:['text','uuid','uuid','bigint','text','text'],
  set_project_milestone_completion:['text','uuid','uuid','bigint','boolean'],
  move_project_milestone:['text','uuid','uuid','bigint','text'],
  delete_project_milestone:['text','uuid','uuid','bigint'],
} as const;
// Each database allocates its own UUIDs and clock timestamps. Compare all other
// observable fields; independent schema tests verify exact ID/time retention.
function comparable(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(comparable);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,entry])=>[
    key,key==='id'?'allocated-id':key==='lastCheckedAt'&&entry!==null?'checked-timestamp':comparable(entry),
  ]));
  return value;
}

test('D1 project results match PostgreSQL source functions on synthetic fixtures', {skip:!databaseUrl},async(t)=> {
  const target=new URL(databaseUrl!);
  if(!['postgres:','postgresql:'].includes(target.protocol)||!['127.0.0.1','localhost','::1'].includes(target.hostname)||target.pathname!=='/vibies_access_test')
    throw new Error('Parity requires the isolated loopback vibies_access_test fixture');
  const sql=postgres(databaseUrl!,{max:1,onnotice:()=>{}});
  const mf=new Miniflare({workers:[{modules:true,compatibilityDate:'2026-08-06',
    script:"export default { fetch() { return new Response('Synthetic parity'); } };",d1Databases:{DB:'synthetic-postgres-project-parity'}}]});
  try {
    await sql.unsafe('DROP SCHEMA IF EXISTS vibies_private CASCADE');
    await sql.unsafe(readFileSync(new URL('../supabase/access.sql',import.meta.url),'utf8'));
    const binding=await mf.getD1Database('DB');const db:AccessDatabase=binding;
    const schema=readFileSync(new URL('../d1/migrations/0001_application.sql',import.meta.url),'utf8');
    await binding.batch(schema.replace(/^--.*$/gm,'').split(/;\s*(?:\n|$)/).map(value=>value.trim()).filter(Boolean).map(value=>binding.prepare(value)));
    await sql.unsafe("UPDATE vibies_private.community SET instructor_github_id='99',instructor_nickname='Tutor'");
    await binding.prepare("UPDATE community SET instructor_github_id='99',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
    for(let user=1;user<=5;user++) {
      const status=user===4?'unapproved':user===5?'revoked':'approved';
      const nickname=status==='unapproved'?null:`Member ${user}`;
      const id=`00000000-0000-4000-8000-${String(user).padStart(12,'0')}`;
      await sql.unsafe('INSERT INTO vibies_private.accounts(internal_id,github_id,github_username,nickname,status) VALUES($1::uuid,$2,$3,$4,$5)',[id,String(user),`member${user}`,nickname,status]);
      await binding.prepare('INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,?)').bind(id,String(user),`member${user}`,nickname,nickname?.toLowerCase()??null,status).run();
    }
    for(const user of [1,2,3,4,5,99]) {
      await sql.unsafe('INSERT INTO vibies_private.sessions(session_hash,github_id) VALUES($1,$2)',[hash(user),String(user)]);
      await binding.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').bind(hash(user),String(user)).run();
    }
    const compare=async(name:keyof typeof casts,args:unknown[],d1args:unknown[]=args)=> {
      const placeholders=casts[name].map((cast,index)=>`$${index+1}::${cast}`).join(',');
      const [pg]=await sql.unsafe(`SELECT vibies_private.${name}(${placeholders}) AS result`,args as never[]);
      const execute=api[name] as unknown as (database:AccessDatabase,...values:unknown[])=>Promise<unknown>;
      const d1=await execute(db,...d1args);
      assert.deepEqual(comparable(d1),comparable(pg.result),`${name} parity`);
      return {pg:pg.result as Record<string,unknown>,d1:d1 as Record<string,unknown>};
    };
    await t.test('Unicode nickname keys match sampled PostgreSQL Unicode lowercase behavior',async()=> {
      for(const sample of ['ÉLAN','İpek','ΣΙΓΜΑ','Kelvin','Straße','𐐀𐐁','ᎠᎡ','Ⅷ_۱۲']) {
        const [row]=await sql.unsafe('SELECT lower($1::text COLLATE pg_catalog."unicode") AS key',[sample]);
        assert.equal(sample.toLowerCase(),row.key,`Unicode lowercase parity: ${sample}`);
      }
    });
    let pgId='';let d1Id='';
    await t.test('connection, identity and access scopes',async()=> {
      const pair=await compare('connect_project',[hash(1),'101','Seedling','Synthetic',null]);
      pgId=pair.pg.id as string;d1Id=pair.d1.id as string;
      await compare('connect_project',[hash(1),'101','Changed','Changed',null]);
      await compare('connect_project',[hash(2),'101','Changed','Changed',null]);
      for(const user of [1,2,4,5,99]) {
        await compare('project_actor',[hash(user)]);
        await compare('project_operation_context',[hash(user),pgId],[hash(user),d1Id]);
        await compare('project',[hash(user),pgId],[hash(user),d1Id]);
        await compare('projects',[hash(user)]);
      }
    });
    await t.test('roadmap content, completion, ordering and stale writes',async()=> {
      await compare('add_project_milestone',[hash(1),pgId,'1','First','Waiting'],[hash(1),d1Id,'1','First','Waiting']);
      await compare('add_project_milestone',[hash(1),pgId,'2','Second',null],[hash(1),d1Id,'2','Second',null]);
      const pgRows=await sql.unsafe('SELECT id FROM vibies_private.project_milestones WHERE project_id=$1::uuid ORDER BY position',[pgId]);
      const d1Rows=await binding.prepare('SELECT id FROM project_milestones WHERE project_id=? ORDER BY position').bind(d1Id).all<{id:string}>();
      const pgFirst=pgRows[0].id,d1First=d1Rows.results[0].id,pgSecond=pgRows[1].id,d1Second=d1Rows.results[1].id;
      await compare('edit_project_milestone',[hash(1),pgId,pgFirst,'3','First','Waiting'],[hash(1),d1Id,d1First,'3','First','Waiting']);
      await compare('set_project_milestone_completion',[hash(1),pgId,pgFirst,'3',true],[hash(1),d1Id,d1First,'3',true]);
      await compare('edit_project_milestone',[hash(1),pgId,pgFirst,'4','First','Blocked'],[hash(1),d1Id,d1First,'4','First','Blocked']);
      await compare('move_project_milestone',[hash(1),pgId,pgSecond,'4','up'],[hash(1),d1Id,d1Second,'4','up']);
      await compare('project',[hash(1),pgId],[hash(1),d1Id]);
      await compare('delete_project_milestone',[hash(1),pgId,pgFirst,'4'],[hash(1),d1Id,d1First,'4']);
      await compare('delete_project_milestone',[hash(1),pgId,pgFirst,'5'],[hash(1),d1Id,d1First,'5']);
      await compare('project',[hash(1),pgId],[hash(1),d1Id]);
    });
    await t.test('publication, moderation, disconnection, editing and deletion',async()=> {
      await compare('publish_project',[hash(1),pgId,'6'],[hash(1),d1Id,'6']);
      for(const user of [1,2,99]) {
        await compare('project',[hash(user),pgId],[hash(user),d1Id]);await compare('projects',[hash(user)]);
      }
      await compare('moderate_project',[hash(99),pgId,'7',true],[hash(99),d1Id,'7',true]);
      for(const user of [1,2,99]) await compare('project',[hash(user),pgId],[hash(user),d1Id]);
      await compare('record_project_connection',[hash(1),pgId,'8',false],[hash(1),d1Id,'8',false]);
      await compare('edit_project',[hash(1),pgId,'9','Edited','Summary','https://example.test'],[hash(1),d1Id,'9','Edited','Summary','https://example.test']);
      await compare('record_project_connection',[hash(1),pgId,'10',true],[hash(1),d1Id,'10',true]);
      await compare('moderate_project',[hash(99),pgId,'11',false],[hash(99),d1Id,'11',false]);
      await compare('project',[hash(2),pgId],[hash(2),d1Id]);
      await compare('delete_project',[hash(2),pgId,'12'],[hash(2),d1Id,'12']);
      await compare('delete_project',[hash(1),pgId,'12'],[hash(1),d1Id,'12']);
      await compare('project',[hash(1),pgId],[hash(1),d1Id]);
      const [pg]=await sql.unsafe("SELECT onboarding_completed FROM vibies_private.accounts WHERE github_id='1'");
      assert.equal(await binding.prepare("SELECT onboarding_completed FROM accounts WHERE github_id='1'").first('onboarding_completed'),pg.onboarding_completed?1:0);
    });
  } finally {await sql.end();await mf.dispose();}
});
