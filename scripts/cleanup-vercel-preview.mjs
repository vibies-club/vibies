#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

const EXPECTED_REPOSITORY = "vibies-club/vibies";
const GITHUB_API = "https://api.github.com";
const VERCEL_API = "https://api.vercel.com";
const PAGE_SIZE = 100;
const MAX_OPEN_PR_PAGES = 10;
const REQUEST_TIMEOUT_MS = 10_000;

class SafeError extends Error {}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeBranch(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 250 &&
    /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..") && !value.includes("//");
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function safeKey(value) {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(value);
}

async function request(fetchImpl, provider, url, token, method = "GET", json = true) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: provider === "GitHub" ? {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2026-03-10",
      } : {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SafeError(`${provider} ${method} request did not complete`);
  }

  if (!response.ok) {
    throw new SafeError(`${provider} ${method} request failed with HTTP ${response.status}`);
  }
  if (!json) return undefined;
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new SafeError(`${provider} returned an unexpected content type`);
  }
  try {
    return await response.json();
  } catch {
    throw new SafeError(`${provider} returned invalid JSON`);
  }
}

function validatePull(data, repository, prNumber) {
  if (!record(data) || data.number !== prNumber || data.state !== "closed" ||
      data.merged !== true || typeof data.merged_at !== "string" ||
      data.base?.ref !== "main" || data.base?.repo?.full_name !== repository ||
      data.head?.repo?.full_name !== repository || !safeBranch(data.head?.ref) ||
      data.head.ref === "main") {
    throw new SafeError(`PR #${prNumber} is not a merged same-repository PR into main`);
  }
  return data.head.ref;
}

async function getMergedBranch(fetchImpl, githubToken, repository, prNumber) {
  const data = await request(fetchImpl, "GitHub",
    `${GITHUB_API}/repos/${repository}/pulls/${prNumber}`, githubToken);
  return validatePull(data, repository, prNumber);
}

async function ensureBranchHasNoOpenPull(fetchImpl, githubToken, repository, branch, prNumber) {
  const seen = new Set();
  for (let page = 1; page <= MAX_OPEN_PR_PAGES; page += 1) {
    const url = new URL(`${GITHUB_API}/repos/${repository}/pulls`);
    url.search = new URLSearchParams({ state: "open", per_page: String(PAGE_SIZE), page: String(page) });
    const pulls = await request(fetchImpl, "GitHub", url, githubToken);
    if (!Array.isArray(pulls)) throw new SafeError("GitHub returned an incomplete open-PR list");

    for (const pull of pulls) {
      if (!record(pull) || !Number.isSafeInteger(pull.number) || pull.state !== "open" ||
          !safeBranch(pull.head?.ref) || typeof pull.head?.repo?.full_name !== "string" ||
          seen.has(pull.number)) {
        throw new SafeError("GitHub returned unexpected open-PR metadata");
      }
      seen.add(pull.number);
      if (pull.number !== prNumber && pull.head.ref === branch &&
          pull.head.repo.full_name === repository) {
        throw new SafeError(`branch ${branch} is still used by open PR #${pull.number}`);
      }
    }
    if (pulls.length < PAGE_SIZE) return;
  }
  throw new SafeError(`GitHub open-PR pagination exceeded ${MAX_OPEN_PR_PAGES} pages`);
}

function envRows(data) {
  if (!record(data) || !Array.isArray(data.envs)) {
    throw new SafeError("Vercel returned an incomplete environment list");
  }
  if (data.pagination !== undefined) {
    const page = data.pagination;
    if (!record(page) || page.count !== data.envs.length || page.next !== null || page.prev !== null) {
      throw new SafeError("Vercel returned an incomplete paginated environment list");
    }
  }
  if (data.hiddenProductionEnvCount !== undefined &&
      (!Number.isSafeInteger(data.hiddenProductionEnvCount) || data.hiddenProductionEnvCount < 0)) {
    throw new SafeError("Vercel returned unexpected environment-list metadata");
  }
  return data.envs;
}

function selectCandidates(rows, branch) {
  const seenIds = new Set();
  const seenKeys = new Set();
  const candidates = [];

  for (const row of rows) {
    const validTarget = typeof row?.target === "string"
      ? ["development", "preview", "production"].includes(row.target)
      : Array.isArray(row?.target) && row.target.length > 0 &&
        row.target.every((target) => ["development", "preview", "production"].includes(target));
    if (!record(row) || !safeId(row.id) || !safeKey(row.key) ||
        !validTarget ||
        (row.gitBranch !== undefined && row.gitBranch !== null && !safeBranch(row.gitBranch)) ||
        (row.customEnvironmentIds !== undefined &&
          (!Array.isArray(row.customEnvironmentIds) ||
            row.customEnvironmentIds.some((id) => !safeId(id)))) || seenIds.has(row.id)) {
      throw new SafeError("Vercel returned unexpected environment metadata");
    }
    seenIds.add(row.id);

    const customEnvironmentIds = row.customEnvironmentIds ?? [];
    if (Array.isArray(row.target) && row.target.length === 1 && row.target[0] === "preview" &&
        row.gitBranch === branch && customEnvironmentIds.length === 0) {
      if (seenKeys.has(row.key)) {
        throw new SafeError("Vercel returned duplicate matching environment names");
      }
      seenKeys.add(row.key);
      candidates.push({ id: row.id, key: row.key });
    }
  }
  return candidates.sort((left, right) => left.key.localeCompare(right.key));
}

