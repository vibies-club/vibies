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
const manifest={version:1,demoDay:'2026-11-19',phases:[{id:'build',title:'Build'}],sessions:[
 {n:17,title:'Make It Move',goal:'Add motion.',date:'2026-10-12',phase:'build',deck:'s17.html',gate:[],prompts:[]},
 {n:18,title:'A Home for Real Users',goal:'Ship it.',date:'2026-10-15',phase:'build',deck:'s18.html',gate:[{id:'s18-deploy',text:'Deploy it.'}],prompts:[{file:'cloudflare-prompt.md',label:'Cloudflare prompt'}]},
 {n:19,title:'Make It Work',goal:'',date:'2026-10-26',phase:'build',deck:null,gate:[],prompts:[]},
]};
const deck='<!doctype html><title>S18</title><script>document.title="inline"</script><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque" rel="stylesheet">';

test('course pages and files share page access and only serve listed files',async t=>{
 const output=await build({entryPoints:[new URL('./index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','cloudflare:*'],conditions:['workerd','worker','browser'],logLevel:'silent'});
 const options={modules:[{type:'ESModule',path:'worker.js',contents:output.outputFiles[0].text}],compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'course-boundary'},r2Buckets:{COURSE:'course-boundary'},bindings:{VIBIES_APP_ORIGIN:origin,VIBIES_ENVIRONMENT:'test'}};
 const mf=new Miniflare(options);
 // A fresh isolate drops the cached manifest.
 try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_application.sql','0002_activation.sql','0003_google.sql'])await db.batch(unstable_splitSqlQuery(readFileSync(new URL(`../d1/migrations/${file}`,import.meta.url),'utf8')).map(sql=>db.prepare(sql)));
  await db.prepare("UPDATE deployment_activation SET state='reconciled',environment_id='test',snapshot_hash='synthetic',reconciled_at='2026-01-01'").run();
  await db.prepare("UPDATE deployment_activation SET state='active',activated_at='2026-01-01'").run();
  await db.prepare("UPDATE community SET instructor_github_id='1',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
  for(let n=1;n<=3;n++)await db.prepare("INSERT INTO sessions(session_hash,github_id,created_at,auth_provider) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'github')").bind(hash(n),String(n)).run();
  for(const n of [2,3])await db.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,?)").bind(`account${n}`,String(n),`member${n}`,`Builder${n}`,`builder${n}`,n===2?'approved':'revoked').run();
  let bucket=await mf.getR2Bucket('COURSE');
  const restart=async(next=options)=>{await mf.setOptions(next);if(next.r2Buckets)bucket=await mf.getR2Bucket('COURSE');};
  await bucket.put('manifest.json',JSON.stringify(manifest));
  await bucket.put('decks/s18.html',deck);
  await bucket.put('decks/s17-instructor.html','instructor only');
  await bucket.put('prompts/cloudflare-prompt.md','# Prompt\n<script>alert(1)</script>');
  await bucket.put('prompts/unlisted.md','not listed');
  const get=(path,cookie,init={})=>mf.dispatchFetch(origin+path,{redirect:'manual',...init,headers:cookie?{cookie:`__Host-vibies-session=${token(cookie)}`}:{}});
  const page=async(path,cookie)=>(await get('/api/page?path='+path,cookie)).json();

  await t.test('signed out: pages and files send people to sign in and back to the course',async()=>{
   for(const path of ['/course','/course/18']){const data=await page(path);assert.equal(data.redirect,'/sign-in?message=expired');assert.equal(data.course,undefined);assert.equal(data.session,undefined);}
   for(const path of ['/course-files/decks/s18.html','/course-files/prompts/cloudflare-prompt.md','/course-files/decks/missing.html']){
    const r=await get(path);assert.equal(r.status,303,path);assert.equal(r.headers.get('location'),'/sign-in?message=expired');
    assert.match(r.headers.get('set-cookie'),/__Host-vibies-return=%2Fcourse;/);assert.equal(await r.text(),'');
   }
  });
  await t.test('denied: no course data and no files',async()=>{
   for(const path of ['/course','/course/18'])assert.equal((await page(path,3)).redirect,'/access-denied');
   const r=await get('/course-files/decks/s18.html',3);assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/S18/);
  });
  for(const [role,user] of [['member',2],['instructor',1]])await t.test(`${role}: course data and listed files`,async()=>{
   const course=await page('/course',user);assert.equal(course.kind,'ok');assert.deepEqual(course.course.sessions.map(s=>s.n),[17,18,19]);assert.equal(course.session,undefined);
   const session=await page('/course/18',user);assert.equal(session.session.title,'A Home for Real Users');assert.equal(session.course.sessions.length,3);
   const missing=await page('/course/5',user);assert.equal(missing.kind,'ok');assert.equal(missing.session,undefined);assert.ok(missing.course);
   assert.equal((await page('/welcome',user)).course.demoDay,'2026-11-19');
   const r=await get('/course-files/decks/s18.html',user);
   assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(r.headers.get('cache-control'),'private, no-store');
   assert.equal(r.headers.get('x-robots-tag'),'noindex');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('content-security-policy'),null);assert.equal(await r.text(),deck);
   const prompt=await get('/course-files/prompts/cloudflare-prompt.md',user);
   assert.equal(prompt.status,200);assert.equal(prompt.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(prompt.headers.get('x-content-type-options'),'nosniff');assert.match(await prompt.text(),/^# Prompt/);
  });
  await t.test('only files the manifest lists are reachable',async()=>{
   for(const path of ['/course-files/decks/s17.html','/course-files/decks/s17-instructor.html','/course-files/prompts/unlisted.md','/course-files/manifest.json','/course-files/decks/%2e%2e%2fmanifest.json','/course-files/decks/..%2fmanifest.json','/course-files/prompts/cloudflare-prompt.md/x','/course-files/decks/S18.html','/course-files/other/s18.html']){
    const r=await get(path,2);assert.equal(r.status,404,path);assert.equal(r.headers.get('cache-control'),'no-store',path);await r.text();
   }
   assert.equal((await get('/course-files/decks/s18.html',2,{method:'POST'})).status,405);
  });
  await t.test('a malformed manifest counts as unpublished',async()=>{
   await bucket.put('manifest.json',JSON.stringify({...manifest,sessions:[{...manifest.sessions[0],deck:'../x.html'}]}));
   await restart();
   const course=await page('/course',2);assert.equal(course.kind,'ok');assert.equal(course.course,undefined);
   assert.equal((await get('/course-files/decks/s18.html',2)).status,404);
   await bucket.put('manifest.json','not json');await restart();
   assert.equal((await page('/course/18',2)).course,undefined);
   await bucket.delete('manifest.json');await restart();
   assert.equal((await page('/welcome',2)).course,undefined);
   await bucket.put('manifest.json',JSON.stringify(manifest));
  });
  await t.test('without the COURSE binding everything degrades to unpublished',async()=>{
   const {r2Buckets,...preview}=options;
   await restart(preview);
   for(const path of ['/course','/course/18','/welcome']){const r=await get('/api/page?path='+path,2);assert.equal(r.status,200,path);const data=await r.json();assert.equal(data.course,undefined,path);assert.equal(data.session,undefined,path);}
   const r=await get('/course-files/decks/s18.html',2);assert.equal(r.status,404);assert.equal(await r.text(),'Slides are not published yet.');
  });
 }finally{await mf.dispose();}
});
