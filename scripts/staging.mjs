#!/usr/bin/env node

import { randomUUID, createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { deployStagingArtifact, inspectArtifact } from "./staging-cloudflare.mjs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPOSITORY = "vibies-club/vibies";
const API = "https://api.github.com";
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

async function getMigrations(request, rootTree) {
  const data = await request(`/repos/${REPOSITORY}/git/trees/${rootTree}?recursive=1`);
  if (!record(data) || data.sha !== rootTree || data.truncated !== false || !Array.isArray(data.tree))
    throw new SafeError("GitHub returned an incomplete migration tree");
  const migrations = data.tree.filter(entry => entry?.path?.startsWith("d1/migrations/"));
  const files = migrations.filter(entry => entry.type !== "tree").map(entry => {
    if (!/^d1\/migrations\/[0-9]{4}_[a-z0-9_]+\.sql$/.test(entry.path) || entry.type !== "blob" ||
        entry.mode !== "100644" || !isSha(entry.sha)) throw new SafeError("invalid D1 migration metadata");
    return { path: entry.path, blob: entry.sha };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (files.length === 0 || new Set(files.map(file => file.path.slice(14, 18))).size !== files.length)
    throw new SafeError("missing or duplicate D1 migration versions");
  return files;
}

export function requireMigrationAncestry(base, candidate) {
  if (base.length > candidate.length || base.some((file, index) =>
    file.path !== candidate[index]?.path || file.blob !== candidate[index]?.blob))
    throw new SafeError("D1 migrations must retain main's unchanged ordered prefix");
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

function commonOptions(options) {
  if (options.repository !== REPOSITORY) throw new SafeError("unexpected repository");
  if (options.actor?.toLowerCase() !== "0xinbeta") throw new SafeError("only the Instructor may operate staging");
  if (!isSha(options.workflowSha)) throw new SafeError("invalid workflow commit SHA");
  if (!["Preview PR", "Clear"].includes(options.operation)) throw new SafeError("invalid staging operation");
  if (options.operation === "Preview PR" && (!Number.isSafeInteger(options.prNumber) || options.prNumber < 1))
    throw new SafeError("Preview PR requires a valid PR number");
  if (typeof options.githubToken !== "string" || !options.githubToken) throw new SafeError("GitHub API credential is missing");
}

export async function prepareStaging(options) {
  commonOptions(options);
  const request = api(options.fetchImpl ?? fetch, options.githubToken);
  const main = await getRef(request, "main");
  if (main !== options.workflowSha) throw new SafeError("the workflow commit is not current main");
  const mainCommit = await getCommit(request, main);
  const baseMigrations = await getMigrations(request, mainCommit.tree);
  let head = main, selected, commit = mainCommit;
  if (options.operation === "Preview PR") {
    selected = await getPull(request, options.prNumber, main);
    head = selected.head;
    await requireMainAncestor(request, main, head);
    commit = await requireSyntheticMerge(request, mainCommit, head, selected.merge);
    await requireChecks(request, head, options.prNumber, { main, ref: selected.ref });
  } else await requireChecks(request, main);
  const migrations = await getMigrations(request, commit.tree);
  requireMigrationAncestry(baseMigrations, migrations);
  if (await getRef(request, "main") !== main) throw new SafeError("main changed during staging selection");
  if (selected) {
    const current = await getPull(request, options.prNumber, main);
    if (JSON.stringify(current) !== JSON.stringify(selected)) throw new SafeError("PR head or merge commit changed during staging selection");
  }
  return {
    format: 1, operation: options.operation, prNumber: options.operation === "Preview PR" ? options.prNumber : null,
    main, head, merge: selected?.merge ?? null, migrations,
    schemaHash: createHash("sha256").update(JSON.stringify(migrations)).digest("hex"),
  };
}

async function waitForMarker({ fetchImpl, origin, expected, now, sleep, nonce, timeoutMs }) {
  const deadline = now() + timeoutMs;
  let reason = "no staging identity received";
  do {
    const challenge = nonce();
    let response;
    try {
      response = await fetchImpl(`${origin}/staging.json?nonce=${encodeURIComponent(challenge)}`, {
        method: "GET", headers: { accept: "application/json" }, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch { reason = "staging request did not complete"; }
    if (response?.ok) {
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
        throw new SafeError("staging identity has an unexpected content type");
      let marker;
      try { marker = await response.json(); } catch { throw new SafeError("staging returned invalid JSON"); }
      const wanted = { ...expected, environment: "staging", nonce: challenge };
      if (!record(marker) || JSON.stringify(Object.keys(marker).sort()) !== JSON.stringify(Object.keys(wanted).sort()) ||
          Object.entries(wanted).some(([key, value]) => marker[key] !== value))
        throw new SafeError("staging server identity does not match the deployed artifact, version and database");
      if (!/no-store/i.test(response.headers.get("cache-control") ?? ""))
        throw new SafeError("staging identity is cacheable");
      return;
    }
    if (response) reason = `staging returned HTTP ${response.status}`;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  } while (now() <= deadline);
  throw new SafeError(`staging deployment timed out: ${reason}`);
}

export async function runStaging(options) {
  const origin = stagingOrigin(options.origin);
  const timeoutMs = options.timeoutMs ?? DEPLOY_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > DEPLOY_TIMEOUT_MS)
    throw new SafeError("invalid deployment timeout");
  const selected = await prepareStaging(options);
  if (JSON.stringify(options.plan) !== JSON.stringify(selected)) throw new SafeError("staging selection changed after the build");
  const inspect = options.inspect ?? inspectArtifact;
  const artifactId = String(options.artifactId ?? "");
  const digest = options.artifactDigest;
  if (!/^[1-9][0-9]*$/.test(artifactId) || !/^[a-f0-9]{64}$/.test(digest ?? "") || !/^[1-9][0-9]*$/.test(options.runId ?? ""))
    throw new SafeError("missing build artifact provenance");
  const uploaded = await api(options.fetchImpl ?? fetch, options.githubToken)(`/repos/${REPOSITORY}/actions/artifacts/${artifactId}`);
  if (!record(uploaded) || String(uploaded.id) !== artifactId || uploaded.expired !== false ||
      uploaded.name !== `staging-build-${options.runId}-${options.runAttempt}` || uploaded.digest !== `sha256:${digest}` ||
      String(uploaded.workflow_run?.id) !== options.runId || uploaded.workflow_run?.head_sha !== selected.main ||
      uploaded.workflow_run?.head_branch !== "main" || !Number.isSafeInteger(uploaded.workflow_run?.repository_id) ||
      uploaded.workflow_run.repository_id !== uploaded.workflow_run.head_repository_id)
    throw new SafeError("build artifact does not belong to this trusted workflow run");
  const artifact = await inspect(options.artifactDirectory, selected);
  const deployed = await (options.deploy ?? deployStagingArtifact)({ ...options, plan: selected, artifact });
  if (!record(deployed) || deployed.worker !== "vibies-staging" ||
      !/^[0-9a-f-]{36}$/.test(deployed.versionId ?? "") || !/^[0-9a-f-]{36}$/.test(deployed.databaseId ?? "") ||
      deployed.artifactHash !== artifact.artifactHash || !/^[a-f0-9]{64}$/.test(deployed.schemaHash ?? "") || deployed.migrationHash !== selected.schemaHash)
    throw new SafeError("deployment provider did not confirm the expected artifact");
  const expected = { sha: selected.head, worker: deployed.worker, versionId: deployed.versionId,
    databaseId: deployed.databaseId, schemaHash: deployed.schemaHash, migrationHash: deployed.migrationHash, artifactHash: deployed.artifactHash };
  await waitForMarker({ fetchImpl: options.fetchImpl ?? fetch, origin, expected,
    now: options.now ?? Date.now, sleep: options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
    nonce: options.nonce ?? randomUUID, timeoutMs });
  if (JSON.stringify(await prepareStaging(options)) !== JSON.stringify(selected))
    throw new SafeError("main or PR changed before the success receipt");
  await deployed.verify?.();
  await deployed.cleanup?.();
  const markdown = ["## Shared staging receipt", "", "- Result: success", `- Operation: ${selected.operation}`,
    `- PR: ${selected.prNumber ? `#${selected.prNumber}` : "none"}`, `- Main: \`${selected.main}\``,
    `- Head: \`${selected.head}\``, `- Worker: \`${deployed.worker}\``, `- Worker version: \`${deployed.versionId}\``,
    `- Synthetic D1: \`${deployed.databaseId}\``, `- Schema SHA-256: \`${deployed.schemaHash}\``, `- Migration SHA-256: \`${selected.schemaHash}\``,
    `- Artifact SHA-256: \`${artifact.artifactHash}\``, `- URL: ${origin}`, "",
    "This receipt records one verified deployment. A changed head, main, artifact, Worker version or database requires a new receipt.", ""].join("\n");
  if (selected.prNumber) {
    const comment = await api(options.fetchImpl ?? fetch, options.githubToken)(`/repos/${REPOSITORY}/issues/${selected.prNumber}/comments`, {
      method: "POST", body: { body: markdown },
    });
    if (!record(comment) || !Number.isSafeInteger(comment.id) || comment.id < 1 || comment.body !== markdown ||
      comment.issue_url !== `${API}/repos/${REPOSITORY}/issues/${selected.prNumber}`)
      throw new SafeError("GitHub did not confirm the pull request receipt");
  }
  options.writeSummary?.(markdown);
  return { ...selected, ...deployed, origin };
}

async function main() {
  const env = process.env;
  const options = {
    repository: env.GITHUB_REPOSITORY, actor: env.GITHUB_ACTOR, workflowSha: env.STAGING_WORKFLOW_SHA,
    operation: env.STAGING_OPERATION,
    prNumber: /^[1-9]\d*$/.test(env.STAGING_PR_NUMBER ?? "") ? Number(env.STAGING_PR_NUMBER) : undefined,
    githubToken: env.GITHUB_TOKEN, origin: env.STAGING_ORIGIN,
    artifactDirectory: env.STAGING_ARTIFACT_DIRECTORY, accountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareToken: env.CLOUDFLARE_API_TOKEN, artifactId: env.STAGING_ARTIFACT_ID, artifactDigest: env.STAGING_ARTIFACT_DIGEST, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    writeSummary: text => { if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text); },
  };
  try {
    if (process.argv[2] === "select") {
      const plan = await prepareStaging(options);
      writeFileSync(env.STAGING_PLAN_PATH, JSON.stringify(plan));
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `head=${plan.head}\n`);
    } else if (process.argv[2] === "deploy") {
      await runStaging({ ...options, plan: JSON.parse(readFileSync(env.STAGING_PLAN_PATH, "utf8")) });
    } else throw new SafeError("select or deploy phase is required");
  } catch (error) {
    // Never print provider bodies, command output, credentials or candidate code.
    const message = error instanceof SafeError ? error.message : "deployment setup or verification failed; no success receipt issued";
    options.writeSummary(`## Shared staging receipt\n\n- Result: failed\n- Reason: ${message}\n`);
    console.error(`Staging operation failed: ${message}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
