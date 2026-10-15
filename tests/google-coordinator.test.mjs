import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

const origin = 'https://coordinator.test';
const token = n => n.toString(16).padStart(64, '0');
const hash = value => createHash('sha256').update(value).digest('hex');
function mergeCookies(previous, response) {
  const jar = new Map(previous.split('; ').filter(Boolean).map(value => { const i=value.indexOf('='); return [value.slice(0,i),value.slice(i+1)]; }));
  for(const value of response.headers.getSetCookie()) { const part=value.split(';')[0],i=part.indexOf('='); jar.set(part.slice(0,i),part.slice(i+1)); }
  return [...jar].map(([key,value])=>`${key}=${value}`).join('; ');
}
const jwt = () => [ {alg:'RS256',kid:'synthetic'}, {sub:'synthetic-sub',name:'PRIVATE-NAME',email:'private@example.com',
  picture:'https://invalid.test/private-photo',email_verified:true,aud:'synthetic-client',iss:'https://accounts.google.com',
  exp:Math.floor(Date.now()/1000)+300,iat:Math.floor(Date.now()/1000)} ].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.synthetic';

const source = `
import worker from './worker/index';
import { GoogleCoordinator } from './worker/google-coordinator';
let allocations=0;
export class TestCoordinator extends GoogleCoordinator {
 marker=false;
 async mark() {this.marker=true;}
 async breakSessions() {this.ctx.storage.sql.exec('DROP TABLE issued_sessions');}
 async inspect() {return {marker:this.marker,attempt:this.ctx.storage.sql.exec('SELECT * FROM oauth_attempt').toArray(),sessions:this.ctx.storage.sql.exec('SELECT * FROM issued_sessions').toArray(),grants:this.ctx.storage.sql.exec('SELECT * FROM grant_cancellations').toArray()};}
 async expire() {this.ctx.storage.sql.exec('UPDATE oauth_attempt SET expires_at=0');}
 async interrupt() {this.ctx.storage.sql.exec("UPDATE oauth_attempt SET phase='processing'");}
}
export default {async fetch(request,env,ctx) {
 const url=new URL(request.url);
 if(url.pathname==='/__test/allocations')return Response.json(allocations);
 if(url.pathname==='/__test/inspect')return Response.json(await env.GOOGLE_COORDINATOR.getByName(url.searchParams.get('hash')).inspect());
 if(url.pathname==='/__test/mark') {await env.GOOGLE_COORDINATOR.getByName(url.searchParams.get('hash')).mark();return new Response('ok');}
 if(url.pathname==='/__test/break-sessions') {await env.GOOGLE_COORDINATOR.getByName(url.searchParams.get('hash')).breakSessions();return new Response('ok');}
 if(url.pathname==='/__test/expire') {await env.GOOGLE_COORDINATOR.getByName(url.searchParams.get('hash')).expire();return new Response('ok');}
 if(url.pathname==='/__test/interrupt') {await env.GOOGLE_COORDINATOR.getByName(url.searchParams.get('hash')).interrupt();return new Response('ok');}
 return worker.fetch(request,{...env,GOOGLE_COORDINATOR:{getByName(name){allocations++;return env.GOOGLE_COORDINATOR.getByName(name);}}},ctx);
}};`;

