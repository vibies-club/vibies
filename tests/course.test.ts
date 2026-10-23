import assert from "node:assert/strict";
import { test } from "node:test";
import { daysUntil, localToday, nextSession, type CourseManifest } from "../lib/course.ts";

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
