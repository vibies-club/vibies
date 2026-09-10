import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_BODY_LIMIT, projectDetails, projectForm, projectId, projectVersion, repositoryId } from "../lib/project-core.ts";

test("project details accept Unicode and HTTPS without provider identity imports", () => {
  assert.deepEqual(projectDetails("  Synthetic garden  ", "Line one\r\nLine two", ""),
    {title:"Synthetic garden", summary:"Line one\nLine two", demoUrl:null});
  assert.ok(projectDetails("🌱".repeat(80), "🌱".repeat(500), "https://synthetic-builder.github.io/demo"));
  for (const [title, summary, url] of [
    ["", "summary", ""], [" ", "summary", ""], ["x".repeat(81), "summary", ""],
    ["title", "", ""], ["title", "🌱".repeat(501), ""],
    ...["\0", "\t", "\r", "\u007f", "\u200b", "\u202e", "\u2066"].flatMap(c => [[`title${c}`, "summary", ""], ["title", `summary${c}`, ""]]),
    ["title\n", "summary", ""],
    ...["http://example.test", "javascript:alert(1)", "/relative", "https://user:pass@example.test", "https://example.test/\npath", "https://", "https://example.test/" + "x".repeat(2048)].map(u => ["title", "summary", u]),
  ]) assert.equal(projectDetails(title, summary, url), null, JSON.stringify([title,summary,url]));
});

test("bounded form accepts maximum Unicode details and rejects oversize and duplicate fields", async () => {
  const demo = "https://example.test/" + "🌱".repeat(2048 - [..."https://example.test/"].length);
  const form = new URLSearchParams({action:"connect", repositoryId:"123", title:"🌱".repeat(80), summary:"🌱".repeat(500), demoUrl:demo});
  assert.ok(Buffer.byteLength(form.toString()) < PROJECT_BODY_LIMIT);
  const parsed = await projectForm(new Request("https://example.test/projects/action", {method:"POST", body:form}));
  assert.ok(parsed instanceof URLSearchParams);
  assert.ok(projectDetails(parsed.get("title"), parsed.get("summary"), parsed.get("demoUrl")));
  for (const [body, expected] of [["x".repeat(PROJECT_BODY_LIMIT + 1), 413], ["action=connect&action=publish", 400]] as const) {
    assert.equal(await projectForm(new Request("https://example.test", {method:"POST", body})), expected);
  }
  assert.equal(projectId("class-project"), false);
  assert.equal(projectId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), true);
  assert.equal(repositoryId("9007199254740992"), false);
  assert.equal(repositoryId("123"), true);
  for (const value of ["1", "9223372036854775807"]) assert.equal(projectVersion(value), true);
  for (const value of [null, "", "0", "-1", "01", "1.5", "1e3", "9223372036854775808", "9".repeat(100)]) {
    assert.equal(projectVersion(value), false);
  }
});
