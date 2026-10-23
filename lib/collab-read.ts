import { JOB_STATES, DELIVERABLES, HELP, STAGES, type Deliverable, type Help, type JobState, type Stage } from "./collab-core.ts";
import { projectId, projectVersion } from "./project-core.ts";

/** Only these validated shapes cross the Worker/browser boundary for Collaborate. */
export type JobSummary = {
  id: string; title: string; deliverable: Deliverable; windowDays: number; money: number | null; share: number | null;
  poster: string; byInstructor: boolean; projectId: string | null; projectTitle: string | null; skills: string[];
  state: JobState; hidden: boolean; createdAt: string; claimant: string | null; claimedAt: string | null;
  deliveredAt: string | null; confirmed: boolean; isPoster: boolean; isClaimant: boolean;
};
export type EventDetail = { url?: string; note?: string | null; tier?: number; amount?: number | null; share?: number | null; shortfall?: number | null;
  failed?: string[]; reason?: string | null; outcome?: string; on?: string; round?: number; at?: string };
export type JobEvent = { kind: string; actorKind: "member" | "instructor" | "system"; actor: string | null; at: string; detail: EventDetail | null };
export type JobDetail = JobSummary & {
  description: string; version: string; storedState: JobState; milestoneId: string | null; milestoneTitle: string | null; criteria: string[];
  lockedTier: number | null; finalTier: number | null; changeRounds: number; rejectCount: number; changesAt: string | null;
  firstDeliveredAt: string | null; acceptedAt: string | null; lapse: string | null; lapseAt: string | null;
  shareGranted: number | null; paidAmount: number | null; paidOn: string | null; paidAt: string | null; receiptAt: string | null;
  posterLine: number | null; claimantCompleted: number | null; party: boolean; deliveryUrl: string | null; deliveryNote: string | null;
  paidNote: string | null; agreementVersion: number | null; events: JobEvent[] | null;
};
export type LinkableProject = { id: string; title: string; line: number | null; milestones: { id: string; title: string }[] };
export type AgreementLineView = { nickname: string; role: string; percent: number; brings: string | null; decision: "accepted" | "declined" | null };
export type Invitation = { projectId: string; projectTitle: string; owner: string; role: string };
export type ShareChange = { from: number; to: number };
export type PendingAgreement = { projectId: string; projectTitle: string; owner: string; agreementId: string; version: number; createdAt: string; lines: AgreementLineView[]; myChange: ShareChange | null };
export type TeamMembership = { projectId: string; projectTitle: string; owner: string; isOwner: boolean; role: string; percent: number | null;
  activeVersion: number | null; pendingVersion: number | null; teamSize: number };
export type Board = { viewer: "member" | "instructor"; instructorNickname: string; completed: number; activeClaims: number;
  jobs: JobSummary[]; projects: LinkableProject[]; invitations: Invitation[]; pending: PendingAgreement[]; teams: TeamMembership[] };
export type JobPage = { viewer: "member" | "instructor"; instructorNickname: string; activeClaims: number; projects: LinkableProject[]; job: JobDetail };
export type Agreement = { id: string; version: number; status: "pending" | "active" | "superseded" | "declined" | "replaced"; source: "proposal" | "job";
  jobId: string | null; jobTitle: string | null; createdAt: string; activatedAt: string | null; closedAt: string | null; lines: AgreementLineView[] };
export type Team = { projectId: string; owner: string; isOwner: boolean; insider: boolean; myStatus: "invited" | "active" | null; myRole: string | null;
  team: { nickname: string; role: string; status: "invited" | "active"; completed: number }[]; candidates: string[] | null;
  latestVersion: number; active: Agreement | null; pending: Agreement | null; myDecision: "needed" | "accepted" | "declined" | "not_listed" | null; myChange: ShareChange | null;
  history: Agreement[]; openShareJobs: number };

function fail(): never { throw new Error("Collaborate unavailable"); }
const str = (v: unknown, max = 6000): string => typeof v === "string" && v.length <= max ? v : fail();
const opt = <T>(v: unknown, read: (v: unknown) => T): T | null => v === null || v === undefined ? null : read(v);
const int = (min: number, max: number) => (v: unknown): number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : fail();
const bool = (v: unknown): boolean => typeof v === "boolean" ? v : fail();
const one = <T extends string>(list: readonly T[]) => (v: unknown): T => list.includes(v as T) ? v as T : fail();
const id = (v: unknown): string => projectId(v) ? v : fail();
const time = (v: unknown): string => typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fail();
const list = <T>(v: unknown, read: (v: unknown) => T, max = 500): T[] => Array.isArray(v) && v.length <= max ? v.map(read) : fail();
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const name = (v: unknown) => str(v, 30);

