#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPOSITORY = "vibies-club/vibies";
const API = "https://api.github.com";
const STAGING_REF = "refs/heads/staging";
const REQUIRED_CHECKS = [
  { check: "app-check", workflow: "app", path: ".github/workflows/app.yml" },
  { check: "migration-check", workflow: "database", path: ".github/workflows/database.yml" },
  { check: "links", workflow: "docs", path: ".github/workflows/docs.yml" },
];
const REQUEST_TIMEOUT_MS = 10_000;
const DEPLOY_TIMEOUT_MS = 570_000;
const POLL_INTERVAL_MS = 5_000;

class SafeError extends Error {}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function safeProjectId(value) {
  return typeof value === "string" && /^prj_[A-Za-z0-9_-]{1,123}$/.test(value);
}

function stagingOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SafeError("invalid staging origin");
  }
  if (url.protocol !== "https:" || url.origin !== value || url.pathname !== "/" ||
      url.username || url.password || url.search || url.hash) {
    throw new SafeError("staging origin must be an exact HTTPS origin");
  }
  return value;
}

function safeBranch(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 250 &&
    /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..") && !value.includes("//");
}

async function githubRequest(fetchImpl, token, path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        // ponytail: retains merge_commit_sha; migrate before this API retires in March 2028.
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SafeError(`GitHub ${method} request did not complete`);
  }
  if (!response.ok) {
    throw new SafeError(`GitHub ${method} request failed with HTTP ${response.status}`);
  }
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new SafeError("GitHub returned an unexpected content type");
  }
  try {
    return await response.json();
  } catch {
    throw new SafeError("GitHub returned invalid JSON");
  }
}

function api(fetchImpl, token) {
  return (path, options) => githubRequest(fetchImpl, token, path, options);
}

async function getRef(request, name) {
  const data = await request(`/repos/${REPOSITORY}/git/ref/heads/${name}`);
  const expected = `refs/heads/${name}`;
  if (!record(data) || data.ref !== expected || data.object?.type !== "commit" ||
      !isSha(data.object?.sha)) {
    throw new SafeError(`GitHub returned invalid ${expected} metadata`);
  }
  return data.object.sha;
}

async function getCommit(request, sha) {
  const data = await request(`/repos/${REPOSITORY}/git/commits/${sha}`);
  if (!record(data) || data.sha !== sha || !isSha(data.tree?.sha) ||
      !Array.isArray(data.parents) || data.parents.some((parent) => !isSha(parent?.sha))) {
    throw new SafeError("GitHub returned invalid commit metadata");
  }
  return { sha, tree: data.tree.sha, parents: data.parents.map((parent) => parent.sha) };
}

async function getSupabaseTree(request, rootTree) {
  const data = await request(`/repos/${REPOSITORY}/git/trees/${rootTree}`);
  if (!record(data) || data.sha !== rootTree || data.truncated !== false || !Array.isArray(data.tree)) {
    throw new SafeError("GitHub returned invalid root tree metadata");
  }
  const matches = data.tree.filter((entry) => entry?.path === "supabase");
  if (matches.length !== 1 || matches[0].type !== "tree" || matches[0].mode !== "040000" ||
      !isSha(matches[0].sha)) {
    throw new SafeError("commit does not have one valid supabase tree");
  }
  return matches[0].sha;
}

async function getMigrationVersions(request, supabaseTree) {
  const data = await request(`/repos/${REPOSITORY}/git/trees/${supabaseTree}?recursive=1`);
  if (!record(data) || data.sha !== supabaseTree || data.truncated !== false || !Array.isArray(data.tree)) {
    throw new SafeError("GitHub returned an incomplete supabase tree");
  }
  const versions = [];
  const seen = new Set();
  for (const entry of data.tree) {
    if (!record(entry) || typeof entry.path !== "string" || typeof entry.type !== "string" ||
        typeof entry.mode !== "string" || !isSha(entry.sha)) {
      throw new SafeError("GitHub returned invalid supabase tree metadata");
    }
    if (!/^migrations\/[^/]+\.sql$/.test(entry.path)) continue;
    const match = /^migrations\/(\d{14})_[a-z0-9_]+\.sql$/.exec(entry.path);
    if (!match || entry.type !== "blob" || entry.mode !== "100644" || seen.has(match[1])) {
      throw new SafeError("supabase tree has invalid migration metadata");
    }
    seen.add(match[1]);
    versions.push(match[1]);
  }
  if (versions.length === 0) throw new SafeError("supabase tree has no migrations");
  return versions.sort();
}

