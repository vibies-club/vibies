import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runStaging } from "../scripts/staging.mjs";

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
const PROJECT = "prj_synthetic";
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
  return Response.json(data, { status });
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
      { path: "migrations/20260910065142_remote_schema.sql", mode: "100644", type: "blob", sha: MIGRATION_ONE },
      { path: "migrations/20260910220000_demo_projects.sql", mode: "100644", type: "blob", sha: MIGRATION_TWO },
    ],
    markerSteps: [],
    requests: [],
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

      if (method === "GET" && url.pathname === `${root}/git/ref/heads/main`) {
        state.mainReads += 1;
        state.onMainRead?.(state);
        return response({ ref: "refs/heads/main", object: { type: "commit", sha: state.main } });
      }
      if (method === "GET" && url.pathname === `${root}/git/ref/heads/staging`) {
        return response({ ref: "refs/heads/staging", object: { type: "commit", sha: state.staging } });
      }
      if (method === "PATCH" && url.pathname === `${root}/git/refs/heads/staging`) {
        const body = JSON.parse(init.body);
        assert.deepEqual(Object.keys(body).sort(), ["force", "sha"]);
        assert.equal(body.force, true);
        state.staging = body.sha;
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
          tree: [{ path: "supabase", mode: "040000", type: "tree", sha: state.mainSupabase }],
        });
        if (sha === HEAD_ROOT) return response({
          sha, truncated: false,
          tree: [{ path: "supabase", mode: "040000", type: "tree", sha: state.headSupabase }],
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
    return response(step ?? { projectId: PROJECT, sha: state.staging, nonce, ref: "staging" });
  };
  return state;
}

function options(state, changes = {}) {
  let clock = 0;
  let nonceNumber = 0;
  const summaries = [];
  return {
    values: {
      repository: REPOSITORY,
      workflowSha: MAIN,
      operation: "Preview PR",
      prNumber: PR,
      origin: ORIGIN,
      projectId: PROJECT,
      baselineTree: SUPABASE,
      githubToken: TOKEN,
      fetchImpl: state.fetch,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      nonce: () => `nonce-${++nonceNumber}`,
      timeoutMs: 10_000,
      writeSummary: (markdown) => summaries.push(markdown),
      ...changes,
    },
    summaries,
  };
}

function mutations(state) {
  return state.requests.filter(({ init }) => ["PATCH", "POST"].includes(init.method));
}

test("Preview PR updates only the existing staging ref and writes exact receipts", async () => {
  const state = syntheticApi();
  const call = options(state);

  const result = await runStaging(call.values);

  assert.equal(result.main, MAIN);
  assert.equal(result.head, HEAD);
  assert.equal(result.merge, MERGE);
  assert.deepEqual(result.versions, ["20260910065142", "20260910220000"]);
  const changed = mutations(state);
  assert.equal(changed.filter(({ init }) => init.method === "PATCH").length, 1);
  assert.equal(changed[0].url.pathname, `/repos/${REPOSITORY}/git/refs/heads/staging`);
  assert.deepEqual(JSON.parse(changed[0].init.body), { sha: HEAD, force: true });
  assert.equal(state.requests.some(({ url }) => url.pathname.includes("git/refs/heads/main")), false);
  assert.equal(state.comments.length, 1);
  assert.equal(call.summaries.length, 1);
  for (const receipt of [state.comments[0], call.summaries[0]]) {
    assert.match(receipt, /Result: success/);
    assert.ok(receipt.includes(`Main: \`${MAIN}\``));
    assert.ok(receipt.includes(`Head: \`${HEAD}\``));
    assert.ok(receipt.includes(`Supabase tree: \`${SUPABASE}\``));
    assert.match(receipt, /Migration versions: `20260910065142`, `20260910220000`/);
    assert.match(receipt, /Vercel project: `prj_synthetic`/);
    assert.match(receipt, /one point in time/);
  }
});

