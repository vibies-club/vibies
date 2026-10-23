// Trusted main-only deployment code. Candidate artifacts are data, never tooling.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
// Keep this migration tag stable: Wrangler applies it once per Worker.
export const GOOGLE_COORDINATOR_MIGRATIONS = [{ tag: "v1-google-coordinator", new_sqlite_classes: ["GoogleCoordinator"] }];
export const GOOGLE_COORDINATOR_BINDINGS = { bindings: [{ name: "GOOGLE_COORDINATOR", class_name: "GoogleCoordinator" }] };

export async function validateStagingBindings(request, bindings, worker, required = false) {
  if (!Array.isArray(bindings) || bindings.some(binding => !binding || !["plain_text", "d1", "assets", "version_metadata", "durable_object_namespace"].includes(binding.type)))
    throw new Error("staging Worker has secret or unsupported bindings");
  const coordinators = bindings.filter(binding => binding.type === "durable_object_namespace");
  if (coordinators.length > 1 || (required && coordinators.length !== 1)) throw new Error("invalid staging coordinator binding");
  if (!coordinators.length) return;
  const binding = coordinators[0];
  if (binding.name !== "GOOGLE_COORDINATOR" || binding.class_name !== "GoogleCoordinator" ||
      (binding.script_name !== undefined && binding.script_name !== worker) || binding.environment !== undefined ||
      !/^[a-f0-9]{32}$/.test(binding.namespace_id ?? "")) throw new Error("invalid staging coordinator binding");
  // Independently confirm namespace ownership. Fail closed if it cannot be
  // found within the account's first 1000 namespaces.
  const namespaces = await request("/workers/durable_objects/namespaces?per_page=1000&page=1");
  const namespace = Array.isArray(namespaces) && namespaces.find(item => item.id === binding.namespace_id);
  if (!namespace || namespace.script !== worker || namespace.class !== "GoogleCoordinator" || namespace.use_sqlite !== true)
    throw new Error("staging coordinator namespace is not owned by this Worker");
}

export function previewWorker(number) {
  if (!/^[1-9][0-9]{0,8}$/.test(String(number))) throw new Error("invalid PR number");
  return `vibies-pr-${number}`;
}
export function reserveSlots(value = 3) {
  const slots = Number(value);
  if (!Number.isInteger(slots) || slots < 1 || slots > 9) throw new Error("invalid D1 reserve");
  return slots;
}
export function ownedDatabase(worker, name) {
  return typeof name === "string" && new RegExp(`^${worker}-run-[1-9][0-9]*-[1-9][0-9]*$`).test(name);
}
function safeConfig(options) {
  if (!/^[a-f0-9]{32}$/.test(options.accountId ?? "") || !options.cloudflareToken ||
      !/^[1-9][0-9]{0,19}$/.test(options.runId ?? "") || !/^[1-9][0-9]{0,3}$/.test(options.runAttempt ?? ""))
    throw new Error("Cloudflare staging setup is incomplete");
}