test('per-browser OAuth coordinator persists one-use lifecycle and serializes sign-out', async t => {
 const output=await build({stdin:{contents:source,resolveDir:new URL('..',import.meta.url).pathname,sourcefile:'coordinator-proof.ts'},
  bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','cloudflare:*'],conditions:['workerd','worker','browser'],logLevel:'silent'});
 let exchanges=0, failProvider=false, gate, entered;
 const options={modules:[{type:'ESModule',path:'worker.js',contents:output.outputFiles[0].text}],compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'coordinator-test'},durableObjects:{GOOGLE_COORDINATOR:{className:'TestCoordinator',useSQLite:true}},
  bindings:{VIBIES_APP_ORIGIN:origin,VIBIES_ENVIRONMENT:'test',VIBIES_GOOGLE_CLIENT_ID:'synthetic-client',
    VIBIES_GOOGLE_CLIENT_SECRET:'synthetic-secret',VIBIES_GOOGLE_AUTH_SECRET:'synthetic-test-secret-with-at-least-32-characters'},
  outboundService:async request=>{
    assert.equal(new URL(request.url).origin,'https://oauth2.googleapis.com');exchanges++;
    if(gate){entered();await gate;}
    return failProvider ? new Response('provider unavailable',{status:503}) : Response.json({access_token:'PRIVATE-TOKEN',refresh_token:'PRIVATE-REFRESH',id_token:jwt(),token_type:'Bearer',expires_in:3600});
  }};
 const mf=new Miniflare(options);
 let generation=0;
 const reload=()=>mf.setOptions({...options,bindings:{...options.bindings,TEST_GENERATION:String(++generation)}});
 try {
  let db=await mf.getD1Database('DB');
  for(const file of ['0001_application.sql','0002_activation.sql','0003_google.sql'])await db.batch(unstable_splitSqlQuery(readFileSync(new URL(`../d1/migrations/${file}`,import.meta.url),'utf8')).map(sql=>db.prepare(sql)));
  await db.prepare("UPDATE deployment_activation SET state='reconciled',environment_id='test',snapshot_hash='synthetic',reconciled_at='2026-01-01'").run();
  await db.prepare("UPDATE deployment_activation SET state='active',activated_at='2026-01-01'").run();
  await db.prepare("UPDATE community SET instructor_github_id='1',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
  await db.prepare("INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES('member','2','builder','Builder','builder','approved')").run();
  await db.prepare("INSERT INTO sessions(session_hash,github_id,auth_provider) VALUES(?,'2','github')").bind(hash(token(2))).run();
  const jar=n=>`__Host-vibies-browser=${token(n)}`;
  const post=(path,cookie)=>mf.dispatchFetch(origin+path,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie}});
  const state=response=>new URL(response.headers.get('location')).searchParams.get('state');
  const callback=(value,cookie)=>mf.dispatchFetch(`${origin}/auth/google/provider/callback/google?code=synthetic&state=${value}`,{redirect:'manual',headers:{cookie}});
  const inspect=n=>mf.dispatchFetch(`${origin}/__test/inspect?hash=${hash(token(n))}`).then(response=>response.json());
  let linkedJar;
  await t.test('invalid browser cookies and cross-origin requests allocate no coordinator',async()=>{
    const allocations=()=>mf.dispatchFetch(`${origin}/__test/allocations`).then(r=>r.json());
    const before=await allocations();
    for(const cookie of ['', '__Host-vibies-browser=invalid']) {
      assert.equal((await post('/auth/google/start',cookie)).headers.get('location'),'/auth/browser');
      const out=await post('/auth/sign-out',cookie);assert.equal(out.headers.get('location'),'/');assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
    }
    const denied=await mf.dispatchFetch(origin+'/auth/google/start',{method:'POST',redirect:'manual',headers:{origin:'https://evil.test','content-type':'application/x-www-form-urlencoded',cookie:jar(70)}});
    assert.equal(denied.status,403);assert.equal(await allocations(),before);
  });
  await t.test('cold restart retains pending state and link grant',async()=>{
    const cookie=jar(70)+`; __Host-vibies-session=${token(2)}`;
    const start=await post('/auth/google/link',cookie);assert.equal(new URL(start.headers.get('location')).origin,'https://accounts.google.com');
    linkedJar=mergeCookies(cookie,start);
    const record=await inspect(70);assert.equal(record.attempt[0].phase,'pending');assert.equal(record.attempt[0].state_hash,hash(state(start)));
    assert.match(record.attempt[0].grant_hash,/^[a-f0-9]{64}$/);
    await mf.dispatchFetch(`${origin}/__test/mark?hash=${hash(token(70))}`);
    assert.equal((await inspect(70)).marker,true);
    await reload();db=await mf.getD1Database('DB');
    assert.equal((await inspect(70)).marker,false);
    const result=await callback(state(start),linkedJar);assert.equal(result.headers.get('location'),'/welcome?google=linked');
    assert.equal((await inspect(70)).attempt[0].phase,'terminal');
    assert.equal(await db.prepare('SELECT count(*) n FROM google_accounts').first('n'),1);
  });
  await t.test('competing starts create only one pending OAuth state',async()=>{
    const results=await Promise.all([post('/auth/google/start',jar(71)),post('/auth/google/start',jar(71))]);
    const successful=results.filter(r=>r.headers.get('location').startsWith('https://accounts.google.com'));
    assert.equal(successful.length,1);assert.equal(results.filter(r=>r.headers.get('location')==='/sign-in?message=limited').length,1);
    assert.equal(await db.prepare('SELECT count(*) n FROM sign_in_attempts WHERE browser_hash=?').bind(hash(token(71))).first('n'),1);
  });
  await t.test('warm callback is one-use and cannot cross browser coordinators',async()=>{
    const start=await post('/auth/google/start',jar(70));const cookies=mergeCookies(jar(70),start);const before=exchanges;
    const crossed=await callback(state(start),mergeCookies(jar(72),start));assert.equal(crossed.headers.get('location'),'/sign-in?message=failed');assert.equal(exchanges,before);
    const results=await Promise.all([callback(state(start),cookies),callback(state(start),cookies)]);
    assert.equal(results.filter(r=>r.headers.get('location')==='/welcome').length,1);
    assert.equal(results.filter(r=>r.headers.get('location')==='/sign-in?message=failed').length,1);assert.equal(exchanges,before+1);
    const record=await inspect(70);assert.equal(record.sessions.length,1);assert.equal(record.sessions[0].revoke,0);
  });
  await t.test('queued old-cookie sign-out revokes callback-issued sessions',async()=>{
    const start=await post('/auth/google/start',jar(70));const cookies=mergeCookies(jar(70),start);
    let release;gate=new Promise(resolve=>{release=resolve;});const arrived=new Promise(resolve=>{entered=resolve;});
    const pendingCallback=callback(state(start),cookies);await arrived;
    const signOut=post('/auth/sign-out',jar(70));release();gate=undefined;
    const [result,out]=await Promise.all([pendingCallback,signOut]);assert.equal(result.headers.get('location'),'/welcome');assert.equal(out.headers.get('location'),'/');
    const sessionCookie=result.headers.getSetCookie().find(value=>value.startsWith('__Host-vibies-session='));assert.ok(sessionCookie);
    const issued=sessionCookie.split(';')[0].split('=')[1];
    assert.equal(await db.prepare('SELECT count(*) n FROM sessions WHERE session_hash=?').bind(hash(issued)).first('n'),0);
    assert.equal((await inspect(70)).sessions.length,0);
  });
  await t.test('sign-out with old cookies cancels pending linking grant and callback',async()=>{
    // Existing linked identity cannot get another link grant; use another eligible identity.
    await db.prepare("INSERT INTO sessions(session_hash,github_id,auth_provider) VALUES(?,'1','github')").bind(hash(token(1))).run();
    const old=jar(73)+`; __Host-vibies-session=${token(1)}`;
    const start=await post('/auth/google/link',old);assert.equal(new URL(start.headers.get('location')).origin,'https://accounts.google.com');
    await post('/auth/sign-out',old);
    assert.equal(await db.prepare('SELECT count(*) n FROM google_link_grants').first('n'),0);
    const before=exchanges;assert.equal((await callback(state(start),mergeCookies(old,start))).headers.get('location'),'/welcome?google=failed');assert.equal(exchanges,before);
  });
  await t.test('failed sign-out journals incoming session and both grants for durable retry',async()=>{
    await db.prepare("INSERT INTO sessions(session_hash,github_id,auth_provider) VALUES(?,'1','github')").bind(hash(token(81))).run();
    const old=jar(82)+`; __Host-vibies-session=${token(81)}`;
    const start=await post('/auth/google/link',old);assert.equal(new URL(start.headers.get('location')).origin,'https://accounts.google.com');
    const pending=(await inspect(82)).attempt[0].grant_hash;
    await db.prepare("UPDATE deployment_activation SET environment_id='wrong'").run();
    const out=await post('/auth/sign-out',old+`; __Host-vibies-google-grant=${token(83)}`);
    assert.equal(out.headers.get('location'),'/');
    const recorded=await inspect(82);
    assert.ok(recorded.sessions.some(row=>row.session_hash===hash(token(81))&&row.revoke===1));
    assert.deepEqual(recorded.grants.map(row=>row.grant_hash).sort(),[pending,hash(token(83))].sort());
    assert.equal(await db.prepare('SELECT count(*) n FROM sessions WHERE session_hash=?').bind(hash(token(81))).first('n'),1);
    await db.prepare("UPDATE deployment_activation SET environment_id='test'").run();
    await reload();db=await mf.getD1Database('DB');
    await post('/auth/google/start',jar(82));
    assert.equal(await db.prepare('SELECT count(*) n FROM sessions WHERE session_hash=?').bind(hash(token(81))).first('n'),0);
    assert.equal((await inspect(82)).sessions.length,0);assert.equal((await inspect(82)).grants.length,0);
    assert.equal(await db.prepare('SELECT count(*) n FROM google_link_grants WHERE grant_hash=?').bind(pending).first('n'),0);
  });
  await t.test('expired and interrupted attempts never resume an exchange',async()=>{
    for(const [n,operation] of [[74,'expire'],[75,'interrupt']]){
      const start=await post('/auth/google/start',jar(n));await mf.dispatchFetch(`${origin}/__test/${operation}?hash=${hash(token(n))}`);
      await reload();db=await mf.getD1Database('DB');
      const before=exchanges;assert.equal((await callback(state(start),mergeCookies(jar(n),start))).headers.get('location'),'/sign-in?message=failed');assert.equal(exchanges,before);
      assert.equal(new URL((await post('/auth/google/start',jar(n))).headers.get('location')).origin,'https://accounts.google.com');
    }
  });
  await t.test('provider failure ends the attempt and permits only a fresh start',async()=>{
    const start=await post('/auth/google/start',jar(76));failProvider=true;
    const result=await callback(state(start),mergeCookies(jar(76),start));failProvider=false;
    assert.equal(result.headers.get('location'),'/sign-in?message=failed');assert.equal((await inspect(76)).attempt[0].phase,'terminal');
    const before=exchanges;await callback(state(start),mergeCookies(jar(76),start));assert.equal(exchanges,before);
  });
  await t.test('activation and read-only still block domain writes',async()=>{
    await db.prepare("UPDATE deployment_activation SET environment_id='wrong'").run();
    assert.equal((await post('/auth/google/start',jar(77))).headers.get('location'),'/sign-in?message=failed');
    await db.prepare("UPDATE deployment_activation SET environment_id='test'").run();
    await mf.setOptions({...options,bindings:{...options.bindings,VIBIES_READ_ONLY:'1'}});db=await mf.getD1Database('DB');
    assert.equal((await post('/auth/google/start',jar(78))).status,503);
    const out=await post('/auth/sign-out',jar(78));assert.equal(out.headers.get('location'),'/');assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
    await reload();db=await mf.getD1Database('DB');
  });
  await t.test('durable metadata failure prevents minting a Vibies session',async()=>{
    const start=await post('/auth/google/start',jar(79));
    const before=await db.prepare("SELECT count(*) n FROM sessions WHERE auth_provider='google'").first('n');
    await mf.dispatchFetch(`${origin}/__test/break-sessions?hash=${hash(token(79))}`);
    const result=await callback(state(start),mergeCookies(jar(79),start));
    assert.notEqual(result.headers.get('location'),'/welcome');
    assert.ok(!result.headers.getSetCookie().some(value=>/^__Host-vibies-session=[^;]/.test(value)));
    assert.equal(await db.prepare("SELECT count(*) n FROM sessions WHERE auth_provider='google'").first('n'),before);
    await reload();db=await mf.getD1Database('DB');
  });
  await t.test('private provider data never enters durable metadata or D1',async()=>{
    const record=JSON.stringify(await inspect(70));for(const value of ['PRIVATE-','private@example.com','private-photo'])assert.ok(!record.includes(value));
    for(const table of ['google_users','google_accounts','google_sessions','google_verifications']) {
      const text=JSON.stringify((await db.prepare(`SELECT * FROM ${table}`).all()).results);
      for(const value of ['PRIVATE-','private@example.com','private-photo'])assert.ok(!text.includes(value));
    }
  });
 } finally {await mf.dispose();}
});
