import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runStaging, prepareStaging } from "../scripts/staging.mjs";

const REPOSITORY = "vibies-club/vibies";
const PR = 37;
const MAIN = "1".repeat(40);
const MAIN_ROOT = "2".repeat(40);
const HEAD = "3".repeat(40);
const HEAD_ROOT = "4".repeat(40);
const MERGE = "5".repeat(40);
const SUPABASE = "6".repeat(40);
const OLD_STAGING = "7".repeat(40);
const MIGRATION_ONE = "8".repeat(40);
const MIGRATION_TWO = "9".repeat(40);
const TOKEN = "github-token-canary";
const BODY_CANARY = "provider-body-canary";
const ORIGIN = "https://staging.example.test";
const VERSION = "11111111-1111-4111-8111-111111111111";
const DATABASE = "22222222-2222-4222-8222-222222222222";
const ARTIFACT = "a".repeat(64);
const CHECKS = ["app-check", "migration-check", "links"];

function pull(state) {
  return {
    number: PR,
    state: "open",
    draft: false,
    base: { ref: "main", sha: state.main, repo: { full_name: REPOSITORY } },
    head: {
      ref: "feature/reusable-staging",
      sha: state.head,
      repo: { full_name: REPOSITORY },
    },
    merge_commit_sha: state.merge,
    ...state.pullChanges,
  };
}