function validatePull(data, prNumber, currentMain) {
  if (!record(data) || data.number !== prNumber || data.state !== "open" || data.draft !== false ||
      data.base?.ref !== "main" || data.base?.repo?.full_name !== REPOSITORY ||
      data.base?.sha !== currentMain || data.head?.repo?.full_name !== REPOSITORY ||
      !safeBranch(data.head?.ref) || ["main", "staging"].includes(data.head.ref) ||
      !isSha(data.head?.sha) || !isSha(data.merge_commit_sha)) {
    throw new SafeError(`PR #${prNumber} is not an open same-repository PR into current main`);
  }
  return { head: data.head.sha, ref: data.head.ref, merge: data.merge_commit_sha };
}

async function getPull(request, prNumber, currentMain) {
  return validatePull(
    await request(`/repos/${REPOSITORY}/pulls/${prNumber}`), prNumber, currentMain
  );
}

async function requireMainAncestor(request, main, head) {
  const data = await request(`/repos/${REPOSITORY}/compare/${main}...${head}`);
  if (!record(data) || data.status !== "ahead" || data.base_commit?.sha !== main ||
      data.merge_base_commit?.sha !== main || !Number.isSafeInteger(data.ahead_by) || data.ahead_by < 1) {
    throw new SafeError("current main is not an ancestor of the PR head");
  }
}

async function requireSyntheticMerge(request, mainCommit, head, merge) {
  const [headCommit, mergeCommit] = await Promise.all([
    getCommit(request, head), getCommit(request, merge),
  ]);
  if (mergeCommit.parents.length !== 2 || mergeCommit.parents[0] !== mainCommit.sha ||
      mergeCommit.parents[1] !== head || mergeCommit.tree !== headCommit.tree) {
    throw new SafeError("PR merge commit does not exactly combine current main and the selected head");
  }
  return headCommit;
}

function githubActionsApp(value) {
  return record(value) && Number.isSafeInteger(value.id) && value.id > 0 &&
    value.slug === "github-actions";
}

async function requireChecks(request, sha, prNumber, context) {
  const data = await request(
    `/repos/${REPOSITORY}/commits/${sha}/check-runs?filter=latest&per_page=100`
  );
  if (!record(data) || !Number.isSafeInteger(data.total_count) || !Array.isArray(data.check_runs) ||
      data.total_count !== data.check_runs.length) {
    throw new SafeError("GitHub returned an incomplete check-run list");
  }

  for (const expected of REQUIRED_CHECKS) {
    const matches = data.check_runs.filter((run) => run?.name === expected.check);
    if (matches.length !== 1) {
      throw new SafeError(`required check ${expected.check} is missing or ambiguous`);
    }
    const run = matches[0];
    if (!record(run) || run.head_sha !== sha || run.status !== "completed" ||
        run.conclusion !== "success" || !githubActionsApp(run.app) ||
        !Number.isSafeInteger(run.check_suite?.id) || run.check_suite.id < 1 ||
        typeof run.details_url !== "string") {
      throw new SafeError(`required check ${expected.check} did not complete successfully in GitHub Actions`);
    }
    const details = /^https:\/\/github\.com\/vibies-club\/vibies\/actions\/runs\/(\d+)\/job\/\d+$/.exec(
      run.details_url
    );
    if (!details || !Number.isSafeInteger(Number(details[1]))) {
      throw new SafeError(`required check ${expected.check} has an invalid GitHub Actions URL`);
    }
    const suite = await request(`/repos/${REPOSITORY}/check-suites/${run.check_suite.id}`);
    if (!record(suite) || suite.id !== run.check_suite.id || suite.head_sha !== sha ||
        suite.status !== "completed" || suite.conclusion !== "success" ||
        !githubActionsApp(suite.app) || suite.app.id !== run.app.id) {
      throw new SafeError(`required check ${expected.check} has an invalid check-suite origin`);
    }
    const action = await request(`/repos/${REPOSITORY}/actions/runs/${details[1]}`);
    if (!record(action) || action.id !== Number(details[1]) ||
        action.check_suite_id !== run.check_suite.id || action.status !== "completed" ||
        action.conclusion !== "success" || action.head_sha !== sha ||
        action.head_repository?.full_name !== REPOSITORY || action.repository?.full_name !== REPOSITORY ||
        action.name !== expected.workflow || action.path !== expected.path) {
      throw new SafeError(`required check ${expected.check} has invalid workflow-run metadata`);
    }
    if (prNumber === undefined) {
      if (action.event !== "push" || action.head_branch !== "main") {
        throw new SafeError(`required check ${expected.check} is not a main push run`);
      }
    } else {
      if (!record(context) || context.main === undefined || context.ref === undefined) {
        throw new SafeError("missing pull request check context");
      }
      const related = (pulls) => Array.isArray(pulls) && pulls.some((pull) => {
        const baseRepo = pull?.base?.repo;
        const headRepo = pull?.head?.repo;
        return pull?.number === prNumber && pull.base?.ref === "main" &&
          pull.base?.sha === context.main && pull.head?.ref === context.ref &&
          pull.head?.sha === sha && Number.isSafeInteger(baseRepo?.id) && baseRepo.id > 0 &&
          baseRepo.id === headRepo?.id && baseRepo.name === "vibies" && headRepo.name === "vibies" &&
          baseRepo.url === `${API}/repos/${REPOSITORY}` && headRepo.url === `${API}/repos/${REPOSITORY}`;
      });
      if (action.event !== "pull_request" || action.head_branch !== context.ref ||
          !related(action.pull_requests) || !related(suite.pull_requests)) {
        throw new SafeError(`required check ${expected.check} is not for the selected pull request`);
      }
    }
  }
}