function summary(value: unknown): JobSummary {
  const v = obj(value);
  return { id: id(v.id), title: str(v.title, 80), deliverable: one(Object.keys(DELIVERABLES) as Deliverable[])(v.deliverable),
    windowDays: int(1, 30)(v.windowDays), money: opt(v.money, int(1, 1_000_000)), share: opt(v.share, int(1, 100)),
    poster: name(v.poster), byInstructor: bool(v.byInstructor), projectId: opt(v.projectId, id), projectTitle: opt(v.projectTitle, s => str(s, 80)),
    skills: list(v.skills, s => str(s, 24), 5), state: one(JOB_STATES)(v.state), hidden: bool(v.hidden), createdAt: time(v.createdAt),
    claimant: opt(v.claimant, name), claimedAt: opt(v.claimedAt, time), deliveredAt: opt(v.deliveredAt, time), confirmed: bool(v.confirmed),
    isPoster: bool(v.isPoster), isClaimant: bool(v.isClaimant) };
}
function detail(value: unknown): EventDetail | null {
  if (value === null || value === undefined) return null;
  const v = obj(value), out: EventDetail = {};
  if (v.url !== undefined) out.url = str(v.url, 2048);
  if (v.note !== undefined) out.note = opt(v.note, s => str(s, 1000));
  if (v.reason !== undefined) out.reason = opt(v.reason, s => str(s, 1000));
  for (const key of ["tier", "round"] as const) if (v[key] !== undefined && v[key] !== null) out[key] = int(0, 100)(v[key]);
  for (const key of ["amount", "share", "shortfall"] as const) if (v[key] !== undefined) out[key] = opt(v[key], int(0, 1_000_000));
  if (v.failed !== undefined) out.failed = list(v.failed, s => str(s, 200), 10);
  if (v.outcome !== undefined) out.outcome = one(["accepted", "paid", "open", "cancelled"])(v.outcome);
  if (v.on !== undefined) out.on = str(v.on, 10);
  if (v.at !== undefined) out.at = time(v.at);
  return out;
}
function event(value: unknown): JobEvent {
  const v = obj(value);
  return { kind: str(v.kind, 40), actorKind: one(["member", "instructor", "system"] as const)(v.actorKind), actor: opt(v.actor, name), at: time(v.at), detail: detail(v.detail) };
}
const tier = (v: unknown): number => v === 0 || v === 50 || v === 100 ? v : fail();

const linkable = (p: unknown): LinkableProject => { const v = obj(p); return { id: id(v.id), title: str(v.title, 80), line: opt(v.line, int(0, 100)),
  milestones: list(v.milestones, m => { const x = obj(m); return { id: id(x.id), title: str(x.title, 80) }; }, 20) }; };

export function readJobPage(value: any): JobPage {
  const j = obj(value?.job);
  const job: JobDetail = { ...summary(j), description: str(j.description, 2000), version: projectVersion(j.version) ? j.version as string : fail(),
    storedState: one(JOB_STATES)(j.storedState), milestoneId: opt(j.milestoneId, id), milestoneTitle: opt(j.milestoneTitle, s => str(s, 80)), criteria: list(j.criteria, s => str(s, 200), 10),
    lockedTier: opt(j.lockedTier, tier), finalTier: opt(j.finalTier, tier), changeRounds: int(0, 2)(j.changeRounds), rejectCount: int(0, 1)(j.rejectCount),
    changesAt: opt(j.changesAt, time), firstDeliveredAt: opt(j.firstDeliveredAt, time), acceptedAt: opt(j.acceptedAt, time),
    lapse: opt(j.lapse, one(["expired", "claimant_left", "poster_left", "auto_accepted"])), lapseAt: opt(j.lapseAt, time),
    shareGranted: opt(j.shareGranted, int(0, 100)), paidAmount: opt(j.paidAmount, int(0, 1_000_000)), paidOn: opt(j.paidOn, s => str(s, 10)),
    paidAt: opt(j.paidAt, time), receiptAt: opt(j.receiptAt, time), posterLine: opt(j.posterLine, int(0, 100)),
    claimantCompleted: opt(j.claimantCompleted, int(0, 100_000)), party: bool(j.party), deliveryUrl: opt(j.deliveryUrl, s => str(s, 2048)),
    deliveryNote: opt(j.deliveryNote, s => str(s, 1000)), paidNote: opt(j.paidNote, s => str(s, 500)),
    agreementVersion: opt(j.agreementVersion, int(1, 1_000_000)), events: opt(j.events, e => list(e, event)) };
  return { viewer: one(["member", "instructor"] as const)(value.viewer), instructorNickname: name(value.instructorNickname),
    activeClaims: int(0, 100)(value.activeClaims), projects: list(value.projects, linkable, 100), job };
}

