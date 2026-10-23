import assert from "node:assert/strict";
import { test } from "node:test";
import { demoErrors, searchDemoErrors } from "../lib/demo-errors.ts";

test("demo errors contain five complete, distinct examples", () => {
  assert.equal(demoErrors.length, 5);
  assert.equal(new Set(demoErrors.map(({ id }) => id)).size, 5);
  assert.equal(new Set(demoErrors.map(({ title }) => title)).size, 5);

  for (const item of demoErrors) {
    for (const value of [item.id, item.title, item.tool, item.error, item.location, item.cause, item.confirmation]) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim());
    }
    assert.ok(item.steps.length > 0);
    assert.ok(item.steps.every((step) => step.trim()));
  }
});

test("search is literal, case-insensitive, matches all whitespace terms, and returns all for blank input", () => {
  assert.deepEqual(searchDemoErrors("  \t\n "), demoErrors);
  assert.deepEqual(searchDemoErrors("CODEX shell"), [demoErrors[0]]);
  assert.deepEqual(searchDemoErrors("repository?"), [demoErrors[0]]);
  assert.deepEqual(searchDemoErrors(".*"), []);
  assert.deepEqual(searchDemoErrors("version numbers"), [demoErrors[2]]);
  assert.deepEqual(searchDemoErrors("not-a-real-error"), []);
});
