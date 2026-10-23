import { useState } from "react";
import type { PageData } from "../contracts";
import type { Board, JobSummary } from "../../lib/collab-read";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, BackLink, EmptyState, HexBadge, HexCell, PageHeader } from "../ui";
import { ActionForm, addDays, CollabMessage, MONEY_NOTE, Pay, StateBadge, Time, useHash } from "../collab-ui";
import { JobForm } from "../job-form";
import { AgreementTable, ShareBar } from "../project-team";
import { JobPage } from "./job";

type PageProps = { data: PageData; search: URLSearchParams };

export function CollaboratePage(props: PageProps) {
  const path = window.location.pathname;
  if (path.startsWith("/collaborate/jobs/")) return <JobPage {...props} />;
  if (path.startsWith("/collaborate/ideas/")) return <AppShell data={props.data}>
    <PageHeader title="Ideas" />
    <EmptyState href="/collaborate" action="Back to Collaborate">Ideas are on the way.</EmptyState>
  </AppShell>;
  const { data, search } = props;
  const access = data.access;
  if (data.kind !== "ok" || !data.collab || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AppShell data={data}><Retry href="/collaborate" /></AppShell>;
  }
  return <AppShell data={data}><Collaborate board={data.collab} message={search.get("message")} /></AppShell>;
}

const tabFor = (hash: string) => ["mine", "post"].includes(hash) ? "jobs" : hash;

function Collaborate({ board, message }: { board: Board; message: string | null }) {
  const member = board.viewer === "member";
  const hash = useHash("jobs");
  const tab = member || hash !== "teams" ? tabFor(hash) : "jobs";
  const waiting = board.invitations.length + board.pending.length;
  const tabs = [{ id: "jobs", label: "Jobs" }, ...(member ? [{ id: "teams", label: "Teams", count: waiting }] : [])];
  return <>
    <PageHeader title="Collaborate" lead="Small paid jobs and product teams for the class. Vibies keeps the record; you settle with each other outside the site." />
    <nav className="collab-tabs" aria-label="Collaborate sections"><ul>
      {tabs.map(item => <li key={item.id}><a href={`#${item.id}`} aria-current={tab === item.id ? "page" : undefined}>{item.label}
        {item.count ? <span className="tab-count mono" aria-label={`${item.count} waiting`}>{item.count}</span> : null}</a></li>)}
    </ul></nav>
    <CollabMessage message={message} />
    {tab === "teams" ? <Teams board={board} /> : hash === "post" ? <Post board={board} /> : <Jobs board={board} mine={hash === "mine"} />}
  </>;
}

function nextHint(job: JobSummary): string | null {
  if (job.isPoster) return ({ open: "Waiting for a claim", claimed: `In progress with ${job.claimant}`, changes: "Waiting for the resubmission",
    delivered: "Review the delivery", accepted: job.money !== null ? "Mark it as paid" : "Accepted", paid: job.confirmed ? "Complete" : "Waiting for confirmation",
    cancelled: "Cancelled", disputed: "With the instructor" } as const)[job.state];
  if (job.isClaimant) return ({ open: null, claimed: job.claimedAt ? `Full pay until ${new Date(addDays(job.claimedAt, job.windowDays)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Tehran" })}` : "Deliver",
    changes: "Resubmit your delivery", delivered: "Waiting for review", accepted: "Waiting for payment", paid: job.confirmed ? "Complete" : "Confirm you received it",
    cancelled: "Cancelled", disputed: "With the instructor" } as const)[job.state];
  return null;
}

function JobCard({ job }: { job: JobSummary }) {
  const hint = nextHint(job);
  return <li className={`job-card${job.state === "open" ? " is-open" : ""}`}>
    <Pay job={job} />
    <h3><a href={`/collaborate/jobs/${job.id}`}>{job.title}</a></h3>
    <p className="job-by">{job.byInstructor ? <HexBadge tone="strong">Funded by {job.poster}</HexBadge> : <span className="mono">by {job.poster}</span>}
      <span className="mono quiet">{job.windowDays}-day window</span></p>
    {job.skills.length > 0 && <ul className="skills" aria-label="Skills">{job.skills.map(skill => <li key={skill}>{skill}</li>)}</ul>}
    <div className="job-foot">
      <StateBadge state={job.state} />
      {job.hidden && <HexBadge>Hidden</HexBadge>}
      <span className="mono quiet">{hint ?? (job.claimant ? `with ${job.claimant}` : <>Posted <Time iso={job.createdAt} dayOnly /></>)}</span>
    </div>
  </li>;
}