test("Clear verifies main CI and baseline, then returns staging to main without a PR comment", async () => {
  const state = syntheticApi();
  const call = options(state, { operation: "Clear", prNumber: undefined });

  const result = await runStaging(call.values);

  assert.equal(result.head, MAIN);
  assert.equal(state.staging, MAIN);
  assert.equal(state.comments.length, 0);
  assert.equal(call.summaries.length, 1);
  assert.match(call.summaries[0], /Operation: Clear/);
  assert.match(call.summaries[0], /PR: none/);
  const checkedShas = state.requests
    .filter(({ url }) => url.pathname.endsWith("/check-runs"))
    .map(({ url }) => /\/commits\/([0-9a-f]{40})/.exec(url.pathname)[1]);
  assert.ok(checkedShas.length >= 2);
  assert.ok(checkedShas.every((sha) => sha === MAIN));
});

test("Clear accepts only required checks from main push workflow runs", async () => {
  const state = syntheticApi({ actionChanges: { event: "pull_request" } });
  await assert.rejects(
    runStaging(options(state, { operation: "Clear", prNumber: undefined }).values),
    /not a main push run/
  );
  assert.equal(mutations(state).length, 0);
});

test("repository, SHA, public metadata, and operation guards fail before API access", async (t) => {
  const cases = [
    ["repository", { repository: "other/repository" }],
    ["workflow SHA", { workflowSha: "abc" }],
    ["operation", { operation: "Deploy" }],
    ["PR number", { prNumber: 0 }],
    ["origin path", { origin: `${ORIGIN}/path` }],
    ["origin credentials", { origin: "https://user@example.test" }],
    ["origin query", { origin: `${ORIGIN}?x=1` }],
    ["origin protocol", { origin: "http://staging.example.test" }],
    ["project", { projectId: "project" }],
    ["baseline", { baselineTree: "123" }],
    ["timeout", { timeoutMs: 570_001 }],
  ];
  for (const [name, changes] of cases) {
    await t.test(name, async () => {
      const state = syntheticApi();
      await assert.rejects(runStaging(options(state, changes).values));
      assert.equal(state.requests.length, 0);
    });
  }
});

test("PR source and ancestry guards reject closed, draft, fork, stale, and divergent PRs", async (t) => {
  const cases = [
    ["closed", { pullChanges: { state: "closed" } }],
    ["draft", { pullChanges: { draft: true } }],
    ["fork", { pullChanges: { head: { ref: "feature/x", sha: HEAD,
      repo: { full_name: "someone/fork" } } } }],
    ["other base", { pullChanges: { base: { ref: "develop", sha: MAIN,
      repo: { full_name: REPOSITORY } } } }],
    ["staging head", { pullChanges: { head: { ref: "staging", sha: HEAD,
      repo: { full_name: REPOSITORY } } } }],
    ["divergent", { compareChanges: { status: "diverged", merge_base_commit: { sha: "a".repeat(40) } } }],
  ];
  for (const [name, changes] of cases) {
    await t.test(name, async () => {
      const state = syntheticApi(changes);
      const call = options(state);
      await assert.rejects(runStaging(call.values));
      assert.equal(mutations(state).length, 0);
      assert.deepEqual(call.summaries, []);
    });
  }
});

test("synthetic merge must have exact main and head parents and the head tree", async (t) => {
  for (const changes of [
    { mergeParents: [HEAD, MAIN] },
    { mergeParents: [MAIN] },
    { mergeTree: "a".repeat(40) },
  ]) {
    await t.test("invalid merge", async () => {
      const state = syntheticApi(changes);
      await assert.rejects(runStaging(options(state).values), /merge commit does not exactly combine/);
      assert.equal(mutations(state).length, 0);
    });
  }
});

test("main, candidate, and owner-attested Supabase trees must match", async (t) => {
  const other = "a".repeat(40);
  for (const [name, changes, optionChanges] of [
    ["main baseline", { mainSupabase: other }, {}],
    ["candidate", { headSupabase: other }, {}],
    ["owner baseline", {}, { baselineTree: other }],
  ]) {
    await t.test(name, async () => {
      const state = syntheticApi(changes);
      await assert.rejects(runStaging(options(state, optionChanges).values), /Supabase|supabase/);
      assert.equal(mutations(state).length, 0);
    });
  }
});