async function updateStagingRef(request, sha) {
  await getRef(request, "staging");
  const data = await request(`/repos/${REPOSITORY}/git/refs/heads/staging`, {
    method: "PATCH",
    body: { sha, force: true },
  });
  if (!record(data) || data.ref !== STAGING_REF || data.object?.type !== "commit" ||
      data.object?.sha !== sha) {
    throw new SafeError("GitHub did not confirm the staging ref update");
  }
}

async function readMarker(fetchImpl, origin, expected) {
  const nonce = expected.nonce();
  let response;
  try {
    response = await fetchImpl(`${origin}/staging.json?nonce=${encodeURIComponent(nonce)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ready: false, reason: "the staging request did not complete" };
  }
  if (!response.ok) return { ready: false, reason: `staging returned HTTP ${response.status}` };
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return { ready: false, reason: "staging returned an unexpected content type" };
  }
  let marker;
  try {
    marker = await response.json();
  } catch {
    return { ready: false, reason: "staging returned invalid JSON" };
  }
  if (!record(marker) || Object.keys(marker).sort().join(",") !== "nonce,projectId,ref,sha" ||
      !safeProjectId(marker.projectId) || !isSha(marker.sha) ||
      typeof marker.nonce !== "string" || typeof marker.ref !== "string") {
    throw new SafeError("staging returned an invalid marker schema");
  }
  if (marker.projectId !== expected.projectId || marker.ref !== "staging" || marker.nonce !== nonce) {
    throw new SafeError("staging marker identity did not match this request");
  }
  return marker.sha === expected.sha
    ? { ready: true }
    : { ready: false, reason: "the staging alias still serves a different commit" };
}

async function waitForDeployment({
  fetchImpl, origin, projectId, sha, now, sleep, nonce, timeoutMs,
}) {
  const deadline = now() + timeoutMs;
  let reason = "no staging marker was received";
  while (now() <= deadline) {
    const marker = await readMarker(fetchImpl, origin, { projectId, sha, nonce });
    if (marker.ready) return;
    reason = marker.reason;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
  throw new SafeError(`staging deployment timed out: ${reason}`);
}

async function requireMainUnchanged(request, expected) {
  if (await getRef(request, "main") !== expected) {
    throw new SafeError("main changed during the staging operation");
  }
}

async function recheckPreview(request, prNumber, currentMain, selected) {
  await requireChecks(request, selected.head, prNumber, { main: currentMain, ref: selected.ref });
  await requireMainUnchanged(request, currentMain);
  const pull = await getPull(request, prNumber, currentMain);
  if (pull.head !== selected.head || pull.ref !== selected.ref || pull.merge !== selected.merge) {
    throw new SafeError("PR head or merge commit changed during the staging operation");
  }
}

function receipt({ operation, prNumber, main, head, merge, tree, versions, origin, projectId }) {
  return [
    "## Shared staging receipt",
    "",
    `- Result: success`,
    `- Operation: ${operation}`,
    `- PR: ${prNumber === undefined ? "none" : `#${prNumber}`}`,
    `- Main: \`${main}\``,
    `- Head: \`${head}\``,
    `- PR merge commit: ${merge ? `\`${merge}\`` : "not applicable"}`,
    `- Supabase tree: \`${tree}\``,
    `- Migration versions: ${versions.map((version) => `\`${version}\``).join(", ")}`,
    `- Vercel project: \`${projectId}\``,
    `- URL: ${origin}`,
    "",
    "This receipt records one point in time. A changed head, main commit, or database baseline requires a new receipt.",
    "",
  ].join("\n");
}