function Jobs({ board, mine }: { board: Board; mine: boolean }) {
  const [filters, setFilters] = useState({ money: false, share: false, funded: false, skill: "" });
  const skills = [...new Set(board.jobs.flatMap(job => job.skills))].sort();
  const match = (job: JobSummary) => (!filters.money || job.money !== null) && (!filters.share || job.share !== null) &&
    (!filters.funded || job.byInstructor) && (!filters.skill || job.skills.includes(filters.skill));
  const open = board.jobs.filter(job => job.state === "open");
  const shown = open.filter(match);
  const rest = board.jobs.filter(job => job.state !== "open" && match(job));
  const toggle = (key: "money" | "share" | "funded") => setFilters({ ...filters, [key]: !filters[key] });
  return <section className="list-section" aria-labelledby="jobs-title">
    <div className="section-head"><h2 id="jobs-title">{mine ? "My jobs" : "Open jobs"}</h2>{!mine && <span className="mono">{open.length} open</span>}
      <a className="button primary" href="#post">Post a job<Arrow /></a></div>
    <div className="view-switch" role="group" aria-label="Jobs view">
      <a href="#jobs" aria-current={!mine ? "true" : undefined}>Board</a>
      <a href="#mine" aria-current={mine ? "true" : undefined}>My jobs</a>
    </div>
    {mine ? <MyJobs board={board} /> : <>
      {board.jobs.length > 0 && <div className="filters" role="group" aria-label="Filter jobs">
        <button type="button" className="chip" aria-pressed={filters.money} onClick={() => toggle("money")}>Money</button>
        <button type="button" className="chip" aria-pressed={filters.share} onClick={() => toggle("share")}>Share</button>
        <button type="button" className="chip" aria-pressed={filters.funded} onClick={() => toggle("funded")}>Funded by {board.instructorNickname}</button>
        {skills.length > 0 && <label className="skill-filter"><span className="visually-hidden">Skill</span>
          <select value={filters.skill} onChange={event => setFilters({ ...filters, skill: event.target.value })} aria-label="Skill">
            <option value="">Any skill</option>{skills.map(skill => <option key={skill} value={skill}>{skill}</option>)}
          </select></label>}
      </div>}
      {open.length === 0 ? <EmptyState href="#post" action="Post a job" quiet>No open jobs. Post the first one.</EmptyState> :
        shown.length === 0 ? <p className="quiet">No open jobs match these filters.</p> :
        <ul className="job-list">{shown.map(job => <JobCard key={job.id} job={job} />)}</ul>}
      {rest.length > 0 && <details className="disclosure more-jobs"><summary>In progress and finished ({rest.length})</summary>
        <ul className="job-list">{rest.map(job => <JobCard key={job.id} job={job} />)}</ul>
      </details>}
      <p className="money-note">{MONEY_NOTE}</p>
    </>}
  </section>;
}

function JobRows({ title, jobs, empty }: { title: string; jobs: JobSummary[]; empty: string }) {
  return <div className="my-group">
    <h3>{title} <span className="mono quiet">{jobs.length}</span></h3>
    {jobs.length === 0 ? <p className="quiet">{empty}</p> : <ul className="job-rows">{jobs.map(job => <li key={job.id}>
      <a href={`/collaborate/jobs/${job.id}`}>{job.title}</a>
      <Pay job={job} />
      <span className="job-row-state"><StateBadge state={job.state} /><span className="mono quiet">{nextHint(job)}</span></span>
    </li>)}</ul>}
  </div>;
}

function MyJobs({ board }: { board: Board }) {
  const done = (job: JobSummary) => job.state === "cancelled" || (job.state === "paid" && job.confirmed);
  const posted = board.jobs.filter(job => job.isPoster);
  const claimed = board.jobs.filter(job => job.isClaimant);
  return <div className="my-jobs">
    {board.viewer === "member" ? <div className="my-stats">
      <HexCell className="stat-cell"><span className="mono">{board.completed}</span></HexCell>
      <p><strong>{board.completed === 1 ? "1 job completed" : `${board.completed} jobs completed`}</strong>
        <span className="quiet">{board.activeClaims} of 2 active claims in use</span></p>
    </div> : <JobRows title="Disputes to settle" jobs={board.jobs.filter(job => job.state === "disputed")} empty="No disputes right now." />}
    <JobRows title={board.viewer === "member" ? "Posted by you" : "Funded by you"} jobs={posted.filter(job => !done(job))} empty="Nothing posted right now." />
    {board.viewer === "member" && <JobRows title="Claimed by you" jobs={claimed.filter(job => !done(job))} empty="No claims right now. Pick one from the board." />}
    <JobRows title="History" jobs={[...posted, ...claimed].filter(done)} empty="Finished and cancelled jobs land here." />
  </div>;
}