test("migration receipt rejects truncated, malformed, and duplicate tree metadata", async (t) => {
  const badRows = [
    [{ path: "migrations/wrong.sql", mode: "100644", type: "blob", sha: MIGRATION_ONE }],
    [
      { path: "migrations/20260910065142_one.sql", mode: "100644", type: "blob", sha: MIGRATION_ONE },
      { path: "migrations/20260910065142_two.sql", mode: "100644", type: "blob", sha: MIGRATION_TWO },
    ],
    [{ path: "migrations/20260910065142_one.sql", mode: "100755", type: "blob", sha: MIGRATION_ONE }],
  ];
  for (const rows of badRows) {
    await t.test("invalid migration tree", async () => {
      const state = syntheticApi({ migrationRows: rows });
      await assert.rejects(runStaging(options(state).values), /migration metadata/);
      assert.equal(mutations(state).length, 0);
    });
  }
});

test("required checks reject failure, missing checks, forged runs, forged suites, and unrelated suites", async (t) => {
  const cases = [
    ["failed", { checkChanges: { conclusion: "failure" } }, /did not complete successfully/],
    ["missing", { omitCheck: "links" }, /required check links is missing/],
    ["forged run", { checkChanges: { app: { id: 88, slug: "other-app" } } }, /did not complete successfully/],
    ["forged suite", { suiteChanges: { app: { id: 88, slug: "other-app" } } }, /invalid check-suite origin/],
    ["unrelated suite", { suiteChanges: { pull_requests: [] } }, /not for the selected pull request/],
    ["wrong workflow", { actionChanges: { path: ".github/workflows/other.yml" } }, /invalid workflow-run metadata/],
    ["wrong PR base", { actionChanges: { pull_requests: [{
      number: PR,
      base: { ref: "main", sha: "a".repeat(40), repo: {
        id: 1329797618, name: "vibies", url: `https://api.github.com/repos/${REPOSITORY}`,
      } },
      head: { ref: "feature/reusable-staging", sha: HEAD, repo: {
        id: 1329797618, name: "vibies", url: `https://api.github.com/repos/${REPOSITORY}`,
      } },
    }] } }, /not for the selected pull request/],
  ];
  for (const [name, changes, pattern] of cases) {
    await t.test(name, async () => {
      const state = syntheticApi(changes);
      await assert.rejects(runStaging(options(state).values), pattern);
      assert.equal(mutations(state).length, 0);
    });
  }
});

test("provider failures do not expose response bodies or create success receipts", async () => {
  const state = syntheticApi({ checkHttpStatus: 503 });
  const call = options(state);
  let failure;
  try {
    await runStaging(call.values);
  } catch (error) {
    failure = error;
  }
  assert.match(failure?.message ?? "", /HTTP 503/);
  assert.doesNotMatch(failure?.message ?? "", new RegExp(BODY_CANARY));
  assert.equal(state.comments.length, 0);
  assert.deepEqual(call.summaries, []);
  assert.equal(mutations(state).length, 0);
});

test("a changed PR head or merge SHA blocks mutation and blocks the success receipt", async (t) => {
  await t.test("before ref update", async () => {
    const state = syntheticApi({
      onPullRead(value) {
        if (value.pullReads === 2) value.head = "a".repeat(40);
      },
    });
    await assert.rejects(runStaging(options(state).values), /head or merge commit changed/);
    assert.equal(mutations(state).length, 0);
  });

  await t.test("after deployment", async () => {
    const state = syntheticApi({
      onPullRead(value) {
        if (value.pullReads === 3) value.merge = "b".repeat(40);
      },
    });
    const call = options(state);
    await assert.rejects(runStaging(call.values), /head or merge commit changed/);
    assert.equal(state.staging, HEAD);
    assert.equal(state.comments.length, 0);
    assert.deepEqual(call.summaries, []);
  });
});

test("a changed main blocks mutation and blocks the success receipt", async (t) => {
  await t.test("before ref update", async () => {
    const state = syntheticApi({
      onMainRead(value) {
        if (value.mainReads === 2) value.main = "a".repeat(40);
      },
    });
    await assert.rejects(runStaging(options(state).values), /main changed/);
    assert.equal(mutations(state).length, 0);
  });

  await t.test("after deployment", async () => {
    const state = syntheticApi({
      onMainRead(value) {
        if (value.mainReads === 3) value.main = "a".repeat(40);
      },
    });
    const call = options(state);
    await assert.rejects(runStaging(call.values), /main changed/);
    assert.equal(state.comments.length, 0);
    assert.deepEqual(call.summaries, []);
  });
});

