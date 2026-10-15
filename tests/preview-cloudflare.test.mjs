import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePull, validateArtifact, validateRun, selectPreview, cleanupPreview } from '../scripts/preview-cloudflare.mjs';
import { deployPreviewArtifact, previewWorker, ownedDatabase, validateStagingBindings } from '../scripts/preview-cloudflare-deploy.mjs';
const REPO='vibies-club/vibies', HEAD='a'.repeat(40), MAIN='b'.repeat(40), HASH='c'.repeat(64);
const NS='d'.repeat(32);
const coordinator=(worker='vibies-pr-61')=>({type:'durable_object_namespace',name:'GOOGLE_COORDINATOR',class_name:'GoogleCoordinator',script_name:worker,namespace_id:NS});
const DB='22222222-2222-4222-8222-222222222222', VERSION='11111111-1111-4111-8111-111111111111';
const pull=()=>({number:61,state:'open',base:{ref:'main',sha:MAIN,repo:{full_name:REPO}},head:{sha:HEAD,repo:{full_name:REPO}}});
const response = result => Response.json({success:true,result});
const opts={prNumber:61,accountId:'a'.repeat(32),cloudflareToken:'secret-canary',runId:'42',runAttempt:'1'};

test('selection refuses forks, changed source, closed PRs, and unsafe resource names',()=>{
  assert.equal(validatePull(pull(),61,HEAD).head.sha,HEAD);
  for(const change of [p=>p.head.repo.full_name='outsider/fork',p=>p.state='closed',p=>p.head.sha=MAIN,p=>p.base.ref='staging']) {
    const p=pull();change(p);assert.throws(()=>validatePull(p,61,HEAD));
  }
  for(const number of ['61/../production','0','1\nproduction','-1']) assert.throws(()=>previewWorker(number));
  assert.equal(ownedDatabase('vibies-pr-61','vibies-pr-6-run-42-1'),false);
  assert.equal(ownedDatabase('vibies-pr-61','vibies-production'),false);
});
test('artifact must match this trusted run, repository, SHA, and digest',()=>{
  const options={artifactId:'7',runId:'42',runAttempt:'1',artifactDigest:HASH,trustedSha:MAIN,repositoryId:'9'};
  const metadata={id:7,expired:false,name:'preview-build-42-1',digest:`sha256:${HASH}`,workflow_run:{id:42,head_sha:MAIN,repository_id:9,head_repository_id:9}};
  validateArtifact(metadata,options);
  for(const mutate of [m=>m.digest='sha256:wrong',m=>m.workflow_run.head_sha=HEAD,m=>m.workflow_run.id=43,m=>m.workflow_run.head_repository_id=10,m=>m.expired=true]) {
    const m=structuredClone(metadata);mutate(m);assert.throws(()=>validateArtifact(m,options));
  }
  const run={id:42,repository:{full_name:REPO},head_repository:{full_name:REPO},head_sha:MAIN,path:'.github/workflows/preview.yml',event:'pull_request_target'};
  validateRun(run,options);
  assert.throws(()=>validateRun({...run,event:'pull_request'},options));
});
test('migration selection rejects non-regular source files before deployment', async()=>{
  const request=async path=>path.startsWith('/pulls')?pull():{truncated:false,tree:[{path:'d1/migrations/0001_app.sql',mode:'120000',type:'blob',sha:HEAD}]};
  await assert.rejects(selectPreview(request,61,HEAD),/migration/);
});
test('allocation refuses inherited secrets and preserves reserved D1 slots without mutations', async()=>{
  for(const mode of ['secret','capacity']) {
    const calls=[];
    const cf=async(url,init)=>{calls.push(init.method);if(url.endsWith('/settings'))return response({bindings:mode==='secret'?[{type:'secret_text',name:'PRIVATE'}]:[]});if(url.includes('/d1/database?'))return response(Array.from({length:7},()=>({})));throw Error('unexpected mutation');};
    await assert.rejects(deployPreviewArtifact({...opts,cloudflareFetch:cf}),/secret|capacity/);
    assert(calls.every(method=>method==='GET'));
  }
});
test('fixed deployment binds only fresh synthetic DB and preserves ambiguous uploads', async()=>{
  for(const mode of ['initial','repeat','ambiguous']) {
    const ambiguous=mode==='ambiguous';
    const root=mkdtempSync(join(tmpdir(),'preview-test-'));let uploaded=false, invalidNamespace=false;const calls=[];
    const schema=[{type:'table',name:'synthetic',sql:'CREATE TABLE synthetic(id INTEGER)'}];
    const schemaHash=createHash('sha256').update(JSON.stringify(schema)).digest('hex');
    try {
      for(const name of ['server','client','migrations'])mkdirSync(join(root,name));
      writeFileSync(join(root,'server/index.js'),'export default {fetch(){return new Response("synthetic")}}');
      writeFileSync(join(root,'client/index.html'),'synthetic');writeFileSync(join(root,'migrations/0001_app.sql'),'CREATE TABLE synthetic(id INTEGER);');
      const cf=async(url,init)=>{
        calls.push({url,method:init.method});const body=init.body?JSON.parse(init.body):null;
        if(url.includes('/workers/durable_objects/namespaces?'))return response([{id:NS,script:invalidNamespace?'vibies-production':'vibies-pr-61',class:'GoogleCoordinator',use_sqlite:true}]);
        if(url.endsWith('/settings'))return response({bindings:uploaded?[coordinator(),{type:'d1',name:'DB',id:DB},{type:'plain_text',name:'VIBIES_STAGING_SHA',text:HEAD},{type:'plain_text',name:'VIBIES_STAGING_ARTIFACT_HASH',text:HASH}]:(mode==='repeat'?[coordinator()]:[])});
        if(url.includes('/d1/database?'))return response([]);
        if(url.endsWith('/d1/database'))return response({uuid:DB,name:body.name});
        if(url.endsWith('/query'))return response([{success:true,results:body.sql.startsWith('SELECT type,name')?schema:body.sql.startsWith('SELECT schema_hash')?[{schema_hash:schemaHash,migration_hash:HASH,source_sha:HEAD}]:[]}]);
        if(url.endsWith('/deployments'))return response({deployments:[{versions:[{version_id:VERSION,percentage:100}]}]});
        throw Error('unexpected provider call');
      };
      const promise=deployPreviewArtifact({...opts,origin:'https://vibies-pr-61.example.workers.dev',plan:{head:HEAD,schemaHash:HASH,migrations:[{path:'d1/migrations/0001_app.sql'}]},artifact:{root,artifactHash:HASH},cloudflareFetch:cf,execute(_node,args,options){
        const config=JSON.parse(readFileSync(args[args.indexOf('--config')+1],'utf8'));
        assert.equal(config.name,'vibies-pr-61');assert.equal(config.no_bundle,true);
        assert.deepEqual(config.durable_objects,{bindings:[{name:'GOOGLE_COORDINATOR',class_name:'GoogleCoordinator'}]});
        assert.deepEqual(config.migrations,[{tag:'v1-google-coordinator',new_sqlite_classes:['GoogleCoordinator']}]);
        assert.match(readFileSync(join(options.cwd,'staging-entry.js'),'utf8'),/export \{ GoogleCoordinator \} from '\.\/server\/index.js'/);
        assert.deepEqual(config.assets.run_worker_first,["/api/*","/auth/*","/projects/action","/admin/members/action","/staging.json"]);
        const workerFirst = input => { const path = input.split("?")[0]; return config.assets.run_worker_first.some(pattern => !pattern.startsWith("!") && new RegExp(`^${pattern.replaceAll("*", ".*")}$`).test(path)) &&
          !config.assets.run_worker_first.some(pattern => pattern.startsWith("!") && new RegExp(`^${pattern.slice(1).replaceAll("*", ".*")}$`).test(path)); };
        for (const path of ["/assets/app.js","/assets/app.css","/home/logo.png","/demo"]) assert.equal(workerFirst(path),false,path);
        for (const path of ["/staging.json","/staging.json?nonce=abc","/api/page","/auth/callback","/projects/action","/admin/members/action"]) assert.equal(workerFirst(path),true,path);

        assert.deepEqual(config.d1_databases.map(binding=>binding.database_id),[DB]);
        assert.doesNotMatch(JSON.stringify(config),/secret-canary|vibies-production/);
        assert.equal(options.env.NODE_OPTIONS,undefined);assert(!args.includes('npm'));
        uploaded=true;if(ambiguous)throw Error('upload timeout');
      }});
      if(ambiguous)await assert.rejects(promise,/timeout/);else{const deployment=await promise;await deployment.verify();invalidNamespace=true;await assert.rejects(deployment.verify(),/namespace/);}
      assert(!calls.some(call=>call.method==='DELETE'));
      assert(calls.filter(call=>call.url.endsWith('/query')).every(call=>call.url.includes(DB)));
    } finally {rmSync(root,{recursive:true,force:true});}
  }
});
test('cleanup refuses unowned databases and never deletes data after ambiguous worker deletion',async()=>{
  for(const mode of ['unowned','ambiguous','success']) {
    const calls=[];let removed=false;
    const cf=async(url,init)=>{
      calls.push({url,method:init.method});
      if(url.endsWith('/settings'))return removed?new Response('',{status:404}):response({bindings:[{type:'d1',name:'DB',id:DB}]});
      if(url.endsWith('/query'))return response([{results:[{source_sha:HEAD,schema_hash:HASH}]}]);
      if(url.endsWith(`/d1/database/${DB}`))return response({name:mode==='unowned'?'vibies-production':'vibies-pr-61-run-42-1'});
      if(url.endsWith('/workers/scripts/vibies-pr-61')&&init.method==='DELETE'){if(mode==='ambiguous')throw Error('network timeout');removed=true;return response(null);}
      throw Error('unexpected request');
    };
    const p=pull();p.state='closed';
    const result=cleanupPreview({...opts,request:async()=>p,cloudflareFetch:cf});
    if(mode==='success')await result;else await assert.rejects(result);
    assert.equal(calls.some(call=>call.method==='DELETE'&&call.url.includes('/d1/')),mode==='success');
  }
});

