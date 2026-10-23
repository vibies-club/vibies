import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {test} from 'node:test';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {createHash} from 'node:crypto';

const origin='https://worker.test';
const token=n=>n.toString(16).padStart(64,'0');
const hash=n=>createHash('sha256').update(token(n)).digest('hex');
const P1='aaaaaaaa-1111-4111-8111-111111111111';
const ago=days=>new Date(Date.now()-days*86_400_000).toISOString();

// Synthetic people: 1 is the Instructor (Hivekeeper); 2 Pixel owns P1; 3 Nova; 4 Sprout.
test('Collaborate HTTP boundary: jobs, teams and shares are decided in SQL',async t=>{
 const output=await build({entryPoints:[new URL('./index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','cloudflare:*'],conditions:['workerd','worker','browser'],logLevel:'silent'});
 const options={modules:[{type:'ESModule',path:'worker.js',contents:output.outputFiles[0].text}],compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'collaborate-boundary'},bindings:{VIBIES_APP_ORIGIN:origin,VIBIES_ENVIRONMENT:'test'}};
 const mf=new Miniflare(options);
 try{
  let db=await mf.getD1Database('DB');
  for(const file of readdirSync(new URL('../d1/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())
   await db.batch(unstable_splitSqlQuery(readFileSync(new URL(`../d1/migrations/${file}`,import.meta.url),'utf8')).map(sql=>db.prepare(sql)));
  await db.prepare("UPDATE deployment_activation SET state='reconciled',environment_id='test',snapshot_hash='synthetic',reconciled_at='2026-01-01'").run();
  await db.prepare("UPDATE deployment_activation SET state='active',activated_at='2026-01-01'").run();
  await db.prepare("UPDATE community SET instructor_github_id='1',instructor_nickname='Hivekeeper',instructor_nickname_key='hivekeeper'").run();
  for(let n=1;n<=4;n++)await db.prepare("INSERT INTO sessions(session_hash,github_id,created_at,auth_provider) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'github')").bind(hash(n),String(n)).run();
  for(const [n,name] of [[2,'Pixel'],[3,'Nova'],[4,'Sprout']])await db.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,'approved')").bind(`acc${n}`,String(n),`member${n}`,name,name.toLowerCase()).run();
  await db.prepare(`INSERT INTO personal_projects(id,owner_account_id,repository_id,title,summary,publication) VALUES('${P1}','acc2','101','Habit Hive','Synthetic','Published')`).run();
  const get=async(path,n)=>(await mf.dispatchFetch(origin+'/api/page?path='+encodeURIComponent(path),{headers:{cookie:`__Host-vibies-session=${token(n)}`}})).json();
  const post=(body,n)=>mf.dispatchFetch(origin+'/collaborate/action',{redirect:'manual',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(n)}`},body:new URLSearchParams(body).toString()});
  const message=r=>new URL(r.headers.get('location'),origin).searchParams.get('message');
  const terms={title:'Add a dark mode',description:'Make the habit screen readable at night.',deliverable:'pull_request',windowDays:'7',money:'120',criterion1:'Toggle in settings',criterion2:'Colors pass contrast',skills:'css, react'};
  const postJob=async(n=2,extra={})=>{const r=await post({action:'job_post',...terms,...extra},n);assert.equal(r.status,303);const id=r.headers.get('location').match(/jobs\/([0-9a-f-]{36})/)?.[1];assert.ok(id,r.headers.get('location'));return id;};
  const version=async id=>String(await db.prepare('SELECT version FROM jobs WHERE id=?').bind(id).first('version'));
  const act=async(action,id,n,extra={})=>post({action,id,version:await version(id),...extra},n);

  await t.test('claims: own job and Instructor 403, second claim is taken, outcome fields are 400',async()=>{
   const id=await postJob();
   assert.equal((await act('job_claim',id,2)).status,403);
   assert.equal((await act('job_claim',id,1)).status,403);
   for(const field of ['tier','state','effective_state'])assert.equal((await act('job_claim',id,3,{[field]:'100'})).status,400,field);
   assert.equal(message(await act('job_claim',id,3)),'claimed');
   assert.equal(message(await act('job_claim',id,4)),'taken');
   assert.equal((await post({action:'job_post',...terms,state:'paid'},2)).status,400);
   const page=await get('/collaborate/jobs/'+id,4);assert.equal(page.job.job.state,'claimed');assert.equal(page.job.job.claimant,'Nova');assert.equal(page.job.job.events,null);
  });
  await t.test('delivery is https only; only the poster accepts; the lifecycle reaches paid',async()=>{
   const id=await postJob();
   await act('job_claim',id,3);
   assert.equal(message(await act('job_deliver',id,3,{url:'http://example.com/pr/1',note:'Done'})),'invalid_delivery');
   assert.equal(message(await act('job_deliver',id,3,{url:'javascript:alert(1)',note:'Done'})),'invalid_delivery');
   assert.equal(message(await act('job_deliver',id,3,{url:'https://example.com/pr/1',note:'Done'})),'delivered');
   assert.equal((await act('job_accept',id,3)).status,403);
   assert.equal((await act('job_accept',id,4)).status,403);
   assert.equal(message(await act('job_changes',id,2,{failed2:'yes',note:'Buttons fail contrast'})),'changes_requested');
   assert.equal(message(await act('job_deliver',id,3,{url:'https://example.com/pr/2',note:'Fixed'})),'delivered');
   assert.equal(message(await act('job_accept',id,2)),'accepted');
   assert.equal(message(await act('job_paid',id,2,{amount:'120',paidOn:new Date().toISOString().slice(0,10),note:'Bank transfer'})),'paid');
   assert.equal(message(await act('job_receipt',id,3)),'receipt_confirmed');
   const page=await get('/collaborate/jobs/'+id,3);
   assert.deepEqual(page.job.job.events.map(e=>e.kind),['posted','claimed','delivered','changes_requested','delivered','accepted','paid','receipt_confirmed']);
   assert.equal(page.job.job.finalTier,100);
  });
  await t.test('expiry, auto-acceptance and a revoked claimant are derived at read time',async()=>{
   const id=await postJob(2,{windowDays:'2'});
   await act('job_claim',id,3);
   await db.prepare('UPDATE jobs SET claimed_at=? WHERE id=?').bind(ago(5),id).run();
   let page=await get('/collaborate/jobs/'+id,4);assert.equal(page.job.job.state,'open');assert.equal(page.job.job.claimant,null);
   assert.equal(message(await act('job_claim',id,4)),'claimed');
   await act('job_deliver',id,4,{url:'https://example.com/x',note:'Here'});
   await db.prepare('UPDATE jobs SET delivered_at=? WHERE id=?').bind(ago(8),id).run();
   page=await get('/collaborate/jobs/'+id,2);assert.equal(page.job.job.state,'accepted');assert.equal(page.job.job.lapse,'auto_accepted');
   const other=await postJob();await act('job_claim',other,4);
   await db.prepare("UPDATE accounts SET status='revoked' WHERE internal_id='acc4'").run();
   page=await get('/collaborate/jobs/'+other,3);assert.equal(page.job.job.state,'open');
   await db.prepare("UPDATE accounts SET status='approved' WHERE internal_id='acc4'").run();
  });
  await t.test('shares: insufficient_share, N+1 activation sums to 100, non-listed acceptance 403',async()=>{
   assert.equal(message(await post({action:'team_invite',projectId:P1,from:'project',member:'Sprout',role:'Designer'},2)),'team_invited');
   assert.equal(message(await post({action:'team_accept',projectId:P1,from:'teams'},4)),'team_joined');
   assert.equal(message(await post({action:'agreement_propose',projectId:P1,from:'project',basis:'0',member1:'Pixel',role1:'Owner',percent1:'80',member2:'Sprout',role2:'Designer',percent2:'10'},2)),'agreement_invalid');
   assert.equal(message(await post({action:'agreement_propose',projectId:P1,from:'project',basis:'0',member1:'Pixel',role1:'Owner',percent1:'80',member2:'Sprout',role2:'Designer',percent2:'20'},2)),'agreement_proposed');
   const pending=await db.prepare("SELECT id FROM share_agreements WHERE status='pending'").first('id');
   assert.equal((await post({action:'agreement_accept',projectId:P1,from:'teams',agreementId:pending,version:'1'},3)).status,403);
   const board=await get('/collaborate',4);assert.equal(board.collab.pending[0].agreementId,pending);
   assert.equal(message(await post({action:'agreement_accept',projectId:P1,from:'teams',agreementId:pending,version:'1'},4)),'agreement_activated');
   assert.equal(message(await post({action:'job_post',...terms,money:'',share:'90',projectId:P1},2)),'insufficient_share');
   const id=await postJob(2,{money:'',share:'10',projectId:P1});
   await act('job_claim',id,3);await act('job_deliver',id,3,{url:'https://example.com/pr/9',note:'Shipped'});
   assert.equal(message(await act('job_accept',id,2)),'accepted');
   const active=await db.prepare("SELECT id,version,source FROM share_agreements WHERE project_id=? AND status='active'").bind(P1).first();
   assert.equal(active.version,2);assert.equal(active.source,'job');
   assert.equal(await db.prepare('SELECT sum(percent) s FROM share_agreement_lines WHERE agreement_id=?').bind(active.id).first('s'),100);
   const team=(await get('/projects/'+P1,4)).team;assert.equal(team.active.version,2);assert.deepEqual(team.active.lines.map(l=>[l.nickname,l.percent]),[['Pixel',70],['Sprout',20],['Nova',10]]);
   assert.equal((await get('/projects/'+P1,1)).team.insider,true);
  });
  await t.test('disputes: accept points to a dispute, the Instructor resolves what the line covers',async()=>{
   // P1 is Pixel 70, Sprout 20, Nova 10 here. Two 60% jobs cannot both come from a 70% line.
   const a=await postJob(2,{money:'',share:'60',projectId:P1}),b=await postJob(2,{money:'',share:'60',projectId:P1});
   await act('job_claim',a,3);await act('job_deliver',a,3,{url:'https://example.com/pr/a',note:'A'});
   await act('job_claim',b,4);await act('job_deliver',b,4,{url:'https://example.com/pr/b',note:'B'});
   assert.equal(message(await act('job_accept',a,2)),'accepted');
   assert.equal(message(await act('job_accept',b,2)),'accept_insufficient_share');
   assert.equal(message(await act('job_dispute',b,2,{reason:'My line is too small now'})),'disputed');
   assert.equal((await act('job_resolve',b,2,{outcome:'paid',payout:'100',reason:'Mine'})).status,403);
   assert.equal(message(await act('job_resolve',b,1,{outcome:'paid',payout:'100',reason:'Settle what the line covers'})),'resolved');
   const page=await get('/collaborate/jobs/'+b,4);
   assert.equal(page.job.job.state,'paid');assert.equal(page.job.job.shareGranted,10);assert.equal(page.job.job.confirmed,false);
   const last=page.job.job.events.at(-1);assert.equal(last.kind,'resolved');assert.deepEqual([last.detail.share,last.detail.shortfall],[10,50]);
   assert.equal(message(await act('job_receipt',b,4)),'receipt_confirmed');
  });
  await t.test('hidden jobs are invisible to other Members; the Instructor moderates',async()=>{
   const id=await postJob();
   assert.equal((await act('job_hide',id,2)).status,403);
   assert.equal(message(await act('job_hide',id,1)),'hidden');
   assert.equal((await get('/collaborate/jobs/'+id,3)).job.kind,'missing');
   assert.ok(!(await get('/collaborate',3)).collab.jobs.some(job=>job.id===id));
   assert.equal((await get('/collaborate/jobs/'+id,2)).job.job.hidden,true);
   assert.equal(message(await act('job_claim',id,3)),'hidden_job');
   assert.equal(message(await act('job_restore',id,1)),'restored');
  });
  await t.test('ideas, comments and pledges: authors, owners and the Instructor are checked in SQL',async()=>{
   const idea={title:'Swap leftovers',problem:'Students throw away food every week.',audience:'Students in shared flats',stage:'idea'};
   assert.equal((await post({action:'idea_post',...idea,help_designer:'yes'},1)).status,403);
   assert.equal((await post({action:'idea_post',...idea,stage:'launched'},3)).headers.get('location'),'/collaborate?message=idea_invalid#idea-new');
   const r=await post({action:'idea_post',...idea,help_designer:'yes',help_funding:'yes'},3);assert.equal(r.status,303);
   const id=r.headers.get('location').match(/ideas\/([0-9a-f-]{36})/)[1];
   assert.equal((await post({action:'idea_edit',id,version:'1',...idea,title:'Taken over'},4)).status,403);
   assert.equal((await post({action:'idea_edit',id,version:'1',...idea,state:'building'},3)).status,400);
   assert.equal(message(await post({action:'idea_interest',id,role:'Designer'},3)),'idea_own_idea');
   assert.equal(message(await post({action:'idea_interest',id,role:'Designer',note:'I can draw the screens'},4)),'idea_interested');
   assert.equal(message(await post({action:'comment_post',id,body:'Ask the canteen first.'},1)),'idea_commented');
   const page=await get('/collaborate/ideas/'+id,2);assert.deepEqual(page.idea.idea.help,['designer','funding']);assert.equal(page.idea.idea.interest[0].nickname,'Sprout');assert.equal(page.idea.idea.comments[0].author,'Hivekeeper');
   assert.equal((await get('/collaborate',2)).ideas[0].id,id);
   assert.equal((await post({action:'comment_post',id:'11111111-1111-4111-8111-111111111111',body:'Hello'},2)).status,404);
   assert.equal((await post({action:'funding_set',projectId:P1,version:'0',seeking:'yes',goal:'500'},3)).status,403);
   assert.equal(message(await post({action:'funding_set',projectId:P1,version:'0',seeking:'yes',goal:'500'},2)),'funding_saved');
   assert.equal(message(await post({action:'pledge_post',projectId:P1,amount:'120'},2)),'funding_own_project');
   assert.equal(message(await post({action:'pledge_post',projectId:P1,amount:'120',note:'After payday'},3)),'funding_pledged');
   assert.equal(message(await post({action:'pledge_post',projectId:P1,amount:'200'},1)),'funding_pledged');
   const pledge=await db.prepare('SELECT id FROM pledges WHERE pledger_account_id=?').bind('acc3').first('id');
   assert.equal((await post({action:'pledge_received',projectId:P1,pledgeId:pledge},3)).status,403);
   assert.equal(message(await post({action:'pledge_received',projectId:P1,pledgeId:pledge},2)),'funding_received');
   const seen=(await get('/projects/'+P1,4)).funding;assert.equal(seen.pledged,320);assert.equal(seen.received,120);assert.equal(seen.pledges.length,0);
   assert.equal((await get('/projects/'+P1,2)).funding.pledges.length,2);
   // Moderation: the Instructor hides and restores; Members get 403; hidden ideas refuse comments.
   const comment=await db.prepare('SELECT id FROM comments WHERE target_id=?').bind(id).first('id');
   assert.equal((await post({action:'comment_hide',id,commentId:comment},3)).status,403);
   assert.equal(message(await post({action:'comment_hide',id,commentId:comment},1)),'idea_comment_hidden');
   assert.equal((await get('/collaborate/ideas/'+id,2)).idea.idea.comments.length,0);
   assert.equal(message(await post({action:'comment_restore',id,commentId:comment},1)),'idea_comment_restored');
   const ideaVersion=String(await db.prepare('SELECT version FROM ideas WHERE id=?').bind(id).first('version'));
   assert.equal((await post({action:'idea_hide',id,version:ideaVersion},4)).status,403);
   assert.equal(message(await post({action:'idea_hide',id,version:ideaVersion},1)),'idea_hidden');
   assert.equal((await get('/collaborate/ideas/'+id,2)).idea.kind,'missing');
   assert.equal((await get('/collaborate/ideas/'+id,3)).idea.idea.hidden,true);
   assert.equal(message(await post({action:'comment_post',id,body:'Hello?'},4)),'idea_hidden_idea');
   assert.equal(message(await post({action:'idea_restore',id,version:String(Number(ideaVersion)+1)},1)),'idea_restored');
  });
  await t.test('read-only blocks every Collaborate POST while reads still work',async()=>{
   await mf.setOptions({...options,bindings:{...options.bindings,VIBIES_READ_ONLY:'1'}});
   db=await mf.getD1Database('DB');
   const id=await db.prepare('SELECT id FROM jobs LIMIT 1').first('id');
   const before=await db.prepare('SELECT count(*) n FROM job_events').first('n');
   for(const action of ['job_post','job_claim','job_deliver','job_accept','job_hide','team_invite','agreement_propose','agreement_accept','idea_post','idea_interest','comment_post','funding_set','pledge_post','pledge_withdraw','idea_hide','comment_hide'])
    assert.equal((await post({action,id,version:'1',projectId:P1,from:'teams',...terms},['job_hide','idea_hide','comment_hide'].includes(action)?1:3)).status,503,action);
   assert.ok((await get('/collaborate',3)).ideas.length>0);assert.equal((await get('/projects/'+P1,3)).funding.seeking,true);
   assert.equal(await db.prepare('SELECT count(*) n FROM job_events').first('n'),before);
   const board=await get('/collaborate',3);assert.equal(board.kind,'ok');assert.ok(board.collab.jobs.length>0);
   assert.equal((await get('/collaborate/jobs/'+id,3)).job.kind,'ok');
   await mf.setOptions(options);db=await mf.getD1Database('DB');
  });
  await t.test('origin and form rules match the other actions',async()=>{
   assert.equal((await mf.dispatchFetch(origin+'/collaborate/action',{method:'GET'})).status,405);
   assert.equal((await mf.dispatchFetch(origin+'/collaborate/action',{redirect:'manual',method:'POST',headers:{origin:'https://evil.test','content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(3)}`},body:'action=job_claim'})).status,403);
   assert.equal((await post({action:'job_claim',id:'11111111-1111-4111-8111-111111111111',version:'1'},3)).status,404);
   assert.equal((await post({action:'unknown'},3)).status,400);
   assert.equal((await post({action:'job_cancel',id:'11111111-1111-4111-8111-111111111111',version:'1'},3)).status,400);
  });
 }finally{await mf.dispose();}
});