function response(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function syntheticApi(changes = {}) {
  const state = {
    main: MAIN,
    head: HEAD,
    merge: MERGE,
    staging: OLD_STAGING,
    mainRoot: MAIN_ROOT,
    headRoot: HEAD_ROOT,
    mainSupabase: SUPABASE,
    headSupabase: SUPABASE,
    mergeParents: [MAIN, HEAD],
    mergeTree: HEAD_ROOT,
    pullChanges: {},
    compareChanges: {},
    checkChanges: {},
    suiteChanges: {},
    actionChanges: {},
    migrationRows: [
      { path: "d1/migrations/0001_application.sql", mode: "100644", type: "blob", sha: MIGRATION_ONE },
      { path: "d1/migrations/0002_activation.sql", mode: "100644", type: "blob", sha: MIGRATION_TWO },
    ],
    markerSteps: [],
    requests: [],
    pushes: [],
    comments: [],
    mainReads: 0,
    pullReads: 0,
    markerReads: 0,
    ...changes,
  };

  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    state.requests.push({ url, init: { ...init, method } });
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.doesNotMatch(url.href, /token-canary|body-canary/);

    if (url.origin === "https://api.github.com") {
      assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
      assert.equal(headers.get("accept"), "application/vnd.github+json");
      assert.equal(headers.get("x-github-api-version"), "2022-11-28");
      const root = `/repos/${REPOSITORY}`;

      if (method === "GET" && url.pathname === `${root}/actions/artifacts/123`) {
        return response({ id: 123, expired: false, name: "staging-build-42-1", digest: `sha256:${ARTIFACT}`,
          workflow_run: { id: 42, head_sha: MAIN, head_branch: "main", repository_id: 1234, head_repository_id: 1234 },
          ...state.artifactChanges });
      }
      if (method === "GET" && url.pathname === `${root}/git/ref/heads/main`) {
        state.mainReads += 1;
        state.onMainRead?.(state);
        return response({ ref: "refs/heads/main", object: { type: "commit", sha: state.main } });
      }
      if (method === "GET" && url.pathname === `${root}/git/ref/heads/staging`) {
        return response({ ref: "refs/heads/staging", object: { type: "commit", sha: state.staging } });
      }
      if (method === "GET" && url.pathname === `${root}/pulls/${PR}`) {
        state.pullReads += 1;
        state.onPullRead?.(state);
        return response(pull(state));
      }
      if (method === "GET" && url.pathname === `${root}/compare/${MAIN}...${HEAD}`) {
        return response({
          status: "ahead", ahead_by: 1, base_commit: { sha: MAIN }, merge_base_commit: { sha: MAIN },
          ...state.compareChanges,
        });
      }
      const commit = new RegExp(`^${root}/git/commits/([0-9a-f]{40})$`).exec(url.pathname);
      if (method === "GET" && commit) {
        const sha = commit[1];
        if (sha === MAIN) return response({ sha, tree: { sha: state.mainRoot }, parents: [] });
        if (sha === HEAD) return response({ sha, tree: { sha: state.headRoot }, parents: [{ sha: MAIN }] });
        if (sha === MERGE) return response({
          sha, tree: { sha: state.mergeTree }, parents: state.mergeParents.map((parent) => ({ sha: parent })),
        });
      }
      const tree = new RegExp(`^${root}/git/trees/([0-9a-f]{40})$`).exec(url.pathname);
      if (method === "GET" && tree) {
        const sha = tree[1];
        if (sha === MAIN_ROOT) return response({
          sha, truncated: false,
          tree: state.migrationRows,
        });
        if (sha === HEAD_ROOT) return response({
          sha, truncated: false,
          tree: state.candidateMigrationRows ?? state.migrationRows,
        });
        if (sha === SUPABASE && url.searchParams.get("recursive") === "1") {
          return response({ sha, truncated: false, tree: state.migrationRows });
        }
      }
      const checkRuns = new RegExp(`^${root}/commits/([0-9a-f]{40})/check-runs$`).exec(url.pathname);
      if (method === "GET" && checkRuns) {
        const sha = checkRuns[1];
        assert.equal(url.searchParams.get("filter"), "latest");
        assert.equal(url.searchParams.get("per_page"), "100");
        if (state.checkHttpStatus) return response({ error: BODY_CANARY }, state.checkHttpStatus);
        const runs = CHECKS.map((name, index) => ({
          name,
          head_sha: sha,
          status: "completed",
          conclusion: "success",
          app: { id: 15368, slug: "github-actions" },
          check_suite: { id: 100 + index },
          details_url: `https://github.com/${REPOSITORY}/actions/runs/${1100 + index}/job/${2100 + index}`,
          ...state.checkChanges,
        }));
        if (state.omitCheck) runs.splice(CHECKS.indexOf(state.omitCheck), 1);
        return response({ total_count: runs.length, check_runs: runs });
      }
      const suite = new RegExp(`^${root}/check-suites/(10[0-2])$`).exec(url.pathname);
      if (method === "GET" && suite) {
        const id = Number(suite[1]);
        const preceding = [...state.requests].reverse().find(({ url: requestUrl }) =>
          requestUrl.pathname.includes("/check-runs")
        );
        const sha = /\/commits\/([0-9a-f]{40})\/check-runs$/.exec(preceding.url.pathname)[1];
        return response({
          id,
          head_sha: sha,
          status: "completed",
          conclusion: "success",
          app: { id: 15368, slug: "github-actions" },
          pull_requests: [{
            number: PR,
            base: { ref: "main", sha: MAIN, repo: {
              id: 1329797618, name: "vibies", url: `https://api.github.com/repos/${REPOSITORY}`,
            } },
            head: { ref: "feature/reusable-staging", sha: HEAD, repo: {
              id: 1329797618, name: "vibies", url: `https://api.github.com/repos/${REPOSITORY}`,
            } },
          }],
          ...state.suiteChanges,
        });
      }
      const action = new RegExp(`^${root}/actions/runs/(110[0-2])$`).exec(url.pathname);
      if (method === "GET" && action) {
        const id = Number(action[1]);
        const index = id - 1100;
        const preceding = [...state.requests].reverse().find(({ url: requestUrl }) =>
          requestUrl.pathname.includes("/check-runs")
        );
        const sha = /\/commits\/([0-9a-f]{40})\/check-runs$/.exec(preceding.url.pathname)[1];
        const preview = sha === HEAD;
        return response({
          id,
          check_suite_id: 100 + index,
          conclusion: "success",
          event: preview ? "pull_request" : "push",
          head_branch: preview ? "feature/reusable-staging" : "main",
          head_repository: { full_name: REPOSITORY },
          head_sha: sha,
          name: ["app", "database", "docs"][index],
          path: [
            ".github/workflows/app.yml",
            ".github/workflows/database.yml",
            ".github/workflows/docs.yml",
          ][index],
          pull_requests: preview ? [{
            number: PR,
            base: { ref: "main", sha: MAIN, repo: {
              id: 1329797618, name: "vibies", url: `https://api.github.com/repos/${REPOSITORY}`,
            } },
            head: { ref: "feature/reusable-staging", sha: HEAD, repo: {
              id: 1329797618, name: "vibies", url: `https://api.github.com/repos/${REPOSITORY}`,
            } },
          }] : [],
          repository: { full_name: REPOSITORY },
          status: "completed",
          ...state.actionChanges,
        });
      }
      if (method === "POST" && url.pathname === `${root}/issues/${PR}/comments`) {
        const body = JSON.parse(init.body).body;
        state.comments.push(body);
        return response({ id: 501, body, issue_url: `https://api.github.com${root}/issues/${PR}` });
      }
      throw new Error(`Unexpected synthetic GitHub request: ${method} ${url.href}`);
    }

    assert.equal(url.origin, ORIGIN);
    assert.equal(url.pathname, "/staging.json");
    assert.deepEqual([...url.searchParams.keys()], ["nonce"]);
    assert.equal(method, "GET");
    assert.equal(init.cache, "no-store");
    assert.equal(headers.get("accept"), "application/json");
    const nonce = url.searchParams.get("nonce");
    const step = state.markerSteps[state.markerReads++];
    if (step instanceof Error) throw step;
    if (typeof step === "function") return step({ nonce, state });
    return response(step ?? { sha: state.staging, worker: "vibies-staging", versionId: VERSION,
      databaseId: DATABASE, schemaHash: state.schemaHash, migrationHash: state.schemaHash, artifactHash: ARTIFACT, environment: "staging", nonce });
  };
  return state;
}

