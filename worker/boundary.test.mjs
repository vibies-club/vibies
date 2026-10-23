import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {createHash} from 'node:crypto';
const origin='https://worker.test';
const token=n=>n.toString(16).padStart(64,'0');
const hash=n=>createHash('sha256').update(token(n)).digest('hex');
test('Worker HTTP boundary uses local D1 authorization and native routes',async t=>{
 const output=await build({entryPoints:[new URL('./index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','cloudflare:*'],conditions:['workerd','worker','browser'],logLevel:'silent'});
 const options={modules:[{type:'ESModule',path:'worker.js',contents:output.outputFiles[0].text}],compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'worker-boundary'},bindings:{VIBIES_APP_ORIGIN:origin,VIBIES_ENVIRONMENT:'test'}};
 const mf=new Miniflare(options);
 try{
  let db=await mf.getD1Database('DB');
  for(const file of ['0001_application.sql','0002_activation.sql','0003_google.sql'])await db.batch(unstable_splitSqlQuery(readFileSync(new URL(`../d1/migrations/${file}`,import.meta.url),'utf8')).map(sql=>db.prepare(sql)));
  const get=(path,cookie)=>mf.dispatchFetch(origin+path,{redirect:'manual',headers:cookie?{cookie:`__Host-vibies-session=${token(cookie)}`}:{}});
  await t.test('disabled and mismatched activation never expose private data',async()=>{
   let data=await(await get('/api/page?path=/projects')).json();assert.equal(data.kind,'error');assert.equal(data.projects,undefined);
   await db.prepare("UPDATE deployment_activation SET state='reconciled',environment_id='wrong',snapshot_hash='synthetic',reconciled_at='2026-01-01'").run();
   await db.prepare("UPDATE deployment_activation SET state='active',activated_at='2026-01-01'").run();
   data=await(await get('/api/page?path=/projects')).json();assert.equal(data.kind,'error');
   await db.prepare("UPDATE deployment_activation SET environment_id='test'").run();
  });
  await t.test('anonymous redirects and safe return cookie',async()=>{
   const response=await get('/api/page?path=/projects');const data=await response.json();assert.equal(data.redirect,'/sign-in?message=expired');assert.match(response.headers.get('set-cookie'),/__Host-vibies-return=%2Fprojects/);assert.match(response.headers.get('cache-control'),/no-store/);
   const wiki=await(await get('/api/page?path=/wiki')).json();assert.equal(wiki.redirect,'/sign-in?message=expired');assert.equal(wiki.wiki,undefined);
   const hubPaths=['/course','/course/7','/admin/gates','/collaborate','/collaborate/jobs/11111111-1111-4111-8111-111111111111','/collaborate/ideas/11111111-1111-4111-8111-111111111111'];
   for(const path of hubPaths){const r=await get('/api/page?path='+path);assert.equal((await r.json()).redirect,'/sign-in?message=expired',path);assert.match(r.headers.get('set-cookie'),new RegExp('__Host-vibies-return='+encodeURIComponent(path)),path);}
   for(const path of ['/course/0','/course/31','/course/07','/course/x','/admin/gates/x','/collaborate/jobs','/collaborate/jobs/1','/collaborate/other/11111111-1111-4111-8111-111111111111'])assert.equal((await get('/api/page?path='+path)).status,404,path);
   const bootstrap=await get('/auth/browser?returnTo=https://evil.test');assert.equal(bootstrap.status,303);assert.doesNotMatch(bootstrap.headers.get('set-cookie'),/vibies-return/);
  });
  await db.prepare("UPDATE community SET instructor_github_id='1',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
  for(let n=1;n<=4;n++)await db.prepare("INSERT INTO sessions(session_hash,github_id,created_at,auth_provider) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'github')").bind(hash(n),String(n)).run();
  for(let n=2;n<=4;n++)await db.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,?)").bind(`account${n}`,String(n),`member${n}`,n===4?null:`Builder${n}`,n===4?null:`builder${n}`,n===2?'approved':n===3?'revoked':'unapproved').run();
  await t.test('roles are authorized at the boundary',async()=>{
   assert.equal((await(await get('/api/page?path=/projects',3)).json()).redirect,'/access-denied');
   assert.equal((await(await get('/api/page?path=/admin/members',2)).json()).members,undefined);
   const instructor=await(await get('/api/page?path=/admin/members',1)).json();assert.equal(instructor.members.accounts.length,3);assert.equal(instructor.members.accounts[0].internal_id,undefined);
   assert.equal((await(await get('/api/page?path=/wiki',3)).json()).wiki,undefined);assert.ok((await(await get('/api/page?path=/wiki',2)).json()).wiki.length>0);
   const member=await(await get('/api/page?path=/projects',2)).json();assert.deepEqual(member.projects,{mine:[],community:[]});
   for(const path of ['/course','/course/7','/admin/gates','/collaborate','/collaborate/jobs/11111111-1111-4111-8111-111111111111','/collaborate/ideas/11111111-1111-4111-8111-111111111111'])assert.equal((await(await get('/api/page?path='+path,3)).json()).redirect,'/access-denied',path);
   const memberGates=await(await get('/api/page?path=/admin/gates',2)).json();assert.equal(memberGates.redirect,'/welcome');assert.equal(memberGates.gateBoard,undefined);
   for(const path of ['/course','/course/30','/collaborate','/collaborate/ideas/11111111-1111-4111-8111-111111111111']){const v=await(await get('/api/page?path='+path,2)).json();assert.equal(v.kind,'ok',path);assert.equal(v.redirect,undefined,path);}
   const instructorGates=await(await get('/api/page?path=/admin/gates',1)).json();assert.equal(instructorGates.kind,'ok');assert.equal(instructorGates.redirect,undefined);
   const home=await(await get('/api/page?path=/welcome',2)).json();assert.deepEqual(home.projects,{mine:[],community:[]});assert.equal(home.members,undefined);
   const instructorHome=await(await get('/api/page?path=/welcome',1)).json();assert.equal(instructorHome.members.accounts.length,3);
  });
  await t.test('method, origin, route and form restrictions',async()=>{
   assert.equal((await mf.dispatchFetch(origin+'/api/page?path=/projects',{method:'POST'})).status,405);
   assert.equal((await get('/api/page?path=/not-a-page')).status,404);
   assert.equal((await get('/api/unknown')).status,404);
   assert.equal((await get('/auth/google/provider/sign-up/email')).status,404);
   assert.equal((await mf.dispatchFetch(origin+'/api/page?path=/projects',{headers:{Origin:'https://evil.test'}})).status,403);
   assert.equal((await mf.dispatchFetch(origin+'/projects/action',{redirect:'manual',method:'POST',headers:{origin, 'content-type':'application/json'},body:'{}'})).status,403);
   assert.equal((await mf.dispatchFetch(origin+'/projects/action',{redirect:'manual',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(2)}`},body:'action=hide&action=restore'})).status,400);
  });
  await t.test('save, refresh, stale version and foreign owner checks cross the Worker boundary',async()=>{
   const id='11111111-1111-4111-8111-111111111111';
   await db.prepare("INSERT INTO personal_projects(id,owner_account_id,repository_id,title,summary) VALUES(?,'account2','42','Original','Synthetic summary')").bind(id).run();
   const post=(body,n=2)=>mf.dispatchFetch(origin+'/projects/action',{redirect:'manual',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(n)}`},body:new URLSearchParams(body).toString()});
   const saved=await post({action:'edit',id,title:'Saved title',summary:'Saved summary',demoUrl:''});
   assert.equal(saved.status,303);assert.equal(saved.headers.get('location'),`/projects/${id}?message=edited`);
   const refreshed=await(await get('/api/page?path=/projects/'+id,2)).json();
   assert.equal(refreshed.project.project.title,'Saved title');assert.equal(refreshed.project.project.version,'2');
   const stale=await post({action:'milestone_add',id,version:'1',title:'Next step'});
   assert.equal(stale.headers.get('location'),`/projects/${id}?message=stale`);
   const added=await post({action:'milestone_add',id,version:'2',title:'Next step'});
   assert.equal(added.headers.get('location'),`/projects/${id}?message=milestone_added`);
   const current=await(await get('/api/page?path=/projects/'+id,2)).json();
   assert.equal(current.project.project.roadmap.totalCount,1);
   const home=await(await get('/api/page?path=/welcome',2)).json();assert.equal(home.projects.mine[0].id,id);assert.equal(home.project.project.roadmap.milestones[0].title,'Next step');
   // A broken community row fails /projects but Home still loads without the product data.
   await db.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES('account9','9','member9','x','x','revoked')").run();
   await db.prepare("INSERT INTO personal_projects(id,owner_account_id,repository_id,title,summary,publication) VALUES('99999999-9999-4999-8999-999999999999','account9','99','Broken','Synthetic','Published')").run();
   assert.equal((await get('/api/page?path=/projects',2)).status,503);
   const degraded=await get('/api/page?path=/welcome',2);const degradedData=await degraded.json();
   assert.equal(degraded.status,200);assert.equal(degradedData.kind,'ok');assert.equal(degradedData.projects,undefined);assert.equal(degradedData.project,undefined);
   await db.prepare("DELETE FROM personal_projects WHERE id='99999999-9999-4999-8999-999999999999'").run();
   await db.prepare("DELETE FROM accounts WHERE internal_id='account9'").run();
   await db.prepare("UPDATE accounts SET status='approved' WHERE github_id='3'").run();
   assert.equal((await post({action:'delete',id,confirm:'yes'},3)).status,403);
   assert.equal((await(await get('/api/page?path=/projects/'+id,3)).json()).project.kind,'missing');
   assert.equal(await db.prepare('SELECT title FROM personal_projects WHERE id=?').bind(id).first('title'),'Saved title');
  });
  await t.test('malformed and expired sessions fail closed; page redirects remain compatible',async()=>{
   assert.equal((await(await mf.dispatchFetch(origin+'/api/page?path=/projects',{headers:{cookie:'__Host-vibies-session=bad'}})).json()).access.kind,'signed_out');
   await db.prepare("UPDATE sessions SET created_at='2000-01-01' WHERE session_hash=?").bind(hash(4)).run();
   assert.equal((await(await get('/api/page?path=/projects',4)).json()).access.kind,'signed_out');
   assert.equal((await(await get('/api/page?path=/sign-in',2)).json()).redirect,'/auth/browser');
   const signedIn=await mf.dispatchFetch(origin+'/api/page?path=/sign-in',{headers:{cookie:`__Host-vibies-session=${token(2)}; __Host-vibies-browser=${token(10)}`}});
   assert.equal((await signedIn.json()).redirect,'/welcome');
   assert.equal((await(await get('/api/page?path=/access-denied',2)).json()).redirect,'/welcome');
   assert.equal((await(await get('/api/page?path=/access-denied')).json()).redirect,'/sign-in?message=expired');
   assert.equal((await get('/unknown-page')).status,404);
   assert.equal((await get('/assets/missing.js')).status,404);
  });
  await t.test('request-local read-only allows reads and blocks native and Google writes',async()=>{
   await mf.setOptions({...options,bindings:{...options.bindings,VIBIES_READ_ONLY:'1'}});
   db=await mf.getD1Database('DB');
   const before=await db.prepare('SELECT count(*) n FROM sign_in_flows').first('n');
   assert.equal((await(await get('/api/page?path=/projects',2)).json()).projects.mine.length,1);
   for(const path of ['/projects/action','/admin/members/action','/auth/start','/auth/google/start','/auth/google/link']) {
    const result=await mf.dispatchFetch(origin+path,{redirect:'manual',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(2)}`},body:'action=delete'});
    assert.equal(result.status,503,path);
   }
   assert.equal((await get('/auth/google/provider/callback/google?state=invalid')).status,503);
   assert.equal(await db.prepare('SELECT count(*) n FROM sign_in_flows').first('n'),before);
   await mf.setOptions(options);
   db=await mf.getD1Database('DB');
  });
  await t.test('sign-out clears cookies even with failing activation',async()=>{
   await db.prepare("UPDATE deployment_activation SET environment_id='wrong'").run();
   const result=await mf.dispatchFetch(origin+'/auth/sign-out',{redirect:'manual',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(2)}`},body:''});assert.equal(result.status,303);assert.match(result.headers.get('set-cookie'),/__Host-vibies-session=;.*Max-Age=0/);
  });
 }finally{await mf.dispose();}
});