export async function runStaging({
  repository,
  workflowSha,
  operation,
  prNumber,
  origin,
  projectId,
  baselineTree,
  githubToken,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  nonce = randomUUID,
  timeoutMs = DEPLOY_TIMEOUT_MS,
  writeSummary = () => {},
}) {
  if (repository !== REPOSITORY) throw new SafeError("unexpected repository");
  if (!isSha(workflowSha)) throw new SafeError("invalid workflow commit SHA");
  if (!["Preview PR", "Clear"].includes(operation)) throw new SafeError("invalid staging operation");
  if (operation === "Preview PR" && (!Number.isSafeInteger(prNumber) || prNumber < 1)) {
    throw new SafeError("Preview PR requires a valid PR number");
  }
  origin = stagingOrigin(origin);
  if (!safeProjectId(projectId)) throw new SafeError("invalid staging project ID");
  if (!isSha(baselineTree)) throw new SafeError("invalid staging Supabase tree");
  if (typeof githubToken !== "string" || githubToken.length === 0) {
    throw new SafeError("GitHub API credential is missing");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > DEPLOY_TIMEOUT_MS) {
    throw new SafeError("invalid deployment timeout");
  }

  const request = api(fetchImpl, githubToken);
  const currentMain = await getRef(request, "main");
  if (currentMain !== workflowSha) {
    throw new SafeError("the workflow commit is not current main");
  }
  const mainCommit = await getCommit(request, currentMain);
  const mainTree = await getSupabaseTree(request, mainCommit.tree);
  if (mainTree !== baselineTree) throw new SafeError("current main does not match the staging Supabase baseline");
  const versions = await getMigrationVersions(request, mainTree);

  let head = currentMain;
  let merge;
  let selected = { head: currentMain };
  if (operation === "Preview PR") {
    selected = await getPull(request, prNumber, currentMain);
    head = selected.head;
    merge = selected.merge;
    await requireMainAncestor(request, currentMain, head);
    const headCommit = await requireSyntheticMerge(request, mainCommit, head, merge);
    const candidateTree = await getSupabaseTree(request, headCommit.tree);
    if (candidateTree !== mainTree || candidateTree !== baselineTree) {
      throw new SafeError("PR, main, and staging Supabase trees do not match");
    }
    await recheckPreview(request, prNumber, currentMain, selected);
  } else {
    await requireChecks(request, currentMain);
    await requireMainUnchanged(request, currentMain);
  }

  await updateStagingRef(request, head);
  await waitForDeployment({ fetchImpl, origin, projectId, sha: head, now, sleep, nonce, timeoutMs });

  if (operation === "Preview PR") await recheckPreview(request, prNumber, currentMain, selected);
  else {
    await requireChecks(request, currentMain);
    await requireMainUnchanged(request, currentMain);
  }
  if (await getRef(request, "staging") !== head) {
    throw new SafeError("staging ref changed before the success receipt");
  }

  const markdown = receipt({ operation, prNumber, main: currentMain, head, merge, tree: mainTree,
    versions, origin, projectId });
  if (operation === "Preview PR") {
    const comment = await request(`/repos/${REPOSITORY}/issues/${prNumber}/comments`, {
      method: "POST", body: { body: markdown },
    });
    if (!record(comment) || !Number.isSafeInteger(comment.id) || comment.id < 1 ||
        comment.body !== markdown ||
        comment.issue_url !== `${API}/repos/${REPOSITORY}/issues/${prNumber}`) {
      throw new SafeError("GitHub did not confirm the pull request receipt");
    }
  }
  writeSummary(markdown);
  return { operation, prNumber, main: currentMain, head, merge, tree: mainTree, versions, origin };
}

async function main() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const writeSummary = (text) => {
    if (summaryPath) appendFileSync(summaryPath, text, "utf8");
  };
  try {
    await runStaging({
      repository: process.env.GITHUB_REPOSITORY,
      workflowSha: process.env.STAGING_WORKFLOW_SHA,
      operation: process.env.STAGING_OPERATION,
      prNumber: process.env.STAGING_OPERATION === "Preview PR" &&
          /^[1-9]\d*$/.test(process.env.STAGING_PR_NUMBER ?? "")
        ? Number(process.env.STAGING_PR_NUMBER) : undefined,
      origin: process.env.STAGING_ORIGIN,
      projectId: process.env.STAGING_PROJECT_ID,
      baselineTree: process.env.STAGING_SUPABASE_TREE,
      githubToken: process.env.GITHUB_TOKEN,
      writeSummary,
    });
  } catch (error) {
    const message = error instanceof SafeError ? error.message : "unexpected internal error";
    writeSummary(`## Shared staging receipt\n\n- Result: failed\n- Reason: ${message}\n`);
    console.error(`Staging operation failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
