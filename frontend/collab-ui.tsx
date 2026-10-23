import { useEffect, useState, type ReactNode } from "react";
import type { JobState } from "../lib/collab-core";
import type { JobSummary } from "../lib/collab-read";
import { HexBadge, MessageBanner, type BadgeTone } from "./ui";
import "./collaborate.css";

const clock = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", month: "short", day: "numeric" });
/** Every date on Collaborate is shown in Tehran time, where the class meets. */
export const tehran = (iso: string) => clock.format(new Date(iso));
export const tehranDay = (iso: string) => day.format(new Date(iso));
export const tehranToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();
export const usd = (amount: number) => `$${amount.toLocaleString("en-US")}`;

export function Time({ iso, dayOnly }: { iso: string; dayOnly?: boolean }) {
  return <time dateTime={iso}>{dayOnly ? tehranDay(iso) : tehran(iso)}</time>;
}

/** The compensation as hexagon badges: "$120" and/or "5% of Habit Hive". */
export function Pay({ job, tier }: { job: Pick<JobSummary, "money" | "share" | "projectTitle">; tier?: number }) {
  const scale = (value: number) => tier === undefined ? value : Math.floor(value * tier / 100);
  return <span className="pay">
    {job.money !== null && <span className="pay-hex"><span className="mono">{usd(scale(job.money))}</span></span>}
    {job.share !== null && <span className="pay-hex is-share"><span className="mono">{scale(job.share)}% of {job.projectTitle ?? "a deleted product"}</span></span>}
  </span>;
}

export const stateWords: Record<JobState, string> = {
  open: "Open", claimed: "Claimed", delivered: "Delivered", changes: "Changes requested", accepted: "Accepted",
  paid: "Paid", cancelled: "Cancelled", disputed: "In dispute",
};
const stateTone: Record<JobState, BadgeTone> = { open: "strong", claimed: "plain", delivered: "plain", changes: "plain", accepted: "plain", paid: "muted", cancelled: "muted", disputed: "plain" };
export function StateBadge({ state }: { state: JobState }) {
  return <HexBadge tone={stateTone[state]}>{stateWords[state]}</HexBadge>;
}

const steps = ["Open", "Claimed", "Delivered", "Accepted", "Paid"] as const;
const stepOf: Record<JobState, number> = { open: 0, claimed: 1, changes: 1, delivered: 2, accepted: 3, paid: 4, cancelled: -1, disputed: -1 };
/** The five-cell comb: done cells hold a check, the current cell is filled honey. */
export function JobComb({ state, confirmed }: { state: JobState; confirmed: boolean }) {
  const current = stepOf[state];
  return <ol className={`comb${current < 0 ? " is-paused" : ""}`} aria-label="Job progress">
    {steps.map((label, index) => {
      const done = index < current || (index === 4 && current === 4 && confirmed);
      const now = index === current && !done;
      return <li key={label} className={done ? "is-done" : now ? "is-now" : undefined} aria-current={now ? "step" : undefined}>
        <svg viewBox="0 0 48 42" aria-hidden="true">
          <polygon points="12,1.5 36,1.5 46.5,21 36,40.5 12,40.5 1.5,21" />
          {done ? <path d="m16 21.5 5.5 5.5 11-11.5" /> : now ? <polygon className="comb-dot" points="19,14 29,14 34,21 29,28 19,28 14,21" /> : null}
        </svg>
        <span>{label}{state === "changes" && index === 1 ? <em>Changes</em> : null}</span>
      </li>;
    })}
  </ol>;
}

/** The current hash, so tabs and the post form work without extra routes. */
export function useHash(fallback: string) {
  const read = () => window.location.hash.slice(1) || fallback;
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const update = () => setHash(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

/** A one-button form. Collaborate forms post intent; the server decides the outcome. */
export function ActionForm({ action, fields, primary, confirm, children, className }: {
  action: string; fields: Record<string, string>; primary?: boolean; confirm?: string; children: ReactNode; className?: string;
}) {
  return <form action="/collaborate/action" method="post" className={className ?? "inline-form"}>
    <input type="hidden" name="action" value={action} />
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {confirm && <label className="check confirmation"><input type="checkbox" name="confirm" value="yes" required /> {confirm}</label>}
    <button type="submit" className={primary ? "primary" : undefined}>{children}</button>
  </form>;
}

export const MONEY_NOTE = "Vibies records money and shares and never moves money. You pay each other outside the site, and the job keeps the receipt.";
export const AGREEMENT_NOTE = "This is the team's own record of what was agreed. It helps you remember and settle fairly. It is not a legal contract and Vibies does not enforce it.";
export const SPLIT_HINT = "Equal split is the usual start. Change it when roles differ.";

const messages: Record<string, string> = {
  posted: "Job posted. Classmates can claim it now.",
  edited: "Job saved.",
  cancelled: "Job cancelled. It stays in the history.",
  claimed: "You claimed this job. The clock started now.",
  abandoned: "You let this job go. It is open again.",
  released: "Claim released. The job is open again.",
  delivered: "Delivery sent. The poster has 7 days to review it.",
  accepted: "Delivery accepted.",
  changes_requested: "Changes requested. A resubmission within 3 days keeps the locked tier.",
  rejected: "Delivery rejected. The claim is back in progress and the tier is unlocked.",
  paid: "Marked as paid. The claimant can now confirm it arrived.",
  receipt_confirmed: "Receipt confirmed. This job is complete.",
  disputed: "Dispute opened. The instructor will settle it.",
  resolved: "Dispute settled.",
  hidden: "Job hidden from Members.",
  restored: "Job visible again.",
  unchanged: "No change was made.",
  stale: "This job changed while you were looking. Review it and try again.",
  invalid: "That step is not available right now. Check the fields and the job's current step.",
  invalid_delivery: "Add a full https:// link and a short note.",
  invalid_changes: "Choose at least one criterion that is not met yet.",
  taken: "Someone else claimed this job first.",
  limit: "You already have 2 active claims. Deliver or let one go first.",
  too_early: "You can release the claim once its window has ended.",
  rounds: "Both change rounds are used. Accept, reject or open a dispute.",
  hidden_job: "This job is hidden by the instructor.",
  insufficient_share: "Your current share line on this product is smaller than the share this job promises.",
  project_missing: "The product behind this share no longer exists. Open a dispute so the instructor can settle it.",
  error: "We could not complete this action. Please try again.",
  team_invited: "Invitation sent.",
  team_exists: "That member is already invited or on the team.",
  team_no_member: "No approved member has that nickname.",
  team_joined: "You joined the team.",
  team_declined: "Invitation declined.",
  team_left: "You left the team.",
  team_removed: "Teammate removed. Propose a new version to move their share.",
  team_invalid: "That team change is not available.",
  agreement_proposed: "Version proposed. It becomes active when everyone listed accepts.",
  agreement_activated: "The agreement is active. Everyone listed accepted.",
  agreement_accepted: "You accepted. It activates when everyone listed accepts.",
  agreement_declined: "You declined this version. The owner can propose a new one.",
  agreement_stale: "The agreement changed. Review the latest version and try again.",
  agreement_not_team: "Every line must be the owner or a teammate who joined.",
  agreement_invalid: "Use whole percents from 1 to 100 that add up to exactly 100.",
  agreement_already: "You already answered this version.",
};
export function CollabMessage({ message, only }: { message: string | null; only?: "team" }) {
  if (!message || (only === "team" && !/^(team|agreement)_/.test(message))) return null;
  return Object.hasOwn(messages, message) ? <MessageBanner>{messages[message]}</MessageBanner> : null;
}