export async function deployPreviewArtifact(options) {
  const WORKER = previewWorker(options.prNumber);
  safeConfig(options);
  const fetchImpl = options.cloudflareFetch ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}`;
  async function request(path, { method = "GET", body, allowMissing = false } = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      method, headers: { authorization: `Bearer ${options.cloudflareToken}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Cloudflare ${method} request failed with HTTP ${response.status}`);
    let value;
    try { value = await response.json(); } catch { throw new Error("Cloudflare returned invalid JSON"); }
    if (value?.success !== true || value.errors?.length || value.result === undefined) throw new Error("Cloudflare did not confirm the operation");
    return value.result;
  }
  // A PR Worker must not inherit any OAuth, deployment, or production secrets.
  const priorSettings = await request(`/workers/scripts/${WORKER}/settings`, { allowMissing: true });
  const priorBindings = priorSettings?.bindings ?? [];
  await validateStagingBindings(request, priorBindings, WORKER);
  const priorDb = priorBindings.find(binding => binding.name === "DB" && binding.type === "d1")?.id;
  let priorOwnedDb;
  if (priorDb) {
    if (!uuid(priorDb)) throw new Error("invalid previous staging database");
    const metadata = await request(`/d1/database/${priorDb}`);
    if (!ownedDatabase(WORKER, metadata?.name)) throw new Error("previous database is not an owned synthetic staging database");
    const priorProof = await request(`/d1/database/${priorDb}/query`, { method: "POST", body: { sql: "SELECT source_sha,schema_hash FROM staging_deployment WHERE singleton=1", params: [] } });
    if (!/^[a-f0-9]{40}$/.test(priorProof?.[0]?.results?.[0]?.source_sha ?? "") ||
        !/^[a-f0-9]{64}$/.test(priorProof?.[0]?.results?.[0]?.schema_hash ?? "")) throw new Error("previous database lacks staging ownership proof");
    priorOwnedDb = priorDb;
  }
  const databases = await request("/d1/database?per_page=100&page=1");
  if (!Array.isArray(databases) || databases.length >= 10 - reserveSlots(options.reserveSlots) + (priorOwnedDb ? 1 : 0)) throw new Error("reserved Free D1 capacity reached; preview did not deploy");
  const name = `${WORKER}-run-${options.runId}-${options.runAttempt}`;
  if (databases.some(database => database.name === name)) throw new Error("this staging run already owns a database; inspect before retrying");
  const created = await request("/d1/database", { method: "POST", body: { name } });
  if (!uuid(created?.uuid) || created.name !== name) throw new Error("Cloudflare did not confirm the isolated staging database");
  const databaseId = created.uuid;
  let deploymentAttempted = false;
  try {
  // Only this newly-created synthetic database is ever mutated by this script.
  const query = async sql => {
    const results = await request(`/d1/database/${databaseId}/query`, { method: "POST", body: { sql, params: [] } });
    if (!Array.isArray(results) || results.some(result => result.success !== true)) throw new Error("synthetic D1 query failed");
    return results;
  };
  for (const migration of options.plan.migrations)
    await query(readFileSync(join(options.artifact.root, migration.path.replace(/^d1\//, "")), "utf8"));
  await query(`UPDATE community SET instructor_github_id='900000001',instructor_nickname='Synthetic Instructor',instructor_nickname_key='synthetic instructor' WHERE singleton=1;
    UPDATE deployment_activation SET state='reconciled',environment_id='staging',snapshot_hash='${options.plan.schemaHash}',reconciled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
    UPDATE deployment_activation SET state='active',activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;`);
  const schema = (await query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))[0]?.results;
  if (!Array.isArray(schema) || schema.length === 0) throw new Error("synthetic D1 schema introspection failed");
  const schemaHash = sha256(JSON.stringify(schema));
  // This trusted receipt table is excluded from the application schema digest.
  await query(`CREATE TABLE staging_deployment (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_hash TEXT NOT NULL, migration_hash TEXT NOT NULL, source_sha TEXT NOT NULL);
    INSERT INTO staging_deployment VALUES(1,'${schemaHash}','${options.plan.schemaHash}','${options.plan.head}');`);
  const proof = (await query("SELECT schema_hash,migration_hash,source_sha FROM staging_deployment WHERE singleton=1"))[0]?.results?.[0];
  if (proof?.schema_hash !== schemaHash || proof?.migration_hash !== options.plan.schemaHash || proof?.source_sha !== options.plan.head)
    throw new Error("synthetic D1 schema identity mismatch");

  const directory = mkdtempSync(join(tmpdir(), "vibies-preview-deploy-"));
  const marker = { sha: options.plan.head, worker: WORKER, databaseId, schemaHash, migrationHash: options.plan.schemaHash, artifactHash: options.artifact.artifactHash };
  let versionId;
  try {
    cpSync(join(options.artifact.root, "server"), join(directory, "server"), { recursive: true, dereference: false });
    cpSync(join(options.artifact.root, "client"), join(directory, "client"), { recursive: true, dereference: false });
    // The identity path is served by trusted code rather than candidate app code.
    writeFileSync(join(directory, "staging-entry.js"), `import application from './server/index.js';\nexport { GoogleCoordinator } from './server/index.js';\nexport default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/staging.json'){const nonce=url.searchParams.get('nonce');const headers={'Cache-Control':'no-store'};if(!nonce||!/^[a-f0-9-]{16,64}$/.test(nonce))return new Response(null,{status:400,headers});return Response.json({...${JSON.stringify(marker)},versionId:env.STAGING_VERSION.id,environment:'staging',nonce},{headers});}return application.fetch(request,env,ctx);}};\n`);
    const config = {
      name: WORKER, main: "staging-entry.js", compatibility_date: "2026-10-15", compatibility_flags: ["nodejs_compat"],
      no_bundle: true, find_additional_modules: true, rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }, { type: "CompiledWasm", globs: ["**/*.wasm"] }],
      workers_dev: true, preview_urls: false,
      assets: { directory: "./client", binding: "ASSETS", html_handling: "none", not_found_handling: "none", run_worker_first: ["/api/*", "/auth/*", "/projects/action", "/admin/members/action", "/staging.json"] },
      d1_databases: [{ binding: "DB", database_name: name, database_id: databaseId }],
      durable_objects: GOOGLE_COORDINATOR_BINDINGS, migrations: GOOGLE_COORDINATOR_MIGRATIONS,
      version_metadata: { binding: "STAGING_VERSION" },
      vars: { VIBIES_DATABASE_BACKEND: "d1", VIBIES_ENVIRONMENT: "staging", VIBIES_STAGING: "true", VIBIES_APP_ORIGIN: options.origin,
        VIBIES_STAGING_SHA: marker.sha, VIBIES_STAGING_WORKER: WORKER, VIBIES_STAGING_DATABASE_ID: databaseId,
        VIBIES_STAGING_SCHEMA_HASH: marker.schemaHash, VIBIES_STAGING_MIGRATION_HASH: marker.migrationHash, VIBIES_STAGING_ARTIFACT_HASH: marker.artifactHash },
    };
    const path = join(directory, "wrangler.json");
    writeFileSync(path, JSON.stringify(config));
    const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
    const execute = options.execute ?? execFileSync;
    // No package scripts, candidate configuration, bundler plugins, dotenv files or
    // inherited NODE_OPTIONS execute in the credential-bearing deployment process.
    deploymentAttempted = true;
    execute(process.execPath, [cli, "deploy", "--config", path, "--message", `staging ${marker.sha} artifact ${marker.artifactHash}`], {
      cwd: directory, stdio: ["ignore", "pipe", "pipe"], timeout: 180_000,
      env: { PATH: process.env.PATH, HOME: directory, CI: "true", CLOUDFLARE_ACCOUNT_ID: options.accountId,
        CLOUDFLARE_API_TOKEN: options.cloudflareToken, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: join(directory, "wrangler.log") },
    });
    const deployments = await request(`/workers/scripts/${WORKER}/deployments`);
    const current = deployments?.deployments?.[0];
    if (!Array.isArray(current?.versions) || current.versions.length !== 1 || current.versions[0].percentage !== 100 ||
        !uuid(current.versions[0].version_id)) throw new Error("Cloudflare did not confirm a complete staging deployment");
    versionId = current.versions[0].version_id;
  } finally { rmSync(directory, { recursive: true, force: true }); }

  const verify = async () => {
    const [deployments, settings] = await Promise.all([
      request(`/workers/scripts/${WORKER}/deployments`), request(`/workers/scripts/${WORKER}/settings`),
    ]);
    await validateStagingBindings(request, settings?.bindings, WORKER, true);
    const versions = deployments?.deployments?.[0]?.versions;
    if (versions?.length !== 1 || versions[0].version_id !== versionId || versions[0].percentage !== 100 ||
      settings.bindings.filter(binding => binding.type === "d1").length !== 1 ||
      settings.bindings.find(binding => binding.name === "DB" && binding.type === "d1")?.id !== databaseId ||
      settings.bindings.find(binding => binding.name === "VIBIES_STAGING_SHA" && binding.type === "plain_text")?.text !== marker.sha ||
      settings.bindings.find(binding => binding.name === "VIBIES_STAGING_ARTIFACT_HASH" && binding.type === "plain_text")?.text !== marker.artifactHash)
      throw new Error("staging deployment version or binding changed");
  };
  await verify();
  return { ...marker, versionId, verify,
    cleanup: async () => { if (priorOwnedDb && priorOwnedDb !== databaseId) await request(`/d1/database/${priorOwnedDb}`, { method: "DELETE" }); } };
  } catch (error) {
    // A failed/ambiguous deployment may already serve this database. Preserve it
    // for diagnosis; before deployment begins the new empty fixture is safe to remove.
    if (!deploymentAttempted) await request(`/d1/database/${databaseId}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
