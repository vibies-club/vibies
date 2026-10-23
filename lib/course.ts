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
export type GateCheck = { sessionNo: number; itemId: string; state: GateState; proofUrl: string | null; note: string | null };
export type GateBoard = { members: { nickname: string; checks: { sessionNo: number; itemId: string; state: GateState }[] }[] };

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