test("polling tolerates request failure and stale alias, and uses a new nonce each time", async () => {
  const state = syntheticApi({ markerSteps: [
    new Error("network body canary"),
    ({ nonce }) => response({ projectId: PROJECT, sha: OLD_STAGING, nonce, ref: "staging" }),
  ] });
  await runStaging(options(state).values);

  const polls = state.requests.filter(({ url }) => url.origin === ORIGIN);
  assert.equal(polls.length, 3);
  assert.deepEqual(polls.map(({ url }) => url.searchParams.get("nonce")),
    ["nonce-1", "nonce-2", "nonce-3"]);
  assert.equal(new Set(polls.map(({ url }) => url.href)).size, 3);
});

test("marker schema, project, ref, and nonce mismatches cannot create success receipts", async (t) => {
  const cases = [
    ["schema", ({ nonce }) => response({ projectId: PROJECT, sha: HEAD, nonce })],
    ["project", ({ nonce }) => response({ projectId: "prj_other", sha: HEAD, nonce, ref: "staging" })],
    ["ref", ({ nonce }) => response({ projectId: PROJECT, sha: HEAD, nonce, ref: "feature/x" })],
    ["nonce", () => response({ projectId: PROJECT, sha: HEAD, nonce: "old", ref: "staging" })],
  ];
  for (const [name, marker] of cases) {
    await t.test(name, async () => {
      const state = syntheticApi({ markerSteps: [marker] });
      const call = options(state);
      await assert.rejects(runStaging(call.values), /marker/);
      assert.equal(state.staging, HEAD);
      assert.equal(state.comments.length, 0);
      assert.deepEqual(call.summaries, []);
    });
  }
});

test("deployment timeout and a changed staging ref cannot create success receipts", async (t) => {
  await t.test("timeout", async () => {
    const unavailable = () => response({ error: BODY_CANARY }, 503);
    const state = syntheticApi({ markerSteps: [unavailable, unavailable] });
    const call = options(state, { timeoutMs: 1 });
    let failure;
    try {
      await runStaging(call.values);
    } catch (error) {
      failure = error;
    }
    assert.match(failure?.message ?? "", /timed out.*HTTP 503/);
    assert.doesNotMatch(failure?.message ?? "", new RegExp(BODY_CANARY));
    assert.equal(state.comments.length, 0);
    assert.deepEqual(call.summaries, []);
  });

  await t.test("ref race", async () => {
    const state = syntheticApi({ markerSteps: [({ nonce, state: value }) => {
      value.staging = "a".repeat(40);
      return response({ projectId: PROJECT, sha: HEAD, nonce, ref: "staging" });
    }] });
    const call = options(state);
    await assert.rejects(runStaging(call.values), /staging ref changed/);
    assert.equal(state.comments.length, 0);
    assert.deepEqual(call.summaries, []);
  });
});

test("workflow is manual, main-only, serialized, protected, and checks out its pinned trusted SHA", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const workflow = readFileSync(`${root}/.github/workflows/staging.yml`, "utf8");
  assert.match(workflow, /^name: staging$/m);
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /pull_request:|pull_request_target:|\n  push:/);
  assert.match(workflow, /options:\n\s+- Preview PR\n\s+- Clear/);
  assert.match(workflow, /contents: write\n\s+pull-requests: write\n\s+checks: read\n\s+actions: read/);
  assert.match(workflow, /group: reusable-staging\n\s+cancel-in-progress: false/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /github\.repository == 'vibies-club\/vibies'.*github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /repository: vibies-club\/vibies\n\s+ref: \$\{\{ github\.sha \}\}\n\s+persist-credentials: false/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /STAGING_WORKFLOW_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /STAGING_ORIGIN: \$\{\{ vars\.STAGING_ORIGIN \}\}/);
  assert.doesNotMatch(workflow, /VERCEL_TOKEN|secrets\./);
});
