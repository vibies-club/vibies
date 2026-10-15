#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inspectArtifact } from './staging-cloudflare.mjs';
import { deployPreviewArtifact, previewWorker, ownedDatabase } from './preview-cloudflare-deploy.mjs';

export const REPOSITORY = 'vibies-club/vibies';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => /^[1-9][0-9]*$/.test(String(value));
export function validatePull(pull, number, expectedHead, closed = false) {
  previewWorker(number);
  if (pull?.number !== Number(number) || pull.state !== (closed ? 'closed' : 'open') ||
      pull.base?.ref !== 'main' || pull.base?.repo?.full_name !== REPOSITORY ||
      pull.head?.repo?.full_name !== REPOSITORY || !sha(pull.head?.sha) ||
      !sha(pull.base?.sha) || (expectedHead && pull.head.sha !== expectedHead))
    throw new Error('PR source is closed, changed, or outside the same repository');
  return pull;
}
export function validateArtifact(metadata, options) {
  if (!id(options.artifactId) || !id(options.runId) || !hash(options.artifactDigest) ||
      metadata?.id !== Number(options.artifactId) || metadata.expired !== false ||
      metadata.name !== `preview-build-${options.runId}-${options.runAttempt}` ||
      metadata.digest !== `sha256:${options.artifactDigest}` ||
      metadata.workflow_run?.id !== Number(options.runId) ||
      metadata.workflow_run?.head_sha !== options.trustedSha ||
      metadata.workflow_run?.repository_id !== Number(options.repositoryId) ||
      metadata.workflow_run?.head_repository_id !== Number(options.repositoryId))
    throw new Error('preview artifact does not belong to this trusted workflow run');
}
export function validateRun(run, options) {
  if (run?.id !== Number(options.runId) || run.repository?.full_name !== REPOSITORY ||
      run.head_repository?.full_name !== REPOSITORY || run.head_sha !== options.trustedSha ||
      run.path !== '.github/workflows/preview.yml' ||
      !['pull_request_target', 'workflow_dispatch'].includes(run.event))
    throw new Error('preview workflow provenance mismatch');
}
export function githubApi(token, fetchImpl = fetch) {
  return async (path, { method = 'GET', body } = {}) => {
    const response = await fetchImpl(`https://api.github.com/repos/${REPOSITORY}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub metadata failed (${response.status})`);
    return response.json();
  };
}
export async function selectPreview(request, number, expectedHead) {
  const pull = validatePull(await request(`/pulls/${number}`), number, expectedHead);
  const tree = await request(`/git/trees/${pull.head.sha}?recursive=1`);
  if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('incomplete source tree');
  const migrations = tree.tree.filter(file => file.path.startsWith('d1/migrations/') && file.type !== 'tree').map(file => {
    if (!/^d1\/migrations\/[0-9]{4}_[a-z0-9_]+\.sql$/.test(file.path) || file.mode !== '100644' || file.type !== 'blob' || !sha(file.sha))
      throw new Error('invalid preview migration source');
    return { path: file.path, blob: file.sha };
  }).sort((a,b) => a.path.localeCompare(b.path));
  if (!migrations.length || new Set(migrations.map(file => file.path.slice(14,18))).size !== migrations.length)
    throw new Error('missing or duplicate preview migrations');
  return { head: pull.head.sha, migrations, schemaHash: createHash('sha256').update(JSON.stringify(migrations)).digest('hex') };
}
export async function publishPreview(request, options, origin) {
  // Recheck the live head immediately before making the verified URL visible.
  validatePull(await request(`/pulls/${options.prNumber}`), options.prNumber, options.head);
  const worker = previewWorker(options.prNumber);
  if (!sha(options.head) || !/^[a-z0-9-]+$/.test(options.subdomain ?? '') ||
      origin !== `https://${worker}.${options.subdomain}.workers.dev`)
    throw new Error('invalid verified preview URL');
  const comment = await request(`/issues/${options.prNumber}/comments`, {
    method: 'POST',
    body: { body: `Synthetic Cloudflare preview: [Open preview](${origin})\n\nVerified source: \`${options.head}\`. This preview has its own synthetic database; live sign-in is unavailable.` },
  });
  if (!Number.isSafeInteger(comment?.id) || comment.id < 1) throw new Error('preview comment not confirmed');
}

