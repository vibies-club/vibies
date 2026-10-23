import { nickname } from "./access-core.ts";
import { projectId } from "./project-core.ts";

/** Collaborate input rules. The Worker validates with these; SQL guards still decide every rule again. */
export const JOB_STATES = ["open", "claimed", "delivered", "changes", "accepted", "paid", "cancelled", "disputed"] as const;
export type JobState = typeof JOB_STATES[number];
export const DELIVERABLES = { pull_request: "Link to a pull request", live_url: "Live URL", file_link: "Link to a file" } as const;
export type Deliverable = keyof typeof DELIVERABLES;
export const TIERS = [100, 50, 0] as const;
export const MAX_ACTIVE_CLAIMS = 2;
export const REVIEW_DAYS = 7;
export const RESUBMIT_DAYS = 3;
/** Form fields that would let a browser choose an outcome. Posting any of them is a 400. */
export const FORBIDDEN_FIELDS = ["tier", "state", "effective_state", "locked_tier", "final_tier", "share_granted", "poster_is_instructor"];

/** Plain text: no control or format characters, trimmed, length in code points. */
export function text(value: unknown, min: number, max: number, multiline = false): string | null {
  if (typeof value !== "string") return null;
  const normalized = multiline ? value.replace(/\r\n/g, "\n") : value;
  if (/[\p{Cc}\p{Cf}]/u.test(multiline ? normalized.replace(/\n/g, "") : normalized)) return null;
  const trimmed = normalized.trim();
  const length = [...trimmed].length;
  return length >= min && length <= max ? trimmed : null;
}
export function optionalText(value: unknown, max: number, multiline = false): string | null | undefined {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  return text(value, 1, max, multiline) ?? undefined;
}

export function httpsUrl(value: unknown): string | null {
  const url = text(value, 9, 2048);
  if (!url || /\s/.test(url) || !/^https:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname && !parsed.username && !parsed.password ? url : null;
  } catch { return null; }
}

export function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !/^\d{1,7}$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return number >= min && number <= max ? number : null;
}

/** "react, css" -> ["react","css"]. Up to 5 short lowercase tags. */
export function skills(value: unknown): string[] | null {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "string" || value.length > 200) return null;
  const tags = [...new Set(value.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean))];
  return tags.length <= 5 && tags.every(tag => /^[a-z0-9][a-z0-9 +#.-]{0,23}$/.test(tag) && tag === tag.trim()) ? tags : null;
}

export type JobTerms = {
  title: string; description: string; deliverable: Deliverable; windowDays: number;
  money: number | null; share: number | null; projectId: string | null; milestoneId: string | null;
  skills: string[]; criteria: string[];
};

/** Reads the post/edit form: criterion1..criterion10, money and/or share, optional product and milestone. */
export function jobTerms(form: URLSearchParams): JobTerms | null {
  const title = text(form.get("title"), 1, 80);
  const description = text(form.get("description"), 1, 2000, true);
  const deliverable = form.get("deliverable");
  const windowDays = wholeNumber(form.get("windowDays"), 1, 30);
  const moneyRaw = form.get("money")?.trim() ?? "", shareRaw = form.get("share")?.trim() ?? "";
  const money = moneyRaw ? wholeNumber(moneyRaw.replace(/^\$/, "").replace(/,/g, ""), 1, 1_000_000) : null;
  const share = shareRaw ? wholeNumber(shareRaw.replace(/%$/, ""), 1, 100) : null;
  const project = form.get("projectId") || null, milestone = form.get("milestoneId") || null;
  const tags = skills(form.get("skills"));
  const criteria: string[] = [];
  for (let n = 1; n <= 10; n++) {
    const raw = form.get(`criterion${n}`);
    if (raw === null || raw.trim() === "") continue;
    const item = text(raw, 1, 200);
    if (!item) return null;
    criteria.push(item);
  }
  if (!title || !description || !deliverable || !Object.hasOwn(DELIVERABLES, deliverable) || windowDays === null || !tags) return null;
  if ((moneyRaw && money === null) || (shareRaw && share === null) || (money === null && share === null)) return null;
  if ((project !== null && !projectId(project)) || (milestone !== null && !projectId(milestone)) || (milestone && !project)) return null;
  if (share !== null && !project) return null;
  if (criteria.length < 1 || criteria.length > 10) return null;
  return { title, description, deliverable: deliverable as Deliverable, windowDays, money, share,
    projectId: project?.toLowerCase() ?? null, milestoneId: milestone?.toLowerCase() ?? null, skills: tags, criteria };
}

export type AgreementLine = { key: string; role: string; percent: number; brings: string | null };
/** Lines arrive as member1..member9 / role1.. / percent1.. / brings1..; a blank percent drops the row. */
export function agreementLines(form: URLSearchParams): AgreementLine[] | null {
  const lines: AgreementLine[] = [];
  for (let n = 1; n <= 9; n++) {
    const member = form.get(`member${n}`), percentRaw = form.get(`percent${n}`);
    if (member === null && percentRaw === null) continue;
    if (!percentRaw || percentRaw.trim() === "" || percentRaw.trim() === "0") continue;
    const name = nickname(member), role = text(form.get(`role${n}`), 1, 40), percent = wholeNumber(percentRaw, 1, 100);
    const brings = optionalText(form.get(`brings${n}`), 200);
    if (!name || !role || percent === null || brings === undefined) return null;
    lines.push({ key: name.toLowerCase(), role, percent, brings });
  }
  if (lines.length < 1 || new Set(lines.map(line => line.key)).size !== lines.length) return null;
  return lines.reduce((sum, line) => sum + line.percent, 0) === 100 ? lines : null;
}

/** YYYY-MM-DD that is a real calendar date. */
export function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** Payout tier for a delivery at `at`: 100 within the window, 50 within twice the window, then 0. */
export function tierAt(claimedAt: string, windowDays: number, at: number): 100 | 50 | 0 {
  const elapsed = (at - Date.parse(claimedAt)) / 86_400_000;
  return elapsed <= windowDays ? 100 : elapsed <= 2 * windowDays ? 50 : 0;
}
/** Whole dollars and whole percents, rounded down, like the SQL that settles them. */
export const payout = (amount: number, tier: number) => Math.floor(amount * tier / 100);