const line = (value: unknown): AgreementLineView => {
  const v = obj(value);
  return { nickname: name(v.nickname), role: str(v.role, 40), percent: int(1, 100)(v.percent), brings: opt(v.brings, s => str(s, 200)),
    decision: opt(v.decision, one(["accepted", "declined"] as const)) };
};
export function readBoard(value: any): Board {
  return {
    viewer: one(["member", "instructor"] as const)(value?.viewer), instructorNickname: name(value.instructorNickname),
    completed: int(0, 100_000)(value.completed), activeClaims: int(0, 100)(value.activeClaims), jobs: list(value.jobs, summary, 2000),
    projects: list(value.projects, linkable, 100),
    invitations: list(value.invitations, i => { const v = obj(i); return { projectId: id(v.projectId), projectTitle: str(v.projectTitle, 80),
      owner: name(v.owner), role: str(v.role, 40) }; }),
    pending: list(value.pending, p => { const v = obj(p); return { projectId: id(v.projectId), projectTitle: str(v.projectTitle, 80), owner: name(v.owner),
      agreementId: id(v.agreementId), version: int(1, 1_000_000)(v.version), createdAt: time(v.createdAt), lines: list(v.lines, line, 9), myChange: opt(v.myChange, shareChange) }; }),
    teams: list(value.teams, t => { const v = obj(t); return { projectId: id(v.projectId), projectTitle: str(v.projectTitle, 80), owner: name(v.owner),
      isOwner: bool(v.isOwner), role: str(v.role, 40), percent: opt(v.percent, int(0, 100)), activeVersion: opt(v.activeVersion, int(1, 1_000_000)),
      pendingVersion: opt(v.pendingVersion, int(1, 1_000_000)), teamSize: int(1, 100)(v.teamSize) }; }),
  };
}
function shareChange(value: unknown): ShareChange {
  const v = obj(value);
  return { from: int(1, 100)(v.from), to: int(0, 99)(v.to) };
}
function agreement(value: unknown): Agreement {
  const v = obj(value);
  return { id: id(v.id), version: int(1, 1_000_000)(v.version), status: one(["pending", "active", "superseded", "declined", "replaced"] as const)(v.status),
    source: one(["proposal", "job"] as const)(v.source), jobId: opt(v.jobId, id), jobTitle: opt(v.jobTitle, s => str(s, 80)), createdAt: time(v.createdAt),
    activatedAt: opt(v.activatedAt, time), closedAt: opt(v.closedAt, time), lines: list(v.lines, line, 9) };
}
export function readTeam(value: any): Team {
  const v = obj(value);
  return { projectId: id(v.projectId), owner: name(v.owner), isOwner: bool(v.isOwner), insider: bool(v.insider),
    myStatus: opt(v.myStatus, one(["invited", "active"] as const)), myRole: opt(v.myRole, s => str(s, 40)),
    team: list(v.team, t => { const x = obj(t); return { nickname: name(x.nickname), role: str(x.role, 40), status: one(["invited", "active"] as const)(x.status),
      completed: int(0, 100_000)(x.completed) }; }, 20),
    candidates: opt(v.candidates, c => list(c, name, 20)), latestVersion: int(0, 1_000_000)(v.latestVersion),
    active: opt(v.active, agreement), pending: opt(v.pending, agreement),
    myDecision: opt(v.myDecision, one(["needed", "accepted", "declined", "not_listed"] as const)), myChange: opt(v.myChange, shareChange),
    history: list(v.history, agreement, 1000), openShareJobs: int(0, 10_000)(v.openShareJobs) };
}