async function listCandidates(fetchImpl, vercelToken, projectId, teamId, branch) {
  const url = new URL(`${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`);
  url.search = new URLSearchParams({ teamId, gitBranch: branch, decrypt: "false" });
  const data = await request(fetchImpl, "Vercel", url, vercelToken);
  return selectCandidates(envRows(data), branch);
}

function sameCandidates(left, right) {
  return left.length === right.length && left.every((item, index) =>
    item.id === right[index].id && item.key === right[index].key);
}

function stopped(error, deleted) {
  const reason = error instanceof SafeError ? error.message : "cleanup step failed";
  return new SafeError(`${reason}; cleanup stopped after deleting ${deleted.length} setting(s): ${deleted.join(", ") || "none"}; retry is safe`);
}

async function deleteCandidate(fetchImpl, vercelToken, projectId, teamId, candidate) {
  const url = new URL(`${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(candidate.id)}`);
  url.search = new URLSearchParams({ teamId });
  await request(fetchImpl, "Vercel", url, vercelToken, "DELETE", false);
}

export async function cleanupPreviewSettings({
  repository,
  prNumber,
  projectId,
  teamId,
  apply = false,
  githubToken,
  vercelToken,
  fetchImpl = globalThis.fetch,
  log = console.log,
}) {
  if (repository !== EXPECTED_REPOSITORY) throw new SafeError("unexpected repository");
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) throw new SafeError("invalid PR number");
  if (!safeId(projectId) || !projectId.startsWith("prj_")) throw new SafeError("invalid Vercel project ID");
  if (!safeId(teamId) || !teamId.startsWith("team_")) throw new SafeError("invalid Vercel team ID");
  if (typeof githubToken !== "string" || githubToken.length === 0 ||
      typeof vercelToken !== "string" || vercelToken.length === 0) {
    throw new SafeError("required API credential is missing");
  }

  const branch = await getMergedBranch(fetchImpl, githubToken, repository, prNumber);
  await ensureBranchHasNoOpenPull(fetchImpl, githubToken, repository, branch, prNumber);
  const candidates = await listCandidates(fetchImpl, vercelToken, projectId, teamId, branch);
  log(`PR #${prNumber} branch ${branch}: ${candidates.length} matching Preview setting(s).`);
  if (candidates.length > 0) log(`Settings: ${candidates.map(({ key }) => key).join(", ")}`);

  if (!apply) {
    log("Dry run: 0 settings deleted.");
    return { branch, matched: candidates.length, deleted: [] };
  }
  if (candidates.length === 0) {
    log("Apply complete: 0 settings deleted.");
    return { branch, matched: 0, deleted: [] };
  }

  const deleted = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const checkedBranch = await getMergedBranch(fetchImpl, githubToken, repository, prNumber);
      if (checkedBranch !== branch) throw new SafeError("PR branch changed during cleanup");
      await ensureBranchHasNoOpenPull(fetchImpl, githubToken, repository, branch, prNumber);
      const checkedCandidates = await listCandidates(fetchImpl, vercelToken, projectId, teamId, branch);
      if (!sameCandidates(candidates.slice(index), checkedCandidates)) {
        throw new SafeError("Vercel environment metadata changed before deletion");
      }
      await deleteCandidate(fetchImpl, vercelToken, projectId, teamId, candidate);
      deleted.push(candidate.key);
    } catch (error) {
      throw stopped(error, deleted);
    }
  }

  try {
    const remaining = await listCandidates(fetchImpl, vercelToken, projectId, teamId, branch);
    if (remaining.length > 0) throw new SafeError("cleanup verification found matching settings");
  } catch (error) {
    throw stopped(error, deleted);
  }
  log(`Apply complete: ${deleted.length} setting(s) deleted: ${deleted.join(", ")}.`);
  return { branch, matched: candidates.length, deleted };
}

function parseArgs(args) {
  const values = { apply: false };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--apply" && values.apply === false) {
      values.apply = true;
      continue;
    }
    if (!["--repository", "--pr", "--project", "--team"].includes(name) ||
        values[name] !== undefined || args[index + 1] === undefined) {
      throw new SafeError("usage: cleanup-vercel-preview.mjs --repository OWNER/REPO --pr NUMBER --project ID --team ID [--apply]");
    }
    values[name] = args[index + 1];
    index += 1;
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await cleanupPreviewSettings({
    repository: args["--repository"],
    prNumber: Number(args["--pr"]),
    projectId: args["--project"],
    teamId: args["--team"],
    apply: args.apply,
    githubToken: process.env.GITHUB_TOKEN,
    vercelToken: process.env.VERCEL_CLEANUP_TOKEN,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Vercel Preview cleanup failed: ${error instanceof SafeError ? error.message : "unexpected internal error"}`);
    process.exitCode = 1;
  }
}
