import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { cleanupPreviewSettings } from "../scripts/cleanup-vercel-preview.mjs";

const REPOSITORY = "vibies-club/vibies";
const PR_NUMBER = 32;
const BRANCH = "feature/vercel-preview-cleanup-32";
const GITHUB_TOKEN = "github-token-canary";
const VERCEL_TOKEN = "vercel-token-canary";
const VALUE_CANARY = "environment-value-canary";
const BODY_CANARY = "provider-body-canary";

const mergedPull = (changes = {}) => ({
  number: PR_NUMBER,
  state: "closed",
  merged: true,
  merged_at: "2026-09-11T07:00:00Z",
  base: { ref: "main", repo: { full_name: REPOSITORY } },
  head: { ref: BRANCH, repo: { full_name: REPOSITORY } },
  ...changes,
});

const openPull = (number, branch = `feature/other-${number}`) => ({
  number,
  state: "open",
  head: { ref: branch, repo: { full_name: REPOSITORY } },
});

const setting = (id, key, changes = {}) => ({
  id,
  key,
  target: ["preview"],
  gitBranch: BRANCH,
  customEnvironmentIds: [],
  value: VALUE_CANARY,
  ...changes,
});

function api({ pull = mergedPull(), openPages = [[]], envs = [], payload, failDeleteIds = [] } = {}) {
  const state = {
    envs: envs.map((entry) => ({ ...entry })),
    failDeleteIds: new Set(failDeleteIds),
    requests: [],
  };

  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    state.requests.push({ url, init });
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.doesNotMatch(url.href, /token-canary|value-canary|body-canary/);

    if (url.origin === "https://api.github.com") {
      assert.equal(headers.get("authorization"), `Bearer ${GITHUB_TOKEN}`);
      assert.equal(headers.get("accept"), "application/vnd.github+json");
      assert.equal(headers.get("x-github-api-version"), "2026-03-10");
      if (url.pathname === `/repos/${REPOSITORY}/pulls/${PR_NUMBER}` && !url.search) {
        return Response.json(pull);
      }
      if (url.pathname === `/repos/${REPOSITORY}/pulls`) {
        assert.equal(url.searchParams.get("state"), "open");
        assert.equal(url.searchParams.get("per_page"), "100");
        const page = Number(url.searchParams.get("page"));
        return Response.json(openPages[page - 1] ?? []);
      }
    }

    if (url.origin === "https://api.vercel.com") {
      assert.equal(headers.get("authorization"), `Bearer ${VERCEL_TOKEN}`);
      assert.equal(url.searchParams.get("teamId"), "team_synthetic");
      if (init.method === "GET" && url.pathname === "/v10/projects/prj_synthetic/env") {
        assert.equal(url.searchParams.get("gitBranch"), BRANCH);
        assert.equal(url.searchParams.get("decrypt"), "false");
        return Response.json(payload ? payload(state) : {
          envs: state.envs,
          pagination: { count: state.envs.length, next: null, prev: null },
        });
      }
      const deleted = /^\/v9\/projects\/prj_synthetic\/env\/([^/]+)$/.exec(url.pathname);
      if (init.method === "DELETE" && deleted) {
        const id = decodeURIComponent(deleted[1]);
        if (state.failDeleteIds.has(id)) {
          return Response.json({ error: BODY_CANARY, value: VALUE_CANARY }, { status: 503 });
        }
        state.envs = state.envs.filter((entry) => entry.id !== id);
        return new Response(null, { status: 204 });
      }
    }

    throw new Error(`Unexpected synthetic request: ${init.method} ${url.href}`);
  };
  return state;
}

const options = (state, changes = {}) => ({
  repository: REPOSITORY,
  prNumber: PR_NUMBER,
  projectId: "prj_synthetic",
  teamId: "team_synthetic",
  githubToken: GITHUB_TOKEN,
  vercelToken: VERCEL_TOKEN,
  fetchImpl: state.fetch,
  log: () => {},
  ...changes,
});

