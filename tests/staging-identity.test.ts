import assert from "node:assert/strict";
import { test } from "node:test";
import { stagingIdentity } from "../lib/staging.ts";
import { GET } from "../app/staging.json/route.ts";

test("only validated Cloudflare staging metadata exposes a fresh identity", async () => {
  const env = {
    VIBIES_STAGING:"true", VIBIES_ENVIRONMENT:"staging", VIBIES_STAGING_SHA:"a".repeat(40),
    VIBIES_STAGING_WORKER:"vibies-staging", VIBIES_STAGING_DATABASE_ID:"11111111-1111-4111-8111-111111111111",
    VIBIES_STAGING_VERSION_ID:"22222222-2222-4222-8222-222222222222",
    VIBIES_STAGING_SCHEMA_HASH:"b".repeat(64), VIBIES_STAGING_MIGRATION_HASH:"e".repeat(64), VIBIES_STAGING_ARTIFACT_HASH:"c".repeat(64),
  };
  assert.equal(stagingIdentity(env)?.sha,env.VIBIES_STAGING_SHA);
  assert.equal(stagingIdentity({...env,STAGING_VERSION:{id:env.VIBIES_STAGING_VERSION_ID}})?.versionId,env.VIBIES_STAGING_VERSION_ID);
  for(const key of Object.keys(env)) assert.equal(stagingIdentity({...env,[key]:"wrong"}),null);
  assert.equal(stagingIdentity({}),null);
  const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  try {
    Object.assign(process.env,env);
    const nonce="d".repeat(32);
    const response=GET(new Request(`https://staging.example/staging.json?nonce=${nonce}`));
    assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"no-store");
    assert.deepEqual(await response.json(),{...stagingIdentity(env),nonce});
    assert.equal(GET(new Request("https://staging.example/staging.json")).status,400);
    delete process.env.VIBIES_STAGING;
    assert.equal(GET(new Request("https://production.example/staging.json")).status,404);
  } finally {for(const [key,value] of Object.entries(before)) {if(value===undefined) delete process.env[key]; else process.env[key]=value;}}
});
