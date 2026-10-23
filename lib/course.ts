/** Shared course contract (notes/plans/student-hub.md). Gate item ids match ^[a-z0-9-]{1,40}$ and stay frozen after first publish. */
export type GateItem = { id: string; text: string };

export type CourseSession = {
  n: number;
  title: string;
  goal: string;
  date: string | null; // YYYY-MM-DD
  phase: string;
  deck: string | null; // R2 key under decks/, e.g. "s18.html"
  gate: GateItem[];
  prompts: { file: string; label: string }[];
};

export type CourseManifest = { version: 1; demoDay: string; phases: { id: string; title: string }[]; sessions: CourseSession[] };

export type GateState = "done" | "needs_work";
export type GateCheck = { sessionNo: number; itemId: string; state: GateState; proofUrl: string | null; memberNote: string | null; instructorNote: string | null };
// The board also carries proof links and notes so the Instructor can review a cell before flagging it.
export type GateBoard = { members: { nickname: string; checks: GateCheck[] }[] };

/** The first session dated today or later; after the last class, the last session. */
export function nextSession(course: CourseManifest, today: string): CourseSession | null {
  return course.sessions.find(session => session.date !== null && session.date >= today) ?? course.sessions.at(-1) ?? null;
}

/** Whole days from today to a YYYY-MM-DD date; negative once it has passed. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The viewer's own calendar date, so "today" matches the phone in their hand. */
export function localToday(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const ID = /^[a-z0-9-]{1,40}$/;
const DECK = /^s\d{2}\.html$/;
const PROMPT = /^[a-z0-9-]{1,80}\.md$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number, min = 1): value is string => typeof value === "string" && value.trim().length >= min && value.length <= max;
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const unique = (values: unknown[]) => new Set(values).size === values.length;

/** A real calendar date written YYYY-MM-DD. */
export function isoDate(value: unknown): value is string {
  const time = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value as string);
}

/**
 * Validates the course manifest from storage and copies only the known fields.
 * Anything malformed returns null, so callers treat the course as unpublished.
 */
export function parseCourse(value: unknown): CourseManifest | null {
  if (!record(value) || value.version !== 1 || !isoDate(value.demoDay) || !list(value.phases, 20) || !list(value.sessions, 30) || value.sessions.length === 0) return null;
  const phases: CourseManifest["phases"] = [];
  for (const phase of value.phases) {
    if (!record(phase) || typeof phase.id !== "string" || !ID.test(phase.id) || !text(phase.title, 80)) return null;
    phases.push({ id: phase.id, title: phase.title });
  }
  if (!unique(phases.map(phase => phase.id))) return null;
  const sessions: CourseSession[] = [];
  for (const s of value.sessions) {
    if (!record(s) || !Number.isInteger(s.n) || (s.n as number) < 1 || (s.n as number) > 30 || !text(s.title, 120) || !text(s.goal, 400, 0) ||
      !(s.date === null || isoDate(s.date)) || !phases.some(phase => phase.id === s.phase) ||
      !(s.deck === null || (typeof s.deck === "string" && DECK.test(s.deck))) || !list(s.gate, 20) || !list(s.prompts, 10)) return null;
    const gate: GateItem[] = [];
    for (const item of s.gate) {
      if (!record(item) || typeof item.id !== "string" || !ID.test(item.id) || !text(item.text, 300)) return null;
      gate.push({ id: item.id, text: item.text });
    }
    const prompts: CourseSession["prompts"] = [];
    for (const prompt of s.prompts) {
      if (!record(prompt) || typeof prompt.file !== "string" || !PROMPT.test(prompt.file) || !text(prompt.label, 120)) return null;
      prompts.push({ file: prompt.file, label: prompt.label });
    }
    if (!unique(gate.map(item => item.id)) || !unique(prompts.map(prompt => prompt.file))) return null;
    sessions.push({ n: s.n as number, title: s.title, goal: s.goal, date: s.date as string | null, phase: s.phase as string, deck: s.deck as string | null, gate, prompts });
  }
  if (!unique(sessions.map(session => session.n))) return null;
  return { version: 1, demoDay: value.demoDay, phases, sessions: sessions.sort((a, b) => a.n - b.n) };
}

export const gateItemId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

/** An optional https proof link: "" is none, anything else must be a plain https URL of at most 512 characters. */
export function gateProof(value: string): string | null | false {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > 512 || !/^https:\/\/[^\s]+$/i.test(trimmed) || !trimmed.startsWith("https://")) return false;
  try { const url = new URL(trimmed); return url.protocol === "https:" && !url.username && !url.password ? trimmed : false; } catch { return false; }
}

/** An optional note of at most 500 characters: "" is none. */
export function gateNote(value: string): string | null | false {
  const trimmed = value.trim().replace(/\r\n?/g, "\n");
  if (trimmed === "") return null;
  return trimmed.length <= 500 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(trimmed) ? trimmed : false;
}
