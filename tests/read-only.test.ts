import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertOperationWritable, assertWritable, isReadOnly, ReadOnlyError, readOnlyResponse } from "../lib/read-only.ts";
import { access_state, type AccessDatabase } from "../lib/d1/access.ts";
import { beginGoogleLink, cancelGoogleLink, finishGoogleSignIn } from "../lib/google-auth/store.ts";
import { createGoogleRoutes } from "../lib/google-auth/http.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("cutover blocks every named mutation and unknown future operations while retaining reads", () => {
  const previous = process.env.VIBIES_READ_ONLY;
  process.env.VIBIES_READ_ONLY = "1";
  try {
    assert.equal(isReadOnly(), true);
    const domain = source("lib/domain.ts");
    const names = [...domain.split("type Arguments = {")[1].split("};")[0].matchAll(/^  (\w+):/gm)].map((m) => m[1]);
    const reads = ["access_state", "members", "project_actor", "project_operation_context", "projects", "project"];
    assert.ok(names.length >= 22);
    for (const name of names) {
      if (reads.includes(name)) assert.doesNotThrow(() => assertOperationWritable(name));
      else assert.throws(() => assertOperationWritable(name), ReadOnlyError);
    }
    assert.throws(() => assertOperationWritable("future_write"), ReadOnlyError);
    assert.ok(domain.indexOf("assertOperationWritable(name)") < domain.indexOf("if (usesD1())"));
    assert.match(domain, /isReadOnly\(\) && name === "access_state"/);
    assert.match(domain, /vibies_private\.access_state_read_only\(\$1\)/);
    const helper = source("scripts/read-only-access.sql");
    assert.doesNotMatch(helper, /\b(delete from|update|insert into)\b/i);
    assert.match(helper, /created_at > clock_timestamp\(\) - interval '24 hours'/);
    assert.match(helper, /grant execute.*to vibies_runtime/);
  } finally { if (previous === undefined) delete process.env.VIBIES_READ_ONLY; else process.env.VIBIES_READ_ONLY = previous; }
});

test("read-only access checks do not delete expired session rows", async () => {
  const previous = process.env.VIBIES_READ_ONLY; process.env.VIBIES_READ_ONLY = "1";
  try {
    let statements = 0;
    const db = {
      prepare(sql: string) {
        assert.match(sql.trim(), /^SELECT/); assert.match(sql, /julianday\(s.created_at\).*'-24 hours'/);
        statements++;
        return { bind() { return this; } };
      },
      async batch() { return [{success:true, results:[]}]; },
    } as unknown as AccessDatabase;
    assert.deepEqual(await access_state(db, "a".repeat(64)), {kind:"signed_out"});
    assert.equal(statements, 1);
  } finally { if (previous === undefined) delete process.env.VIBIES_READ_ONLY; else process.env.VIBIES_READ_ONLY = previous; }
});

test("Google direct helpers and HTTP entrypoints reject before any database or provider access", async () => {
  const previous = process.env.VIBIES_READ_ONLY; process.env.VIBIES_READ_ONLY = "1";
  try {
    const db = new Proxy({}, {get() { throw new Error("Database must not be reached"); }}) as AccessDatabase;
    await assert.rejects(beginGoogleLink(db,"a".repeat(64),"b".repeat(64)), ReadOnlyError);
    await assert.rejects(finishGoogleSignIn(db,"a".repeat(64),"b".repeat(64),"token"), ReadOnlyError);
    await assert.rejects(cancelGoogleLink(db,"a".repeat(64)), ReadOnlyError);
    const routes = createGoogleRoutes({store:db,database:db as never,origin:"https://vibies.test",secret:"synthetic",clientId:"synthetic",clientSecret:"synthetic",sessionCookie:"session",browserCookie:"browser"});
    for (const route of [routes.start,routes.link]) {
      const response = await route(new Request("https://vibies.test/auth/google/start",{method:"POST",headers:{origin:"https://vibies.test","content-type":"application/x-www-form-urlencoded"}}));
      assert.equal(response.status,503); assert.equal(response.headers.get("retry-after"),"300");
    }
    assert.equal((await routes.callback(new Request("https://vibies.test/auth/google/provider/callback/google"))).status,503);
  } finally { if (previous === undefined) delete process.env.VIBIES_READ_ONLY; else process.env.VIBIES_READ_ONLY = previous; }
});

test("HTTP mutations guard early and sign-out clears only browser cookies during cutover", async () => {
  for (const file of ["app/auth/start/route.ts","app/auth/callback/route.ts","app/projects/action/route.ts","app/admin/members/action/route.ts","lib/google-auth/server.ts"]) {
    const text = source(file); assert.match(text,/if \(isReadOnly\(\)\) return readOnlyResponse\(\)/,file);
  }
  assert.match(source("app/auth/sign-out/route.ts"), /if \(isReadOnly\(\)\) \{[\s\S]*?clearGoogleCookies[\s\S]*?return response;/);
  const response = readOnlyResponse(); assert.equal(response.status,503); assert.equal(response.headers.get("cache-control"),"no-store");
  assert.match(await response.text(), /You can still browse/);
});

test("normal mode retains writes", () => {
  const previous = process.env.VIBIES_READ_ONLY; delete process.env.VIBIES_READ_ONLY;
  try { assert.doesNotThrow(assertWritable); assert.doesNotThrow(() => assertOperationWritable("change_member")); }
  finally { if (previous !== undefined) process.env.VIBIES_READ_ONLY = previous; }
});