function options(state, changes = {}) {
  let clock = 0, nonceNumber = 0;
  const summaries = [];
  const operation = changes.operation ?? "Preview PR";
  const migrations = (state.candidateMigrationRows ?? state.migrationRows).map(row => ({path: row.path, blob: row.sha}));
  const schemaHash = createHash("sha256").update(JSON.stringify(migrations)).digest("hex");
  state.schemaHash = schemaHash;
  return {
    values: {
      repository: REPOSITORY, actor: "0xinBeta", workflowSha: MAIN, operation,
      prNumber: operation === "Preview PR" ? PR : undefined, origin: ORIGIN, githubToken: TOKEN,
      artifactId: "123", artifactDigest: ARTIFACT, runId: "42", runAttempt: "1",
      plan: { format: 1, operation, prNumber: operation === "Preview PR" ? PR : null, main: MAIN,
        head: operation === "Preview PR" ? HEAD : MAIN, merge: operation === "Preview PR" ? MERGE : null, migrations, schemaHash },
      fetchImpl: state.fetch, inspect: () => ({ artifactHash: ARTIFACT }),
      deploy: async ({plan}) => {
        state.deployed = true; state.staging = plan.head;
        state.onDeploy?.(state);
        return { worker: "vibies-staging", versionId: VERSION, databaseId: DATABASE, schemaHash: plan.schemaHash, migrationHash: plan.schemaHash, artifactHash: ARTIFACT,
          verify: async () => { state.verified = true; }, cleanup: async () => { state.cleaned = true; } };
      },
      now: () => clock, sleep: async ms => { clock += ms; },
      nonce: () => (++nonceNumber).toString(16).padStart(32, "0"), timeoutMs: 10_000,
      writeSummary: text => summaries.push(text), ...changes,
    }, summaries,
  };
}