test("dry-run reports only exact branch Preview settings", async () => {
  const state = api({ envs: [
    setting("row_b", "BETA_KEY"),
    setting("row_a", "ALPHA_KEY"),
    setting("row_prod", "PRODUCTION_KEY", { target: ["production"] }),
    setting("row_prod_string", "PRODUCTION_STRING_KEY", { target: "production" }),
    setting("row_preview_string", "PREVIEW_STRING_KEY", { target: "preview" }),
    setting("row_other", "OTHER_BRANCH_KEY", { gitBranch: "feature/other" }),
    setting("row_shared", "SHARED_PREVIEW_KEY", { gitBranch: null }),
    setting("row_multi", "MULTI_TARGET_KEY", { target: ["preview", "production"] }),
    setting("row_custom", "CUSTOM_KEY", { customEnvironmentIds: ["env_staging"] }),
  ] });
  const logs = [];

  const result = await cleanupPreviewSettings(options(state, { log: (line) => logs.push(line) }));

  assert.deepEqual(result, { branch: BRANCH, matched: 2, deleted: [] });
  assert.deepEqual(state.envs.map(({ key }) => key), [
    "BETA_KEY", "ALPHA_KEY", "PRODUCTION_KEY", "PRODUCTION_STRING_KEY",
    "PREVIEW_STRING_KEY", "OTHER_BRANCH_KEY",
    "SHARED_PREVIEW_KEY", "MULTI_TARGET_KEY", "CUSTOM_KEY",
  ]);
  assert.equal(state.requests.some(({ init }) => init.method === "DELETE"), false);
  assert.match(logs.join("\n"), /Settings: ALPHA_KEY, BETA_KEY/);
  assert.match(logs.join("\n"), /Dry run: 0 settings deleted/);
  assert.doesNotMatch(logs.join("\n"), new RegExp(`${VALUE_CANARY}|${GITHUB_TOKEN}|${VERCEL_TOKEN}`));
});

test("apply revalidates and deletes only the exact entries", async () => {
  const state = api({ envs: [
    setting("row_b", "BETA_KEY"),
    setting("row_a", "ALPHA_KEY"),
    setting("row_prod", "PRODUCTION_KEY", { target: ["production"] }),
    setting("row_shared", "SHARED_PREVIEW_KEY", { gitBranch: null }),
  ] });

  const result = await cleanupPreviewSettings(options(state, { apply: true }));

  assert.deepEqual(result.deleted, ["ALPHA_KEY", "BETA_KEY"]);
  assert.deepEqual(state.envs.map(({ key }) => key), ["PRODUCTION_KEY", "SHARED_PREVIEW_KEY"]);
  assert.equal(state.requests.filter(({ url }) => url.origin === "https://api.github.com" &&
    url.pathname.endsWith(`/pulls/${PR_NUMBER}`)).length, 3);
  assert.equal(state.requests.filter(({ init }) => init.method === "DELETE").length, 2);
  assert.equal(state.requests.filter(({ url, init }) => init.method === "GET" &&
    url.origin === "https://api.vercel.com").length, 4);
});

test("merged-PR guards reject unsafe sources before Vercel access", async (t) => {
  const cases = [
    ["unmerged", { merged: false, merged_at: null }],
    ["fork", { head: { ref: BRANCH, repo: { full_name: "someone/fork" } } }],
    ["other base", { base: { ref: "develop", repo: { full_name: REPOSITORY } } }],
    ["other repository", { base: { ref: "main", repo: { full_name: "other/repository" } } }],
    ["main head", { head: { ref: "main", repo: { full_name: REPOSITORY } } }],
  ];

  for (const [name, changes] of cases) {
    await t.test(name, async () => {
      const state = api({ pull: mergedPull(changes) });
      await assert.rejects(cleanupPreviewSettings(options(state, { apply: true })),
        /not a merged same-repository PR into main/);
      assert.equal(state.requests.some(({ url }) => url.origin === "https://api.vercel.com"), false);
    });
  }

  const state = api();
  await assert.rejects(cleanupPreviewSettings(options(state, { repository: "other/repository" })),
    /unexpected repository/);
  assert.equal(state.requests.length, 0);
});

