import assert from "node:assert/strict";
import { test } from "node:test";
import { readProject } from "../lib/project-read.ts";

const base = { id: "11111111-1111-4111-8111-111111111111", title: "Synthetic", summary: "Synthetic summary", demoUrl: null, nickname: "Pixel", isOwner: true };

test("nextMilestone is validated and only present when sent", () => {
  assert.equal(Object.hasOwn(readProject(base), "nextMilestone"), false);
  assert.equal(readProject({ ...base, nextMilestone: null }).nextMilestone, null);
  assert.equal(readProject({ ...base, nextMilestone: "Core screen" }).nextMilestone, "Core screen");
  for (const bad of ["x".repeat(81), 7, "", " padded "]) {
    assert.throws(() => readProject({ ...base, nextMilestone: bad }), /Project unavailable/, JSON.stringify(bad));
  }
});