test("Preview PR verifies immutable artifact and Cloudflare identity before writing a receipt", async () => {
  const state = syntheticApi(); const call = options(state);
  const result = await runStaging(call.values);
  assert.equal(result.head, HEAD);
  assert.equal(result.versionId, VERSION);
  assert.equal(state.verified, true); assert.equal(state.cleaned, true);
  assert.equal(state.comments.length, 1); assert.equal(call.summaries.length, 1);
  assert.match(call.summaries[0], /Worker version:/); assert.match(call.summaries[0], /Synthetic D1:/);
  assert.match(call.summaries[0], /Artifact SHA-256:/);
  assert.equal(state.pushes.length, 0);
  assert.equal(state.requests.some(request => request.url.pathname.endsWith("/git/ref/heads/staging")), false);
});

test("Clear builds current main and resets synthetic staging without posting a PR comment", async () => {
  const state = syntheticApi(); const call = options(state, { operation: "Clear" });
  const result = await runStaging(call.values);
  assert.equal(result.head, MAIN); assert.equal(state.staging, MAIN);
  assert.equal(state.comments.length, 0); assert.match(call.summaries[0], /PR: none/);
  assert(state.requests.filter(r => r.url.pathname.endsWith("/check-runs")).every(r => r.url.pathname.includes(MAIN)));
});

test("Instructor, repository, immutable workflow and input guards reject before deployment", async (t) => {
  for (const changes of [{actor:"someone"},{repository:"someone/fork"},{workflowSha:"bad"},
    {operation:"Other"},{prNumber:0},{origin:"http://unsafe.test"},{origin:`${ORIGIN}/path`},
    {artifactDigest:"bad"},{artifactId:"bad"},{timeoutMs:570001}]) {
    await t.test(JSON.stringify(changes), async () => {
      const state=syntheticApi(); const call=options(state,changes);
      await assert.rejects(runStaging(call.values)); assert.equal(state.deployed,undefined);
      assert.equal(state.comments.length,0); assert.equal(call.summaries.length,0);
    });
  }
});

test("closed, draft, fork, divergent and changed-base PRs cannot deploy", async (t) => {
  for (const changes of [
    {pullChanges:{state:"closed"}}, {pullChanges:{draft:true}},
    {pullChanges:{head:{ref:"feature/x",sha:HEAD,repo:{full_name:"someone/fork"}}}},
    {pullChanges:{base:{ref:"main",sha:"f".repeat(40),repo:{full_name:REPOSITORY}}}},
    {compareChanges:{status:"diverged"}}, {mergeParents:[HEAD,MAIN]}, {mergeTree:MAIN_ROOT},
  ]) await t.test(JSON.stringify(changes),async()=>{
    const state=syntheticApi(changes); await assert.rejects(runStaging(options(state).values));
    assert.equal(state.deployed,undefined); assert.equal(state.comments.length,0);
  });
});

test("D1 migrations permit only an unchanged main prefix followed by new versions", async (t) => {
  const append = {path:"d1/migrations/0003_extra.sql",mode:"100644",type:"blob",sha:"a".repeat(40)};
  const state=syntheticApi(); state.candidateMigrationRows=[...state.migrationRows,append];
  await runStaging(options(state).values); assert.equal(state.deployed,true);
  for (const candidate of [state.migrationRows.slice(1), [...state.migrationRows].reverse(),
    [{...state.migrationRows[0],sha:"a".repeat(40)},state.migrationRows[1]],
    [...state.migrationRows,{...append,path:"d1/migrations/0002_other.sql"}]]) {
    await t.test("invalid prefix or duplicate",async()=>{
      const bad=syntheticApi({candidateMigrationRows:candidate});
      await assert.rejects(runStaging(options(bad).values)); assert.equal(bad.deployed,undefined);
    });
  }
});

test("failed, forged and unrelated required checks never deploy", async (t) => {
  for(const changes of [
    {checkChanges:{conclusion:"failure"}}, {omitCheck:"links"}, {checkChanges:{app:{id:8,slug:"other"}}},
    {suiteChanges:{pull_requests:[]}}, {actionChanges:{path:".github/workflows/other.yml"}},
  ]) await t.test(JSON.stringify(changes),async()=>{
    const state=syntheticApi(changes); await assert.rejects(runStaging(options(state).values));
    assert.equal(state.deployed,undefined);
  });
});