function Post({ board }: { board: Board }) {
  return <section className="post-job" aria-labelledby="post-title">
    <BackLink href="#jobs">Back to jobs</BackLink>
    <h2 id="post-title">Post a job</h2>
    <p className="lead">Jobs go live as soon as you post them. Members see every job and its pay.</p>
    <JobForm projects={board.projects} instructor={board.viewer === "instructor"} />
  </section>;
}

function Teams({ board }: { board: Board }) {
  const empty = board.invitations.length === 0 && board.pending.length === 0 && board.teams.length === 0;
  if (empty) return <section className="list-section"><EmptyState href="/projects" action="Open your products" quiet>
    You are not on a team yet. Invite classmates from the Team &amp; shares section of your product page.</EmptyState></section>;
  return <div className="teams">
    {board.invitations.length > 0 && <section className="list-section" aria-labelledby="invites-title">
      <div className="section-head"><h2 id="invites-title">Invitations</h2><span className="mono">{board.invitations.length}</span></div>
      <ul className="team-list">{board.invitations.map(invite => <li key={invite.projectId} className="team-item">
        <p><strong>{invite.owner}</strong> invited you to <a href={`/projects/${invite.projectId}#team`}>{invite.projectTitle}</a> as <strong>{invite.role}</strong>.</p>
        <div className="form-actions">
          <ActionForm action="team_accept" fields={{ projectId: invite.projectId, from: "teams" }}>Join the team</ActionForm>
          <ActionForm action="team_decline" fields={{ projectId: invite.projectId, from: "teams" }}>Decline</ActionForm>
        </div>
      </li>)}</ul>
    </section>}
    {board.pending.length > 0 && <section className="list-section" aria-labelledby="pending-title">
      <div className="section-head"><h2 id="pending-title">Waiting for your answer</h2><span className="mono">{board.pending.length}</span></div>
      <ul className="team-list">{board.pending.map(item => <li key={item.agreementId} className="team-item">
        <p><strong>{item.owner}</strong> proposed version {item.version} of the share agreement for <a href={`/projects/${item.projectId}#team`}>{item.projectTitle}</a>.</p>
        <ShareBar lines={item.lines} />
        <AgreementTable lines={item.lines} decisions />
        <div className="form-actions">
          <ActionForm action="agreement_accept" fields={{ projectId: item.projectId, from: "teams", agreementId: item.agreementId, version: String(item.version) }}>Accept version {item.version}</ActionForm>
          <ActionForm action="agreement_decline" fields={{ projectId: item.projectId, from: "teams", agreementId: item.agreementId, version: String(item.version) }}>Decline</ActionForm>
        </div>
      </li>)}</ul>
    </section>}
    <section className="list-section" aria-labelledby="teams-title">
      <div className="section-head"><h2 id="teams-title">Your teams</h2><span className="mono">{board.teams.length}</span></div>
      {board.teams.length === 0 ? <p className="quiet">Join a team to see it here.</p> :
        <ul className="product-list">{board.teams.map(team => <li key={team.projectId} className="product-card team-summary">
          <div className="product-head"><h3><a href={`/projects/${team.projectId}#team`}>{team.projectTitle}</a></h3>
            {team.percent !== null && <span className="pay-hex"><span className="mono">{team.percent}%</span></span>}</div>
          <p className="mono quiet">{team.isOwner ? "You own it" : `${team.role} · owned by ${team.owner}`} · {team.teamSize} {team.teamSize === 1 ? "person" : "people"}</p>
          <p className="hint">{team.activeVersion ? `Agreement version ${team.activeVersion} is active.` : "No agreement yet. The owner holds 100%."}
            {team.pendingVersion ? ` Version ${team.pendingVersion} is waiting for answers.` : ""}</p>
          <a className="text-link" href={`/projects/${team.projectId}#team`}>Open team and shares</a>
        </li>)}</ul>}
    </section>
  </div>;
}
