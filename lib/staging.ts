/** Public identity only. The trusted deployment wrapper supplies the Worker
 * version metadata binding and handles /staging.json before candidate code. */
export function stagingIdentity(env: Record<string, unknown> = process.env) {
  const sha = env.VIBIES_STAGING_SHA;
  const worker = env.VIBIES_STAGING_WORKER;
  const databaseId = env.VIBIES_STAGING_DATABASE_ID;
  const schemaHash = env.VIBIES_STAGING_SCHEMA_HASH;
  const migrationHash = env.VIBIES_STAGING_MIGRATION_HASH;
  const artifactHash = env.VIBIES_STAGING_ARTIFACT_HASH;
  const metadata = env.STAGING_VERSION;
  const versionId = metadata && typeof metadata === "object" && "id" in metadata
    ? metadata.id : env.VIBIES_STAGING_VERSION_ID;
  const uuid = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
  const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (env.VIBIES_STAGING !== "true" || env.VIBIES_ENVIRONMENT !== "staging" ||
    typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha) || worker !== "vibies-staging" ||
    !uuid(versionId) || !uuid(databaseId) || !hash(schemaHash) || !hash(migrationHash) || !hash(artifactHash)) return null;
  return { sha, worker, versionId, databaseId, schemaHash, migrationHash, artifactHash, environment: "staging" };
}