test("artifact provenance and local integrity failures never reach deployment", async (t) => {
  for(const artifactChanges of [{expired:true},{digest:`sha256:${"b".repeat(64)}`},{name:"other"},
    {workflow_run:{id:99,head_sha:MAIN,head_branch:"main",repository_id:1234,head_repository_id:1234}}]) {
    await t.test(JSON.stringify(artifactChanges),async()=>{
      const state=syntheticApi({artifactChanges}); await assert.rejects(runStaging(options(state).values),/artifact/);
      assert.equal(state.deployed,undefined);
    });
  }
  const state=syntheticApi(); const call=options(state,{inspect:()=>{throw new Error("integrity");}});
  await assert.rejects(runStaging(call.values),/integrity/); assert.equal(state.deployed,undefined);
});

test("changes after build or deployment block success receipts", async (t) => {
  await t.test("build selection",async()=>{
    const state=syntheticApi(); const call=options(state); call.values.plan.head="b".repeat(40);
    await assert.rejects(runStaging(call.values),/selection changed/); assert.equal(state.deployed,undefined);
  });
  await t.test("post deployment",async()=>{
    const state=syntheticApi({onDeploy(s){s.main="a".repeat(40);}}); const call=options(state);
    await assert.rejects(runStaging(call.values)); assert.equal(state.comments.length,0); assert.deepEqual(call.summaries,[]);
  });
});

test("provider, marker mismatch, cacheability and timeout never produce success receipts", async (t) => {
  for(const changes of [
    {deploy:async()=>{throw new Error("provider failed");}},
    {timeoutMs:0},
  ]) await t.test("provider or timeout",async()=>{
    const state=syntheticApi({markerSteps:[()=>response({},503)]}); const call=options(state,changes);
    await assert.rejects(runStaging(call.values)); assert.equal(state.comments.length,0); assert.deepEqual(call.summaries,[]);
  });
  for(const marker of [()=>response({sha:HEAD}),()=>Response.json({}, {headers:{"cache-control":"public"}})]) {
    const state=syntheticApi({markerSteps:[marker]}); const call=options(state);
    await assert.rejects(runStaging(call.values),/identity|cacheable/); assert.equal(state.comments.length,0);
  }
});

