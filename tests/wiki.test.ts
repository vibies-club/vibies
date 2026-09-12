import assert from "node:assert/strict";
import { test } from "node:test";
import { filterWiki, wikiEntries, wikiTopics } from "../lib/wiki.ts";

test("wiki entries have complete public catalog data", () => {
  const ids = new Set<string>();
  const allowedPlaces = new Set(["shell", "tmux", "Codex", "SQL Editor", "browser"]);

  for (const entry of wikiEntries) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${entry.id || "<empty>"}: id must be a nonempty slug`);
    assert.equal(ids.has(entry.id), false, `${entry.id}: id must be unique`);
    ids.add(entry.id);

    for (const [field, value] of [
      ["title", entry.title],
      ["topic", entry.topic],
      ["usage", entry.usage],
      ["prerequisites", entry.prerequisites],
      ["result", entry.result],
    ]) assert.ok(value.trim(), `${entry.id}: ${field} must be nonempty`);

    assert.ok(allowedPlaces.has(entry.where), `${entry.id}: where must be allowed`);
    assert.ok(entry.command || entry.keys || entry.guide, `${entry.id}: command, keys, or guide must be present`);
    assert.equal(Boolean(entry.command && entry.keys), false, `${entry.id}: command and keys cannot both be present`);
    assert.ok(entry.sources.length, `${entry.id}: sources must be nonempty`);
    for (const source of entry.sources) {
      assert.ok(source.file.trim(), `${entry.id}: source file must be nonempty`);
      assert.ok(source.location.trim(), `${entry.id}: source location must be nonempty`);
      assert.equal(source.file.includes("instructor"), false, `${entry.id}: instructor sources are forbidden`);
      assert.match(source.file, /^vibies-(?:session-(?:[1-9]|10|catchup)\.html|cheatsheet\.pdf)$/, `${entry.id}: source must be a student deck`);
    }
    if (entry.command && /\[[^\]]+\]/.test(entry.command)) {
      assert.ok(entry.placeholders?.includes("before you run"), `${entry.id}: bracket placeholders need replacement guidance`);
    }
  }

  assert.deepEqual(wikiTopics, [...new Set(wikiEntries.map((entry) => entry.topic))]);
  for (const id of ["git-switch-feature", "git-status", "tmux-split-pane", "npm-run-dev"]) {
    assert.ok(ids.has(id), `${id}: required stable entry is missing`);
  }
});

test("wiki search covers empty, casing, topics, notes, and no results", () => {
  assert.deepEqual(filterWiki("", ""), wikiEntries);
  assert.deepEqual(filterWiki("  CoMpAsS  ", "" ).map((entry) => entry.id), ["git-status"]);
  assert.deepEqual(filterWiki("compass", "Git").map((entry) => entry.id), ["git-status"]);
  assert.deepEqual(filterWiki("development server", "Node and Next.js").map((entry) => entry.id), ["npm-run-dev"]);
  assert.deepEqual(filterWiki("full-window size", "").map((entry) => entry.id), ["tmux-zoom-pane"]);
  assert.deepEqual(filterWiki("result that does not exist", ""), []);
  assert.deepEqual(filterWiki("", "Unknown topic"), []);
});

test("copyable examples keep their literal templates", () => {
  assert.equal(wikiEntries.find((entry) => entry.id === "git-switch-feature")?.command, "git switch -c feature/[name]");
  assert.equal(wikiEntries.find((entry) => entry.id === "tmux-split-pane")?.keys, "Ctrl+b, then %");
  for (const id of ["shell-tab-completion", "shell-command-history", "tmux-quit-scroll"]) {
    assert.equal(wikiEntries.find((entry) => entry.id === id)?.command, undefined, `${id}: keyboard action must not be copyable`);
  }
});