test("complete open-PR pagination protects a reused branch", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => openPull(1000 + index));
  const state = api({ openPages: [firstPage, [openPull(77, BRANCH)]] });

  await assert.rejects(cleanupPreviewSettings(options(state, { apply: true })),
    /branch feature\/vercel-preview-cleanup-32 is still used by open PR #77/);
  assert.equal(state.requests.filter(({ url }) => url.searchParams.get("page") === "2").length, 1);
  assert.equal(state.requests.some(({ url }) => url.origin === "https://api.vercel.com"), false);
});

test("open-PR pagination fails closed at its bound", async () => {
  const pages = Array.from({ length: 10 }, (_, page) => Array.from(
    { length: 100 }, (_, index) => openPull(10_000 + page * 100 + index)
  ));
  const state = api({ openPages: pages });

  await assert.rejects(cleanupPreviewSettings(options(state)), /pagination exceeded 10 pages/);
  assert.equal(state.requests.some(({ url }) => url.origin === "https://api.vercel.com"), false);
});

test("unexpected Vercel metadata fails before mutation", async (t) => {
  const payloads = [
    () => ({ envs: [setting("row_a", "ALPHA_KEY")],
      pagination: { count: 1, next: 123, prev: null } }),
    () => ({ envs: [setting("row_a", "ALPHA_KEY", { target: "staging" })] }),
    () => ({ envs: [setting("row_a", "ALPHA_KEY", { customEnvironmentIds: "env_staging" })] }),
    () => ({ envs: [setting("row_a", "ALPHA_KEY", { customEnvironmentIds: null })] }),
    () => ({ incomplete: true }),
  ];

  for (const payload of payloads) {
    await t.test("provider case", async () => {
      const state = api({ payload });
      await assert.rejects(cleanupPreviewSettings(options(state, { apply: true })), /Vercel returned/);
      assert.equal(state.requests.some(({ init }) => init.method === "DELETE"), false);
    });
  }
});

test("partial failure has a safe retry receipt and no secret leak", async () => {
  const state = api({
    envs: [setting("row_a", "ALPHA_KEY"), setting("row_b", "BETA_KEY")],
    failDeleteIds: ["row_b"],
  });
  const logs = [];
  let failure;
  try {
    await cleanupPreviewSettings(options(state, { apply: true, log: (line) => logs.push(line) }));
  } catch (error) {
    failure = error;
  }

  assert.match(failure?.message ?? "", /cleanup stopped after deleting 1 setting\(s\): ALPHA_KEY; retry is safe/);
  assert.deepEqual(state.envs.map(({ key }) => key), ["BETA_KEY"]);
  assert.doesNotMatch(`${failure?.message}\n${logs.join("\n")}`,
    new RegExp(`${BODY_CANARY}|${VALUE_CANARY}|${GITHUB_TOKEN}|${VERCEL_TOKEN}`));

  state.failDeleteIds.clear();
  const retry = await cleanupPreviewSettings(options(state, { apply: true }));
  assert.deepEqual(retry.deleted, ["BETA_KEY"]);
  const repeat = await cleanupPreviewSettings(options(state, { apply: true }));
  assert.deepEqual(repeat, { branch: BRANCH, matched: 0, deleted: [] });
});

test("workflow uses trusted main code and a protected environment", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const workflow = readFileSync(`${root}/.github/workflows/vercel-preview-cleanup.yml`, "utf8");
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /environment: preview-cleanup/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /repository: vibies-club\/vibies\n\s+ref: main\n\s+persist-credentials: false/);
  assert.match(workflow, /default: false\n\s+type: boolean/);
  assert.doesNotMatch(workflow, /pull_request\.head\.sha|github\.head_ref/);
});