// ---------- Ideas and funding ----------

export type IdeaSummary = { id: string; title: string; problem: string; audience: string; help: Help[]; stage: Stage; author: string; isMine: boolean;
  projectId: string | null; projectTitle: string | null; interestCount: number; commentCount: number; interested: boolean; createdAt: string; activityAt: string };
export type IdeaComment = { author: string; byInstructor: boolean; body: string; at: string };
export type IdeaInterest = { nickname: string; role: string; note: string | null; at: string; team: "invited" | "active" | null };
export type IdeaDetail = IdeaSummary & { version: string; interest: IdeaInterest[]; mine: { role: string; note: string | null } | null;
  myTeam: "invited" | "active" | null; comments: IdeaComment[]; products: { id: string; title: string }[] | null };
export type IdeaPage = { viewer: "member" | "instructor"; idea: IdeaDetail };
export type Pledge = { id: string; pledger: string; amount: number; note: string | null; status: "pledged" | "received" | "withdrawn"; at: string; closedAt: string | null; mine: boolean };
export type Funding = { projectId: string; isOwner: boolean; seeking: boolean; goal: number | null; version: string; pledged: number; received: number; backers: number; pledges: Pledge[] };

const viewer = one(["member", "instructor"] as const);
const usd = (v: unknown) => int(0, 1_000_000_000)(v);
function ideaSummary(value: unknown): IdeaSummary {
  const v = obj(value);
  return { id: id(v.id), title: str(v.title, 80), problem: str(v.problem, 2000), audience: str(v.audience, 200),
    help: list(v.help, one(Object.keys(HELP) as Help[]), 5), stage: one(Object.keys(STAGES) as Stage[])(v.stage), author: name(v.author),
    isMine: bool(v.isMine), projectId: opt(v.projectId, id), projectTitle: opt(v.projectTitle, s => str(s, 80)),
    interestCount: int(0, 100_000)(v.interestCount), commentCount: int(0, 100_000)(v.commentCount), interested: bool(v.interested),
    createdAt: time(v.createdAt), activityAt: time(v.activityAt) };
}
export function readIdeas(value: any): { viewer: "member" | "instructor"; ideas: IdeaSummary[] } {
  return { viewer: viewer(value?.viewer), ideas: list(value.ideas, ideaSummary, 2000) };
}
const teamStatus = one(["invited", "active"] as const);
export function readIdeaPage(value: any): IdeaPage {
  const v = obj(value?.idea);
  return { viewer: viewer(value.viewer), idea: { ...ideaSummary(v), version: projectVersion(v.version) ? v.version as string : fail(),
    interest: list(v.interest, i => { const x = obj(i); return { nickname: name(x.nickname), role: str(x.role, 40), note: opt(x.note, s => str(s, 500)),
      at: time(x.at), team: opt(x.team, teamStatus) }; }),
    mine: opt(v.mine, m => { const x = obj(m); return { role: str(x.role, 40), note: opt(x.note, s => str(s, 500)) }; }),
    myTeam: opt(v.myTeam, teamStatus),
    comments: list(v.comments, c => { const x = obj(c); return { author: name(x.author), byInstructor: bool(x.byInstructor), body: str(x.body, 1000), at: time(x.at) }; }, 2000),
    products: opt(v.products, p => list(p, item => { const x = obj(item); return { id: id(x.id), title: str(x.title, 80) }; }, 100)) } };
}
export function readFunding(value: any): Funding {
  const v = obj(value);
  return { projectId: id(v.projectId), isOwner: bool(v.isOwner), seeking: bool(v.seeking), goal: opt(v.goal, int(1, 1_000_000)),
    version: v.version === "0" || projectVersion(v.version) ? v.version as string : fail(), pledged: usd(v.pledged), received: usd(v.received),
    backers: int(0, 100_000)(v.backers),
    pledges: list(v.pledges, p => { const x = obj(p); return { id: id(x.id), pledger: name(x.pledger), amount: int(1, 1_000_000)(x.amount),
      note: opt(x.note, s => str(s, 500)), status: one(["pledged", "received", "withdrawn"] as const)(x.status), at: time(x.at),
      closedAt: opt(x.closedAt, time), mine: bool(x.mine) }; }, 2000) };
}