test("workflow isolates exact-SHA build from protected trusted-main deployment credentials",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/staging.yml",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/); assert.match(workflow,/group: reusable-staging\n\s+cancel-in-progress: false/);
  assert.match(workflow,/github.actor == '0xinBeta'/); assert.match(workflow,/environment: staging/);
  const build=workflow.split("  build:")[1].split("  deploy:")[0];
  assert.doesNotMatch(build,/\$\{\{ secrets\.|^\s+environment:/m); assert.match(build,/needs.select.outputs.head/);
  const deploy=workflow.split("  deploy:")[1];
  assert.match(deploy,/ref: \$\{\{ github.sha \}\}/); assert.match(deploy,/npm ci --ignore-scripts/);
  assert.deepEqual([...workflow.matchAll(/secrets\.(\w+)/g)].map(match=>match[1]),["CLOUDFLARE_STAGING_API_TOKEN"]);
  assert.doesNotMatch(workflow,/STAGING_DEPLOY_KEY|STAGING_SUPABASE_TREE|git push|refs\/heads\/staging/);
});

test("artifact validation rejects modified migrations, files and symlinks", async () => {
  const { mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync }=await import("node:fs");
  const { tmpdir }=await import("node:os"); const { join }=await import("node:path");
  const { artifactFiles,inspectArtifact }=await import("../scripts/staging-cloudflare.mjs");
  const root=mkdtempSync(join(tmpdir(),"staging-artifact-test-"));
  try {
    for(const path of ["server","client","migrations"]) mkdirSync(join(root,path));
    writeFileSync(join(root,"server/index.js"),"export default {fetch(){return new Response('synthetic')}}");
    const sql="CREATE TABLE synthetic(id INTEGER);";
    writeFileSync(join(root,"migrations/0001_application.sql"),sql);
    const blob=createHash("sha1").update(`blob ${Buffer.byteLength(sql)}\0${sql}`).digest("hex");
    const plan={head:HEAD,migrations:[{path:"d1/migrations/0001_application.sql",blob}]};
    const files=artifactFiles(root),artifactHash=createHash("sha256").update(JSON.stringify(files)).digest("hex");
    writeFileSync(join(root,"manifest.json"),JSON.stringify({format:1,sha:HEAD,files,artifactHash}));
    assert.equal(inspectArtifact(root,plan).artifactHash,artifactHash);
    assert.throws(()=>inspectArtifact(root,{...plan,head:MAIN}),/integrity/);
    assert.throws(()=>inspectArtifact(root,{...plan,migrations:[{...plan.migrations[0],blob:MAIN}]}),/migration bytes/);
    symlinkSync(join(root,"server/index.js"),join(root,"server/link.js"));
    assert.throws(()=>inspectArtifact(root,plan),/symlinks/);
    rmSync(join(root,"server/link.js"));
    writeFileSync(join(root,"server/index.js"),"tampered");
    assert.throws(()=>inspectArtifact(root,plan),/integrity/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("Cloudflare deploy refuses inherited secrets and exhausted free database capacity", async () => {
  const {deployStagingArtifact}=await import("../scripts/staging-cloudflare.mjs");
  for(const mode of ["secret","capacity"]) {
    const calls=[];
    const cf=async (url,init)=>{
      calls.push({url,method:init.method});
      if(url.endsWith("/settings")) return response({success:true,result:{bindings:mode==="secret"?[{type:"secret_text",name:"PRIVATE"}]:[]}});
      if(url.includes("/d1/database?")) return response({success:true,result:Array.from({length:10},(_,n)=>({uuid:String(n)}))});
      throw new Error("unexpected mutation");
    };
    await assert.rejects(deployStagingArtifact({accountId:"a".repeat(32),cloudflareToken:"synthetic",runId:"42",runAttempt:"1",cloudflareFetch:cf}),/secret|capacity/);
    assert(calls.every(call=>call.method==="GET"));
  }
});

test("trusted Cloudflare deployment uploads only the artifact and freshly isolated DB", async () => {
  const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=await import("node:fs");
  const {tmpdir}=await import("node:os"); const {join}=await import("node:path");
  const {deployStagingArtifact}=await import("../scripts/staging-cloudflare.mjs");
  const root=mkdtempSync(join(tmpdir(),"staging-provider-test-"));
  const calls=[]; let uploaded=false, executed=false, wrapper;
  const schemaRows=[{type:"table",name:"synthetic",tbl_name:"synthetic",sql:"CREATE TABLE synthetic(id INTEGER)"}];
  const schemaHash=createHash("sha256").update(JSON.stringify(schemaRows)).digest("hex");
  const migrationHash="d".repeat(64);
  try {
    for(const name of ["server","client","migrations"]) mkdirSync(join(root,name));
    writeFileSync(join(root,"server/index.js"),"export default {fetch(){return new Response('synthetic')}}");
    writeFileSync(join(root,"client/index.html"),"synthetic");
    writeFileSync(join(root,"migrations/0001_application.sql"),"CREATE TABLE synthetic(id INTEGER);");
    const cloudflareFetch=async(url,init)=>{
      calls.push({url,init});
      const body=init.body?JSON.parse(init.body):null;
      let result;
      if(url.endsWith("/settings")) result={bindings:uploaded?[
        {type:"d1",name:"DB",id:DATABASE},{type:"plain_text",name:"VIBIES_STAGING_SHA",text:HEAD},
        {type:"plain_text",name:"VIBIES_STAGING_ARTIFACT_HASH",text:ARTIFACT}]:[]};
      else if(url.includes("/d1/database?")) result=[];
      else if(url.endsWith("/d1/database")&&init.method==="POST") result={uuid:DATABASE,name:body.name};
      else if(url.endsWith("/query")) {
        let results=[];
        if(body.sql.startsWith("SELECT type,name")) results=schemaRows;
        if(body.sql.startsWith("SELECT schema_hash")) results=[{schema_hash:schemaHash,migration_hash:migrationHash,source_sha:HEAD}];
        result=[{success:true,results}];
      } else if(url.endsWith("/deployments")) result={deployments:[{versions:[{version_id:VERSION,percentage:100}]}]};
      else throw new Error("unexpected provider call");
      return response({success:true,result});
    };
    const deployed=await deployStagingArtifact({accountId:"a".repeat(32),cloudflareToken:"synthetic-secret",
      runId:"42",runAttempt:"1",origin:ORIGIN,plan:{head:HEAD,schemaHash:migrationHash,migrations:[{path:"d1/migrations/0001_application.sql"}]},
      artifact:{root,artifactHash:ARTIFACT},cloudflareFetch,
      execute(_node,args,opts){
        executed=true;
        const config=JSON.parse(readFileSync(args[args.indexOf("--config")+1],"utf8"));
        assert.equal(config.no_bundle,true); assert.equal(config.name,"vibies-staging");
        assert.deepEqual(config.assets.run_worker_first,["/*","!/_next/static/*","!/*/_next/static/*"]);
        const workerFirst = path => config.assets.run_worker_first.some(pattern => !pattern.startsWith("!") && new RegExp(`^${pattern.replaceAll("*", ".*")}$`).test(path)) &&
          !config.assets.run_worker_first.some(pattern => pattern.startsWith("!") && new RegExp(`^${pattern.slice(1).replaceAll("*", ".*")}$`).test(path));
        for (const path of ["/_next/static/chunks/app.js","/_next/static/css/app.css","/base/_next/static/media/logo.png"]) assert.equal(workerFirst(path),false,path);
        for (const path of ["/staging.json","/staging.json?nonce=abc","/demo"]) assert.equal(workerFirst(path),true,path);

        assert.deepEqual(config.d1_databases.map(binding=>binding.database_id),[DATABASE]);
        assert.equal(config.vars.VIBIES_ENVIRONMENT,"staging");
        assert.deepEqual(Object.keys(opts.env).sort(),["CI","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN","HOME","PATH","WRANGLER_LOG_PATH","WRANGLER_SEND_METRICS"]);
        assert.doesNotMatch(JSON.stringify(config),/synthetic-secret/);
        wrapper=readFileSync(join(opts.cwd,"staging-entry.js"),"utf8");
        assert.match(wrapper,/env.STAGING_VERSION.id/);
        uploaded=true;
      },
    });
    assert.equal(executed,true); assert.equal(deployed.schemaHash,schemaHash); assert.equal(deployed.migrationHash,migrationHash);
    await deployed.verify(); await deployed.cleanup();
    const {Miniflare}=await import("miniflare");
    const mf=new Miniflare({compatibilityDate:"2026-08-06",modulesRoot:root,modules:[
      {type:"ESModule",path:join(root,"staging-entry.js"),contents:wrapper},
      {type:"ESModule",path:join(root,"server/index.js"),contents:readFileSync(join(root,"server/index.js"),"utf8")},
    ],bindings:{STAGING_VERSION:{id:VERSION}}});
    try {
      const identity=await mf.dispatchFetch(`https://staging.test/staging.json?nonce=${"a".repeat(32)}`);
      assert.equal(identity.headers.get("cache-control"),"no-store");
      assert.deepEqual(await identity.json(),{sha:HEAD,worker:"vibies-staging",databaseId:DATABASE,schemaHash,
        migrationHash,artifactHash:ARTIFACT,versionId:VERSION,environment:"staging",nonce:"a".repeat(32)});
      assert.equal((await mf.dispatchFetch("https://staging.test/staging.json")).status,400);
      assert.equal(await (await mf.dispatchFetch("https://staging.test/demo")).text(),"synthetic");
    } finally {await mf.dispose();}
    assert(calls.filter(call=>call.url.endsWith("/query")).every(call=>call.url.includes(DATABASE)));
  } finally {rmSync(root,{recursive:true,force:true});}
});
