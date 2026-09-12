import assert from "node:assert/strict";
import { test } from "node:test";
import { stagingIdentity } from "../lib/staging.ts";
import { GET } from "../app/staging.json/route.ts";

test("only the staging production branch exposes a fresh revision response", async () => {
  const env = {
    VIBIES_STAGING: "true", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "staging",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_PROJECT_ID: "prj_fixture",
  };
  assert.deepEqual(stagingIdentity(env), { sha: env.VERCEL_GIT_COMMIT_SHA, projectId: "prj_fixture", ref: "staging" });
  for (const key of Object.keys(env)) assert.equal(stagingIdentity({ ...env, [key]: "wrong" }), null);
  assert.equal(stagingIdentity({}), null);
  assert.ok(stagingIdentity({ ...env, VERCEL_PROJECT_ID: "prj_fixture-id_2" }));

  // Only these public deployment metadata fields are replaced for the test.
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    const nonce = "b".repeat(32);
    const response = GET(new Request(`https://staging.example/staging.json?nonce=${nonce}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ...stagingIdentity(env), nonce });
    assert.equal(GET(new Request("https://staging.example/staging.json")).status, 400);
    assert.equal(GET(new Request("https://staging.example/staging.json?nonce=<script>")).status, 400);
    delete process.env.VIBIES_STAGING;
    assert.equal(GET(new Request("https://production.example/staging.json")).status, 404);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
