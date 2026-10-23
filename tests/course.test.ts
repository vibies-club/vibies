import assert from "node:assert/strict";
import { test } from "node:test";
import { daysUntil, isoDate, localToday, nextSession, parseCourse, type CourseManifest } from "../lib/course.ts";

const session = (n: number, date: string | null) => ({ n, title: `S${n}`, goal: "Goal", date, phase: "build", deck: null, gate: [], prompts: [] });
const course: CourseManifest = { version: 1, demoDay: "2026-11-19", phases: [], sessions: [session(1, "2026-10-22"), session(2, null), session(3, "2026-10-26"), session(4, "2026-10-29")] };

test("next class is the first dated session from today, then the last session", () => {
  assert.equal(nextSession(course, "2026-10-23")?.n, 3);
  assert.equal(nextSession(course, "2026-10-26")?.n, 3);
  assert.equal(nextSession(course, "2026-12-01")?.n, 4);
  assert.equal(nextSession({ ...course, sessions: [] }, "2026-10-23"), null);
});

test("day counts and the local date", () => {
  assert.equal(daysUntil("2026-11-19", "2026-10-23"), 27);
  assert.equal(daysUntil("2026-10-23", "2026-10-23"), 0);
  assert.equal(daysUntil("2026-10-22", "2026-10-23"), -1);
  assert.equal(localToday(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

const valid = () => ({
  version: 1, demoDay: "2026-11-19", phases: [{ id: "build", title: "Build" }],
  sessions: [
    { n: 2, title: "Second", goal: "", date: null, phase: "build", deck: null, gate: [], prompts: [] },
    { n: 1, title: "First", goal: "Ship it.", date: "2026-10-26", phase: "build", deck: "s01.html", extra: "dropped",
      gate: [{ id: "s1-ship", text: "Ship it." }], prompts: [{ file: "setup-prompt.md", label: "Setup prompt" }] },
  ],
});

test("a valid manifest is copied field by field and sorted by session number", () => {
  const course = parseCourse(valid());
  assert.deepEqual(course?.sessions.map(session => session.n), [1, 2]);
  assert.equal((course?.sessions[0] as Record<string, unknown>).extra, undefined);
  assert.deepEqual(course?.sessions[0].prompts, [{ file: "setup-prompt.md", label: "Setup prompt" }]);
});

test("malformed manifests are treated as absent", () => {
  const broken: [string, (m: any) => void][] = [
    ["version", m => { m.version = 2; }],
    ["demo day", m => { m.demoDay = "2026-02-30"; }],
    ["no sessions", m => { m.sessions = []; }],
    ["too many sessions", m => { m.sessions = Array.from({ length: 31 }, (_, i) => ({ ...m.sessions[1], n: i + 1 })); }],
    ["session zero", m => { m.sessions[0].n = 0; }],
    ["session 31", m => { m.sessions[0].n = 31; }],
    ["fractional session", m => { m.sessions[0].n = 1.5; }],
    ["duplicate session", m => { m.sessions[0].n = 1; }],
    ["unknown phase", m => { m.sessions[0].phase = "other"; }],
    ["duplicate phase", m => { m.phases.push({ id: "build", title: "Again" }); }],
    ["bad phase id", m => { m.phases[0].id = "Build"; m.sessions.forEach((s: any) => { s.phase = "Build"; }); }],
    ["date format", m => { m.sessions[0].date = "26/10/2026"; }],
    ["deck path", m => { m.sessions[1].deck = "../secret.html"; }],
    ["instructor deck", m => { m.sessions[1].deck = "s01-instructor.html"; }],
    ["prompt path", m => { m.sessions[1].prompts[0].file = "../x.md"; }],
    ["prompt type", m => { m.sessions[1].prompts[0].file = "x.html"; }],
    ["duplicate prompt", m => { m.sessions[1].prompts.push({ ...m.sessions[1].prompts[0] }); }],
    ["gate id", m => { m.sessions[1].gate[0].id = "S1 ship"; }],
    ["long gate id", m => { m.sessions[1].gate[0].id = "a".repeat(41); }],
    ["duplicate gate id", m => { m.sessions[1].gate.push({ id: "s1-ship", text: "Again" }); }],
    ["empty title", m => { m.sessions[0].title = " "; }],
    ["long goal", m => { m.sessions[0].goal = "x".repeat(401); }],
    ["gate not a list", m => { m.sessions[0].gate = {}; }],
    ["too many gate items", m => { m.sessions[0].gate = Array.from({ length: 21 }, (_, i) => ({ id: `g${i}`, text: "Item" })); }],
  ];
  for (const [name, change] of broken) {
    const manifest = valid();
    change(manifest);
    assert.equal(parseCourse(manifest), null, name);
  }
  for (const value of [null, "x", [], 1, {}]) assert.equal(parseCourse(value), null);
  assert.equal(isoDate("2026-10-26"), true);
  assert.equal(isoDate("2026-13-01"), false);
});
