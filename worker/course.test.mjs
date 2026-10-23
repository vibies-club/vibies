import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {createHash} from 'node:crypto';
import * as gates from '../lib/d1/gates.ts';
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
  let db=await mf.getD1Database('DB');
  for(const file of ['0001_application.sql','0002_activation.sql','0003_google.sql','0004_identity.sql','0005_gates.sql'])await db.batch(unstable_splitSqlQuery(readFileSync(new URL(`../d1/migrations/${file}`,import.meta.url),'utf8')).map(sql=>db.prepare(sql)));
  await db.prepare("UPDATE deployment_activation SET state='reconciled',environment_id='test',snapshot_hash='synthetic',reconciled_at='2026-01-01'").run();
  await db.prepare("UPDATE deployment_activation SET state='active',activated_at='2026-01-01'").run();
  await db.prepare("UPDATE community SET instructor_github_id='1',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
  for(let n=1;n<=4;n++)await db.prepare("INSERT INTO sessions(session_hash,github_id,created_at,auth_provider) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'github')").bind(hash(n),String(n)).run();
  for(const n of [2,3,4])await db.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES(?,?,?,?,?,?)").bind(`account${n}`,String(n),`member${n}`,`Builder${n}`,`builder${n}`,n===3?'revoked':'approved').run();
  let bucket=await mf.getR2Bucket('COURSE');
  const restart=async(next=options)=>{await mf.setOptions(next);db=await mf.getD1Database('DB');if(next.r2Buckets)bucket=await mf.getR2Bucket('COURSE');};
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
   const head=await get('/course-files/decks/s18.html',2,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(await head.text(),'');
   assert.equal((await get('/course-files/decks/s17.html',2,{method:'HEAD'})).status,404);
  });
  const post=(body,user,init={})=>mf.dispatchFetch(origin+'/course/action',{redirect:'manual',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',...(user?{cookie:`__Host-vibies-session=${token(user)}`}:{})},body:new URLSearchParams(body).toString(),...init});
  const stored=async()=>(await db.prepare('SELECT account_id,session_no,item_id,state,proof_url,note FROM gate_checks ORDER BY account_id,session_no,item_id').all()).results;
  await t.test('members tick and untick only their own gate items',async()=>{
   let r=await post({action:'done',session:'18',item:'s18-deploy',proofUrl:'https://example.com/proof',note:'Shipped it.',member:'Builder4'},2);
   assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/course/18?message=done');
   assert.deepEqual(await stored(),[{account_id:'account2',session_no:18,item_id:'s18-deploy',state:'done',proof_url:'https://example.com/proof',note:'Shipped it.'}]);
   const mine=await page('/course/18',2);assert.deepEqual(mine.gates.mine,[{sessionNo:18,itemId:'s18-deploy',state:'done',proofUrl:'https://example.com/proof',note:'Shipped it.'}]);
   assert.deepEqual((await page('/course/18',4)).gates.mine,[]);assert.deepEqual((await page('/welcome',4)).gates.mine,[]);
   assert.equal((await page('/course',2)).gates.mine.length,1);
   assert.equal((await page('/course/18',1)).gates,undefined);
   r=await post({action:'undo',session:'18',item:'s18-deploy'},4);assert.equal(r.headers.get('location'),'/course/18?message=undone');
   assert.equal((await stored()).length,1);
   assert.deepEqual(await gates.set_gate_check(db,hash(4),18,'s18-deploy',true),{kind:'done'});
   assert.deepEqual(await gates.set_gate_check(db,hash(3),18,'s18-deploy',true),{kind:'forbidden'});
   assert.deepEqual(await gates.set_gate_check(db,hash(1),18,'s18-deploy',true),{kind:'forbidden'});
   assert.deepEqual((await stored()).map(row=>row.account_id),['account2','account4']);
   r=await post({action:'undo',session:'18',item:'s18-deploy'},4);assert.equal((await stored()).length,1);
  });
  await t.test('roles, items and proof links are checked at the boundary',async()=>{
   const before=await stored();
   const cases=[
    [{action:'flag',session:'18',item:'s18-deploy',member:'Builder2',note:'Redo it.'},2,403,'member cannot flag'],
    [{action:'done',session:'18',item:'s18-deploy'},1,403,'instructor cannot tick as a member'],
    [{action:'done',session:'18',item:'s18-deploy'},3,403,'denied'],
    [{action:'done',session:'18',item:'s18-deploy'},undefined,403,'signed out'],
    [{action:'done',session:'18',item:'s18-unknown'},2,400,'unknown item'],
    [{action:'done',session:'17',item:'s18-deploy'},2,400,'item from another session'],
    [{action:'done',session:'31',item:'s18-deploy'},2,400,'session out of range'],
    [{action:'done',session:'18',item:'s18-deploy',proofUrl:'http://example.com'},2,400,'http proof'],
    [{action:'done',session:'18',item:'s18-deploy',proofUrl:'javascript:alert(1)'},2,400,'script proof'],
    [{action:'done',session:'18',item:'s18-deploy',proofUrl:'https://'+'a'.repeat(510)},2,400,'long proof'],
    [{action:'done',session:'18',item:'s18-deploy',note:'x'.repeat(501)},2,400,'long note'],
    [{action:'flag',session:'18',item:'s18-deploy',member:'Builder2'},1,400,'flag without a note'],
    [{action:'verify',session:'18',item:'s18-deploy'},2,400,'unknown action'],
   ];
   for(const [body,user,status,name] of cases)assert.equal((await post(body,user)).status,status,name);
   assert.equal((await post({action:'done',session:'18',item:'s18-deploy'},2,{headers:{origin:'https://evil.test','content-type':'application/x-www-form-urlencoded',cookie:`__Host-vibies-session=${token(2)}`}})).status,403);
   assert.equal((await mf.dispatchFetch(origin+'/course/action',{method:'GET'})).status,405);
   assert.deepEqual(await stored(),before);
   assert.deepEqual(await gates.flag_gate_check(db,hash(2),'Builder2',18,'s18-deploy',true,'Self flag'),{kind:'forbidden'});
   assert.deepEqual(await gates.gates_board(db,hash(2)),{kind:'forbidden'});
   assert.deepEqual(await gates.gates_mine(db,hash(1)),{kind:'forbidden'});
  });
  await t.test('the Instructor flags and clears; members never receive the board',async()=>{
   let r=await post({action:'flag',session:'18',item:'s18-deploy',member:'Builder2',note:'The link shows a 404.'},1);
   assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/admin/gates?message=flagged#cell-Builder2-18');
   assert.deepEqual((await page('/course/18',2)).gates.mine[0],{sessionNo:18,itemId:'s18-deploy',state:'needs_work',proofUrl:'https://example.com/proof',note:'The link shows a 404.'});
   const board=await page('/admin/gates',1);assert.equal(board.kind,'ok');
   assert.deepEqual(board.gateBoard.members.map(m=>m.nickname),['Builder2','Builder4']);assert.equal(board.gateBoard.members[0].checks[0].state,'needs_work');
   assert.equal(JSON.stringify(board).includes('account2'),false);
   for(const user of [2,4]){const v=await page('/admin/gates',user);assert.equal(v.redirect,'/welcome');assert.equal(v.gateBoard,undefined);}
   for(const path of ['/welcome','/course','/course/18'])assert.equal((await page(path,2)).gateBoard,undefined,path);
   assert.equal((await post({action:'flag',session:'18',item:'s18-deploy',member:'Nobody',note:'x'},1)).headers.get('location'),'/admin/gates?message=missing#cell-Nobody-18');
   r=await post({action:'clear',session:'18',item:'s18-deploy',member:'Builder2'},1);assert.equal(r.headers.get('location'),'/admin/gates?message=cleared#cell-Builder2-18');
   assert.deepEqual((await stored())[0],{account_id:'account2',session_no:18,item_id:'s18-deploy',state:'done',proof_url:'https://example.com/proof',note:null});
   assert.equal((await post({action:'clear',session:'18',item:'s18-deploy',member:'Builder2'},1)).headers.get('location'),'/admin/gates?message=unchanged#cell-Builder2-18');
  });
  await t.test('read-only mode allows gate reads and blocks gate writes',async()=>{
   await restart({...options,bindings:{...options.bindings,VIBIES_READ_ONLY:'1'}});
   const before=await stored();
   assert.equal((await page('/course/18',2)).gates.mine.length,1);
   assert.equal((await page('/admin/gates',1)).gateBoard.members.length,2);
   for(const [body,user] of [[{action:'done',session:'18',item:'s18-deploy'},2],[{action:'undo',session:'18',item:'s18-deploy'},2],[{action:'flag',session:'18',item:'s18-deploy',member:'Builder2',note:'x'},1]])
    assert.equal((await post(body,user)).status,503);
   assert.deepEqual(await stored(),before);
   await restart();
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
