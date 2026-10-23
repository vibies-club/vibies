import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import type { AccessDatabase, D1Statement } from '../lib/d1/access.ts';
import * as api from '../lib/d1/projects.ts';

const hash=(id:number)=>id.toString(16).padStart(64,'0');

test('project operations preserve atomicity and authorization on local D1/workerd',async(t)=> {
  const mf=new Miniflare({workers:[{
    modules:true,compatibilityDate:'2026-08-06',
    script:"export default { fetch() { return new Response('Synthetic project test'); } };",
    d1Databases:{DB:'synthetic-project-parity'},
  }]});
  try {
    const binding=await mf.getD1Database('DB');
    const db:AccessDatabase=binding;
    const schema=readFileSync(new URL('../d1/migrations/0001_application.sql',import.meta.url),'utf8');
    const statements=schema.replace(/^--.*$/gm,'').split(/;\s*(?:\n|$)/).map(sql=>sql.trim()).filter(Boolean);
    await binding.batch(statements.map(sql=>binding.prepare(sql)));
    await binding.prepare("UPDATE community SET instructor_github_id='99',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
    for(let id=1;id<=5;id++) {
      const status=id===4?'unapproved':id===5?'revoked':'approved';
      await binding.prepare('INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),String(id),`member${id}`,status==='unapproved'?null:`Member ${id}`,status==='unapproved'?null:`member ${id}`,status).run();
      await binding.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').bind(hash(id),String(id)).run();
    }
    await binding.prepare('INSERT INTO sessions(session_hash,github_id) VALUES(?,?)').bind(hash(99),'99').run();
    let repository=100;
    const create=async(user=1)=> {
      const result=await api.connect_project(db,hash(user),String(repository++),'Seedling','A synthetic project');
      assert.equal(result.kind,'created');assert(result.id);return result.id;
    };
    const stored=async(id:string)=>binding.prepare('SELECT *,CAST(version AS TEXT) AS exactVersion FROM personal_projects WHERE id=?').bind(id).first<Record<string,unknown>>();
    const roadmap=async(id:string):Promise<Record<string,unknown>[]>=>(await binding.prepare('SELECT * FROM project_milestones WHERE project_id=? ORDER BY position').bind(id).all<Record<string,unknown>>()).results;
    const reset=async()=> {await binding.prepare('DELETE FROM personal_projects').run();};

    await t.test('publication and onboarding commit together and roll back together',async()=> {
      const id=await create();
      await binding.prepare("CREATE TRIGGER fail_onboarding BEFORE UPDATE OF onboarding_completed ON accounts BEGIN SELECT RAISE(ABORT,'synthetic onboarding failure'); END").run();
      await assert.rejects(api.publish_project(db,hash(1),id,'1'),/synthetic onboarding failure/);
      assert.equal((await stored(id))?.publication,'Draft');assert.equal((await stored(id))?.exactVersion,'1');
      await binding.prepare('DROP TRIGGER fail_onboarding').run();
      assert.deepEqual(await api.publish_project(db,hash(1),id,'1'),{kind:'published'});
      assert.equal(await binding.prepare("SELECT onboarding_completed FROM accounts WHERE github_id='1'").first('onboarding_completed'),1);
      assert.deepEqual(await api.publish_project(db,hash(1),id,'1'),{kind:'stale'});
      assert.deepEqual(await api.publish_project(db,hash(1),id,'2'),{kind:'already_published'});
      await api.delete_project(db,hash(1),id,'2');
      assert.equal(await binding.prepare("SELECT onboarding_completed FROM accounts WHERE github_id='1'").first('onboarding_completed'),1);
    });

    await t.test('twenty-row reorder preserves IDs, order and content within 24 SQL statements',async()=> {
      await reset();const id=await create();
      for(let index=1;index<=20;index++) assert.equal((await api.add_project_milestone(db,hash(1),id,String(index),`Step ${index}`)).kind,'added');
      assert.equal((await api.add_project_milestone(db,hash(1),id,'21','Overflow')).kind,'full');
      const before=await roadmap(id);const target=before[0].id as string;
      let queries=0;let maxBatch=0;
      const measured:AccessDatabase={
        prepare(sql) {queries++;return db.prepare(sql);},
        async batch<T>(queriesToRun:D1Statement[]) {maxBatch=Math.max(maxBatch,queriesToRun.length);return db.batch<T>(queriesToRun);},
      };
      assert.equal((await api.move_project_milestone(measured,hash(1),id,target,'21','down')).kind,'moved');
      assert.equal(queries,24);assert.equal(maxBatch,23);
      const after=await roadmap(id);
      assert.deepEqual(after.map(row=>row.id),[before[1].id,before[0].id,...before.slice(2).map(row=>row.id)]);
      for(const row of after) {
        const prior=before.find(candidate=>candidate.id===row.id)!;
        for(const key of ['title','completed','blocked_note','created_at']) assert.equal(row[key],prior[key]);
      }
      await binding.prepare("CREATE TRIGGER fail_reinsert BEFORE INSERT ON project_milestones BEGIN SELECT RAISE(ABORT,'synthetic reinsert failure'); END").run();
      await assert.rejects(api.move_project_milestone(db,hash(1),id,target,'22','up'),/synthetic reinsert failure/);
      assert.deepEqual(await roadmap(id),after);assert.equal((await stored(id))?.exactVersion,'22');
      await binding.prepare('DROP TRIGGER fail_reinsert').run();
      assert.equal((await api.delete_project_milestone(db,hash(1),id,target,'22')).kind,'deleted');
      const retained=await roadmap(id);
      assert.equal(retained.length,19);
      assert.deepEqual(retained.map(row=>row.position),Array.from({length:19},(_,n)=>n+1));
      assert.equal((await stored(id))?.exactVersion,'23');
      assert.equal((await api.delete_project(db,hash(1),id,'23')).kind,'deleted');
      assert.equal((await roadmap(id)).length,0);
    });

    await t.test('concurrent capacity, repository identity and stale updates stay atomic',async()=> {
      await reset();
      const projects=await Promise.all(Array.from({length:5},(_,n)=>api.connect_project(db,hash(1),String(300+n),'Concurrent','Synthetic')));
      assert.equal(projects.filter(row=>row.kind==='created').length,3);
      assert.equal(projects.filter(row=>row.kind==='full').length,2);
      const duplicate=await Promise.all([api.connect_project(db,hash(2),'500','Second','Synthetic'),api.connect_project(db,hash(3),'500','Third','Synthetic')]);
      assert.deepEqual(duplicate.map(row=>row.kind).sort(),['conflict','created']);
      const id=projects.find(row=>row.id)?.id;assert(id);
      const updates=await Promise.all([api.add_project_milestone(db,hash(1),id,'1','First'),api.add_project_milestone(db,hash(1),id,'1','Other')]);
      assert.deepEqual(updates.map(row=>row.kind).sort(),['added','stale']);
      assert.equal((await roadmap(id)).length,1);assert.equal((await stored(id))?.exactVersion,'2');
    });

    await t.test('snapshot races cannot erase concurrent data or bypass current membership',async()=> {
      await reset();const id=await create();
      await api.add_project_milestone(db,hash(1),id,'1','First');
      await api.add_project_milestone(db,hash(1),id,'2','Second');
      const target=(await roadmap(id))[0].id as string;
      let intercepted=false;
      const stale:AccessDatabase={prepare:sql=>db.prepare(sql),async batch<T>(queries:D1Statement[]) {
        if(!intercepted) {
          intercepted=true;
          await binding.batch([
            binding.prepare("UPDATE project_milestones SET title='Concurrent edit' WHERE id=?").bind(target),
            binding.prepare('UPDATE personal_projects SET version=version+1 WHERE id=?').bind(id),
          ]);
        }
        return db.batch<T>(queries);
      }};
      assert.equal((await api.move_project_milestone(stale,hash(1),id,target,'3','down')).kind,'stale');
      assert.equal((await roadmap(id))[0].title,'Concurrent edit');
      const revoked:AccessDatabase={prepare:sql=>db.prepare(sql),async batch<T>(queries:D1Statement[]) {
        await binding.prepare("UPDATE accounts SET status='revoked' WHERE github_id='1'").run();
        return db.batch<T>(queries);
      }};
      assert.equal((await api.delete_project_milestone(revoked,hash(1),id,target,'4')).kind,'forbidden');
      assert.equal((await roadmap(id)).length,2);assert.equal((await stored(id))?.exactVersion,'4');
      await binding.prepare("UPDATE accounts SET status='approved' WHERE github_id='1'").run();
    });

    await t.test('course roadmap seeds atomically, in order, only into an empty owned roadmap',async()=> {
      await reset();const id=await create();
      for(const user of [2,4,5,99]) assert.equal((await api.seed_project_roadmap(db,hash(user),id,'1')).kind,'forbidden');
      assert.equal((await api.seed_project_roadmap(db,hash(1),id,'2')).kind,'stale');
      await binding.prepare("CREATE TRIGGER fail_seed BEFORE INSERT ON project_milestones WHEN NEW.position=6 BEGIN SELECT RAISE(ABORT,'synthetic seed failure'); END").run();
      await assert.rejects(api.seed_project_roadmap(db,hash(1),id,'1'),/synthetic seed failure/);
      assert.equal((await roadmap(id)).length,0);assert.equal((await stored(id))?.exactVersion,'1');
      await binding.prepare('DROP TRIGGER fail_seed').run();
      const both=await Promise.all([api.seed_project_roadmap(db,hash(1),id,'1'),api.seed_project_roadmap(db,hash(1),id,'1')]);
      assert.deepEqual(both.map(row=>row.kind).sort(),['seeded','stale']);
      assert.deepEqual((await roadmap(id)).map(row=>[row.title,row.position,row.completed]),
        ['Core screen','Works on demo data','Data and sign-in','3 real users','Polish and SEO','Demo Day'].map((title,n)=>[title,n+1,0]));
      assert.equal((await stored(id))?.exactVersion,'2');
      assert.equal((await api.seed_project_roadmap(db,hash(1),id,'2')).kind,'not_empty');
      assert.equal((await roadmap(id)).length,6);
      const mine=(await api.projects(db,hash(1))).mine!;
      assert.equal(mine[0].nextMilestone,'Core screen');assert.equal(mine[0].progressPercentage,0);
      const other=await create();
      await api.add_project_milestone(db,hash(1),other,'1','Own step');
      assert.equal((await api.seed_project_roadmap(db,hash(1),other,'2')).kind,'not_empty');
      assert.equal((await roadmap(other)).length,1);
    });

    await t.test('owner-only mutations, reads and moderation respect scope and expiration',async()=> {
      await reset();const id=await create();
      await api.add_project_milestone(db,hash(1),id,'1','First','Waiting');
      const target=(await roadmap(id))[0].id as string;
      for(const user of [2,4,5,99]) {
        const actor=hash(user);
        const outcomes=await Promise.all([
          api.publish_project(db,actor,id,'2'),api.edit_project(db,actor,id,'2','Changed','Summary'),
          api.record_project_connection(db,actor,id,'2',false),api.delete_project(db,actor,id,'2'),
          api.add_project_milestone(db,actor,id,'2','Other'),api.edit_project_milestone(db,actor,id,target,'2','Changed'),
          api.set_project_milestone_completion(db,actor,id,target,'2',true),api.move_project_milestone(db,actor,id,target,'2','down'),
          api.delete_project_milestone(db,actor,id,target,'2'),
        ]);
        assert(outcomes.every(row=>row.kind==='forbidden'));
      }
      assert.equal((await api.project(db,hash(2),id)).kind,'missing');
      await api.publish_project(db,hash(1),id,'2');
      assert.equal((await api.project(db,hash(2),id)).project?.version,undefined);
      assert.equal((await api.project(db,hash(99),id)).project?.version,'3');
      await api.moderate_project(db,hash(99),id,'3',true);
      assert.equal((await api.project(db,hash(2),id)).kind,'missing');
      assert.equal((await api.project(db,hash(99),id)).project?.moderation,'Hidden');
      assert.equal((await api.projects(db,hash(2))).community?.length,0);
      await binding.prepare("UPDATE sessions SET created_at='2000-01-01T00:00:00Z' WHERE session_hash=?").bind(hash(1)).run();
      assert.equal((await api.edit_project(db,hash(1),id,'4','Changed','Summary')).kind,'forbidden');
      assert.equal((await api.project(db,hash(1),id)).kind,'forbidden');
      assert.equal((await stored(id))?.exactVersion,'4');
    });
  } finally {await mf.dispose();}
});