export async function deployPreview(options) {
  const request = options.request ?? githubApi(options.githubToken);
  validateRun(await request(`/actions/runs/${options.runId}`), options);
  validateArtifact(await request(`/actions/artifacts/${options.artifactId}`), options);
  const plan = await selectPreview(request, options.prNumber, options.head);
  const artifact = inspectArtifact(options.directory, plan);
  const worker = previewWorker(options.prNumber);
  if (!/^[a-z0-9-]+$/.test(options.subdomain ?? '')) throw new Error('invalid workers.dev subdomain');
  const origin = `https://${worker}.${options.subdomain}.workers.dev`;
  const deployment = await (options.deploy ?? deployPreviewArtifact)({ ...options, origin, plan, artifact });
  // Candidate application responses are not trusted as receipts. This route is
  // implemented by the trusted wrapper; control-plane bindings are checked too.
  await deployment.verify();
  let verified = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await (options.probe ?? fetch)(`${origin}/staging.json?nonce=${createHash('sha256').update(`${options.runId}:${options.runAttempt}:${attempt}`).digest('hex')}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      const receipt = response.ok ? await response.json() : null;
      verified = !!receipt && ['sha', 'worker', 'databaseId', 'schemaHash', 'migrationHash', 'artifactHash', 'versionId'].every(field => receipt[field] === deployment[field]);
      if (verified) break;
    } catch { /* A fresh workers.dev deployment may still be propagating. */ }
    if (attempt < 11) await (options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(2_000);
  }
  if (!verified) throw new Error('preview identity probe failed; resources preserved');
  await deployment.verify();
  // A superseded or closed PR must not be advertised as current.
  validatePull(await request(`/pulls/${options.prNumber}`), options.prNumber, options.head);
  await deployment.cleanup();
  await publishPreview(request, options, origin);
  return origin;
}

export async function cleanupPreview(options) {
  const request = options.request ?? githubApi(options.githubToken);
  validatePull(await request(`/pulls/${options.prNumber}`), options.prNumber, undefined, true);
  const worker = previewWorker(options.prNumber);
  if (!/^[a-f0-9]{32}$/.test(options.accountId ?? '') || !options.cloudflareToken) throw new Error('missing Cloudflare configuration');
  const cf = async (path, method = 'GET', body) => {
    const response = await (options.cloudflareFetch ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${options.accountId}${path}`, {
      method, headers: { authorization: `Bearer ${options.cloudflareToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (method === 'GET' && response.status === 404) return null;
    if (!response.ok) throw new Error('preview cleanup request failed; resources preserved');
    const value = await response.json();
    if (!value.success) throw new Error('preview cleanup not confirmed; resources preserved');
    return value.result;
  };
  const settings = await cf(`/workers/scripts/${worker}/settings`);
  if (!settings) return;
  if (!Array.isArray(settings.bindings) || settings.bindings.some(binding => !['plain_text','d1','assets','version_metadata'].includes(binding.type)))
    throw new Error('preview cleanup encountered unexpected bindings');
  const databases = settings.bindings.filter(binding => binding.type === 'd1');
  const database = databases[0]?.id;
  if (databases.length !== 1 || databases[0].name !== 'DB' || !/^[a-f0-9-]{36}$/.test(database ?? '')) throw new Error('invalid preview database binding');
  const metadata = await cf(`/d1/database/${database}`);
  if (!ownedDatabase(worker, metadata?.name)) throw new Error('refusing to delete unowned database');
  const proof = await cf(`/d1/database/${database}/query`, 'POST', { sql: 'SELECT source_sha,schema_hash FROM staging_deployment WHERE singleton=1', params: [] });
  if (!sha(proof?.[0]?.results?.[0]?.source_sha) || !hash(proof?.[0]?.results?.[0]?.schema_hash)) throw new Error('missing preview database ownership receipt');
  // Delete runtime first. Any ambiguous error aborts before touching its data.
  await cf(`/workers/scripts/${worker}`, 'DELETE');
  if (await cf(`/workers/scripts/${worker}/settings`)) throw new Error('preview deletion not confirmed');
  await cf(`/d1/database/${database}`, 'DELETE');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = { prNumber: process.env.PREVIEW_PR_NUMBER, head: process.env.PREVIEW_HEAD,
    githubToken: process.env.GITHUB_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareToken: process.env.CLOUDFLARE_API_TOKEN, runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT, trustedSha: process.env.GITHUB_SHA,
    repositoryId: process.env.GITHUB_REPOSITORY_ID, artifactId: process.env.PREVIEW_ARTIFACT_ID,
    artifactDigest: process.env.PREVIEW_ARTIFACT_DIGEST, directory: process.env.PREVIEW_ARTIFACT_DIRECTORY,
    subdomain: process.env.CLOUDFLARE_WORKERS_SUBDOMAIN, reserveSlots: process.env.PREVIEW_D1_RESERVED_SLOTS || 3 };
  try {
    if (process.env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error('wrong repository');
    if (process.argv[2] === 'select') {
      const plan = await selectPreview(githubApi(options.githubToken), options.prNumber, options.head);
      appendFileSync(process.env.GITHUB_OUTPUT, `head=${plan.head}\n`);
    } else if (process.argv[2] === 'deploy') {
      const origin = await deployPreview(options);
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `PR #${options.prNumber}: [synthetic preview](${origin}) at ${options.head}\n`);
    } else if (process.argv[2] === 'cleanup') await cleanupPreview(options);
    else throw new Error('unknown preview operation');
  } catch (error) {
    // Do not log response bodies or arbitrary provider errors containing secrets.
    console.error('Preview operation failed. Resources may be preserved for operator inspection.');
    process.exitCode = 1;
  }
}