test('PR link is posted only after artifact, control-plane, HTTP and current-head proof', async()=>{
  const { deployPreview }=await import('../scripts/preview-cloudflare.mjs');
  const { artifactFiles }=await import('../scripts/staging-cloudflare.mjs');
  for(const mode of ['success','bad-http','changed-head']) {
    const root=mkdtempSync(join(tmpdir(),'preview-orchestrator-test-'));const events=[];let pullReads=0;
    try {
      for(const name of ['server','client','migrations'])mkdirSync(join(root,name));
      writeFileSync(join(root,'server/index.js'),'export default {}');
      const sql='CREATE TABLE example(id INTEGER);';writeFileSync(join(root,'migrations/0001_example.sql'),sql);
      const blob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
      const files=artifactFiles(root);const artifactHash=createHash('sha256').update(JSON.stringify(files)).digest('hex');
      writeFileSync(join(root,'manifest.json'),JSON.stringify({format:1,sha:HEAD,files,artifactHash}));
      const options={...opts,head:HEAD,trustedSha:MAIN,repositoryId:'9',artifactId:'7',artifactDigest:HASH,directory:root,subdomain:'preview-test'};
      const request=async(path,init={})=>{
        if(path.startsWith('/pulls/')){pullReads++;const p=pull();if(mode==='changed-head'&&pullReads>1)p.head.sha=MAIN;return p;}
        if(path.startsWith('/git/trees/'))return{truncated:false,tree:[{path:'d1/migrations/0001_example.sql',type:'blob',mode:'100644',sha:blob}]};
        if(path==='/actions/runs/42')return{id:42,repository:{full_name:REPO},head_repository:{full_name:REPO},head_sha:MAIN,path:'.github/workflows/preview.yml',event:'pull_request_target'};
        if(path==='/actions/artifacts/7')return{id:7,expired:false,name:'preview-build-42-1',digest:`sha256:${HASH}`,workflow_run:{id:42,head_sha:MAIN,repository_id:9,head_repository_id:9}};
        if(path==='/issues/61/comments'){events.push('comment');assert.equal(init.method,'POST');assert.match(init.body.body,/https:\/\/vibies-pr-61.preview-test.workers.dev/);assert.match(init.body.body,new RegExp(HEAD));assert.equal(events.at(-2),'cleanup');return{id:123};}
        throw Error(`unexpected path ${path}`);
      };
      let receipt;
      const deployment=async()=>{events.push('deploy');receipt={sha:HEAD,worker:'vibies-pr-61',databaseId:DB,schemaHash:HASH,migrationHash:HASH,artifactHash,versionId:VERSION};return{...receipt,verify:async()=>events.push('verify'),cleanup:async()=>events.push('cleanup')};};
      const result=deployPreview({...options,request,deploy:deployment,probe:async()=>{events.push('http');return Response.json({...receipt,...(mode==='bad-http'?{sha:MAIN}:{})});},delay:async()=>{}});
      if(mode==='success'){assert.equal(await result,'https://vibies-pr-61.preview-test.workers.dev');assert.equal(events.filter(e=>e==='comment').length,1);assert.equal(events.filter(e=>e==='verify').length,2);}
      else {await assert.rejects(result);assert(!events.includes('comment'));assert(!events.includes('cleanup'));}
    } finally {rmSync(root,{recursive:true,force:true});}
  }
});

