import assert from "node:assert/strict";
import { test } from "node:test";
import { demoState, supabaseConfig } from "../lib/demo.ts";

test("only a valid seed becomes visible; errors never leak details", () => {
  const project = { id: 1, title: "Sample", summary: "Fictional" };
  assert.deepEqual(demoState(project, null), { kind: "ready", project });
  assert.deepEqual(demoState(null, null), { kind: "empty" });
  assert.deepEqual(demoState(project, { message: "private detail" }), { kind: "error" });
  for (const data of [undefined, {}, { ...project, id: 2 }, { ...project, summary: 5 }]) {
    assert.deepEqual(demoState(data, null), { kind: "error" });
  }
});

test("configuration errors contain names only and reject privileged keys", () => {
  assert.deepEqual(supabaseConfig(undefined, undefined), {
    kind: "configuration", missing: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  });
  assert.deepEqual(supabaseConfig("https://example.supabase.co", undefined), {
    kind: "configuration", missing: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  });
  for (const [url, key] of [["not-a-url", "sb_publishable_test"], ["https://example.supabase.co", "sb_secret_test"], ["http://example.supabase.co", "sb_publishable_test"]]) {
    assert.deepEqual(supabaseConfig(url, key), { kind: "configuration", missing: [] });
  }
  assert.equal(supabaseConfig("https://example.supabase.co", "sb_publishable_test").kind, "configured");
});
