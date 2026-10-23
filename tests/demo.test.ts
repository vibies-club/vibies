import assert from "node:assert/strict";
import { test } from "node:test";
import { demoState } from "../lib/demo.ts";

test("only a valid seed becomes visible; errors never leak details", () => {
  const project = { id: 1, title: "Sample", summary: "Fictional" };
  assert.deepEqual(demoState(project, null), { kind: "ready", project });
  assert.deepEqual(demoState(null, null), { kind: "empty" });
  assert.deepEqual(demoState(project, { message: "private detail" }), { kind: "error" });
  for (const data of [undefined, {}, { ...project, id: 2 }, { ...project, summary: 5 }]) {
    assert.deepEqual(demoState(data, null), { kind: "error" });
  }
});