test('workflow queues all pending previews and limits PR write permission to trusted deploy',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/preview.yml',import.meta.url),'utf8');
  assert.match(workflow,/concurrency:\n  group: cloudflare-preview-allocation\n  cancel-in-progress: false\n  queue: max/);
  const build=workflow.split('\n  build:')[1].split('\n  deploy:')[0];
  assert.doesNotMatch(build,/CLOUDFLARE_API_TOKEN|pull-requests: write|environment: preview/);
  const deploy=workflow.split('\n  deploy:')[1].split('\n  cleanup:')[0];
  assert.match(deploy,/pull-requests: write/);
});


test('coordinator accepts only the same Worker SQLite namespace on initial and repeated uploads', async()=>{
  const request=async()=>[{id:NS,script:'vibies-pr-61',class:'GoogleCoordinator',use_sqlite:true}];
  await validateStagingBindings(request,[],'vibies-pr-61');
  await assert.rejects(validateStagingBindings(request,[],'vibies-pr-61',true),/coordinator/);
  await validateStagingBindings(request,[coordinator()],'vibies-pr-61',true);
  await validateStagingBindings(request,[{...coordinator(),script_name:undefined}],'vibies-pr-61',true);
  for(const patch of [{name:'OTHER'},{class_name:'Other'},{script_name:'vibies-production'},
    {environment:'production'},{namespace_id:'foreign'}]) {
    await assert.rejects(validateStagingBindings(request,[{...coordinator(),...patch}],'vibies-pr-61'),/coordinator/);
  }
  await assert.rejects(validateStagingBindings(request,[coordinator(),coordinator()],'vibies-pr-61'),/coordinator/);
  for(const patch of [{script:'vibies-production'},{class:'Other'},{id:'e'.repeat(32)},{use_sqlite:false}]) {
    await assert.rejects(validateStagingBindings(async()=>[{id:NS,script:'vibies-pr-61',class:'GoogleCoordinator',use_sqlite:true,...patch}],
      [coordinator()],'vibies-pr-61'),/namespace/);
  }
});

test('foreign namespace or secret is rejected before preview allocation', async()=>{
  for(const invalid of [coordinator('vibies-production'),{...coordinator(),class_name:'Other'},
    {...coordinator(),namespace_id:'e'.repeat(32)}]) {
    const calls=[];
    const cf=async(url,init)=>{calls.push(init.method);if(url.endsWith('/settings'))return response({bindings:[invalid]});
      if(url.includes('/workers/durable_objects/namespaces?'))return response([{id:NS,script:'vibies-pr-61',class:'GoogleCoordinator',use_sqlite:true}]);
      throw Error('unexpected allocation');};
    await assert.rejects(deployPreviewArtifact({...opts,cloudflareFetch:cf}),/coordinator|namespace/);
    assert(calls.every(method=>method==='GET'));
  }
});

test('every configured environment provisions its own SQLite coordinator',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.deepEqual(config.migrations,[{tag:'v1-google-coordinator',new_sqlite_classes:['GoogleCoordinator']}]);
  for(const environment of [config,...Object.values(config.env)])
    assert.deepEqual(environment.durable_objects,{bindings:[{name:'GOOGLE_COORDINATOR',class_name:'GoogleCoordinator'}]});
});
