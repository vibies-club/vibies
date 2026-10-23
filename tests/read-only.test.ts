import assert from "node:assert/strict";
import { test } from "node:test";
import { assertOperationWritable, assertWritable, isReadOnly, ReadOnlyError, readOnlyResponse } from "../lib/read-only.ts";
import { access_state, type AccessDatabase } from "../lib/d1/access.ts";
import { beginGoogleLink, cancelGoogleLink, finishGoogleSignIn } from "../lib/google-auth/store.ts";
import { createGoogleRoutes } from "../lib/google-auth/http.ts";

test("cutover blocks every named mutation and unknown future operations while retaining reads", () => {
  const previous = process.env.VIBIES_READ_ONLY;
  process.env.VIBIES_READ_ONLY = "1";
  try {
    assert.equal(isReadOnly(), true);
    const reads = ["access_state", "members", "project_actor", "project_operation_context", "projects", "project", "collab_board", "collab_job", "collab_team", "ideas_feed", "idea_page", "project_funding"];
    const writes = ["change_member", "begin_sign_in", "consume_sign_in", "finish_sign_in", "end_session", "connect_project",
      "add_project_milestone", "edit_project_milestone", "set_project_milestone_completion", "move_project_milestone",
      "delete_project_milestone", "moderate_project", "edit_project", "delete_project", "record_project_connection", "publish_project",
      "job_post", "job_claim", "job_deliver", "job_accept", "job_paid", "job_resolve", "team_invite", "agreement_propose", "agreement_respond", "idea_post", "idea_interest", "comment_post", "funding_set", "pledge_post", "pledge_close"];
    for (const name of reads) assert.doesNotThrow(() => assertOperationWritable(name));
    for (const name of writes) assert.throws(() => assertOperationWritable(name), ReadOnlyError);
    assert.throws(() => assertOperationWritable("future_write"), ReadOnlyError);
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

test("the read-only response tells members they can still browse", async () => {
  const response = readOnlyResponse(); assert.equal(response.status,503); assert.equal(response.headers.get("cache-control"),"no-store");
  assert.match(await response.text(), /You can still browse/);
});

test("normal mode retains writes", () => {
  const previous = process.env.VIBIES_READ_ONLY; delete process.env.VIBIES_READ_ONLY;
  try { assert.doesNotThrow(assertWritable); assert.doesNotThrow(() => assertOperationWritable("change_member")); }
  finally { if (previous !== undefined) process.env.VIBIES_READ_ONLY = previous; }
});
