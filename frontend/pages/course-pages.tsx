import { useState } from "react";
import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, BackLink, Card, EmptyState, HexBadge, HexCell, PageHeader } from "../ui";
import { localToday, nextSession, type CourseManifest, type CourseSession, type GateCheck } from "../../lib/course";
import "../course.css";

type PageProps = { data: PageData; search: URLSearchParams };
type Stage = "done" | "next" | "planned";

const UNPUBLISHED = "Slides are not published yet. Check back after the next class.";

export function shortDate(date: string | null) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Date to be set";
}

function rowMeta(session: CourseSession, stage: Stage) {
  return session.date || stage !== "done" ? `S${session.n} · ${shortDate(session.date)}` : `S${session.n}`;
}

/** Sessions before the next class count as done, even the early ones without a date. */
function stage(session: CourseSession, next: CourseSession | null): Stage {
  if (!next) return "planned";
  return session.n < next.n ? "done" : session.n === next.n ? "next" : "planned";
}

function Node({ n, stage }: { n: number; stage: Stage }) {
  return <svg className="timeline-node" viewBox="0 0 44 38" width="44" height="38" aria-hidden="true">
    <polygon points="11.5,1.5 32.5,1.5 42.5,19 32.5,36.5 11.5,36.5 1.5,19" />
    <text x="22" y="23.5" textAnchor="middle">{stage === "done" ? "✓" : n}</text>
  </svg>;
}

function signedIn(data: PageData) {
  return data.kind === "ok" && (data.access.kind === "member" || data.access.kind === "instructor");
}

export function CoursePage({ data }: PageProps) {
  if (!signedIn(data)) return <AppShell data={data}><Retry href="/course" /></AppShell>;
  const course = data.course;
  const today = localToday();
  const next = course ? nextSession(course, today) : null;
  return <AppShell data={data}>
    <PageHeader title="Course" lead="Every session from your first idea to Demo Day. Tap one for its slides, gate and prompts.">
      {next && <a className="text-link" href={`#session-${next.n}`}>Jump to S{next.n}, the next class</a>}
    </PageHeader>
    {!course ? <EmptyState href="/welcome" action="Back to Home">{UNPUBLISHED}</EmptyState> :
      <div className="phases">{course.phases.map(phase => {
        const sessions = course.sessions.filter(session => session.phase === phase.id);
        if (sessions.length === 0) return null;
        return <section key={phase.id} className="phase" aria-labelledby={`phase-${phase.id}`}>
          <div className="phase-head">
            <h2 id={`phase-${phase.id}`}>{phase.title}</h2>
            <span className="mono">{sessions.length === 1 ? `S${sessions[0].n}` : `S${sessions[0].n} to S${sessions.at(-1)!.n}`}</span>
          </div>
          <ol className="timeline">{sessions.map(session => <TimelineRow key={session.n} session={session} stage={stage(session, next)} today={today} />)}</ol>
        </section>;
      })}</div>}
  </AppShell>;
}

function TimelineRow({ session, stage, today }: { session: CourseSession; stage: Stage; today: string }) {
  const label = stage === "done" ? "Done" : stage === "next" ? (session.date === today ? "Today" : "Next class") : "Planned";
  return <li className={`timeline-row is-${stage}`} id={`session-${session.n}`}>
    <a href={`/course/${session.n}`} aria-current={stage === "next" ? "step" : undefined}>
      <Node n={session.n} stage={stage} />
      <span className="timeline-body">
        <span className="timeline-meta mono">{rowMeta(session, stage)}</span>
        <span className="timeline-title">{session.title}</span>
        {stage === "next" && <span className="timeline-goal">{session.goal}</span>}
      </span>
      {stage === "next" ? <HexBadge tone="strong">{label}</HexBadge> : <span className="sr-only">{label}</span>}
    </a>
  </li>;
}

function gateBadge(checks: GateCheck[], n: number, id: string) {
  const state = checks.find(check => check.sessionNo === n && check.itemId === id)?.state;
  return state === "done" ? <HexBadge tone="strong">Done</HexBadge> : state === "needs_work" ? <HexBadge>Needs work</HexBadge> : <HexBadge tone="muted">To do</HexBadge>;
}

function CopyPrompt({ file, label }: { file: string; label: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    const text = fetch(`/course-files/prompts/${file}`, { credentials: "same-origin", cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("Unavailable"); return response.text(); });
    try {
      // Safari only keeps the click's permission if the clipboard write starts before the download finishes.
      try { await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then(value => new Blob([value], { type: "text/plain" })) })]); }
      catch { await navigator.clipboard.writeText(await text); }
      setMessage("Copied.");
    } catch {
      setMessage("Could not copy. Open the prompt and copy it from there.");
    }
  }
  return <>
    <button type="button" className="small" onClick={copy} aria-label={`Copy ${label}`}>Copy</button>
    <span className="prompt-status mono" role="status">{message}</span>
  </>;
}

function Pager({ course, session }: { course: CourseManifest; session: CourseSession }) {
  const index = course.sessions.findIndex(item => item.n === session.n);
  const previous = course.sessions[index - 1], next = course.sessions[index + 1];
  return <nav className="session-pager" aria-label="Other sessions">
    {previous ? <a href={`/course/${previous.n}`} className="pager-link is-previous"><span className="mono">Previous · S{previous.n}</span><span>{previous.title}</span></a> : <span />}
    {next && <a href={`/course/${next.n}`} className="pager-link is-next"><span className="mono">Next · S{next.n}</span><span>{next.title}</span></a>}
  </nav>;
}

export function SessionPage({ data }: PageProps) {
  const n = Number(window.location.pathname.slice("/course/".length));
  if (!signedIn(data)) return <AppShell data={data}><Retry href={`/course/${n}`} /></AppShell>;
  const course = data.course, session = data.session;
  if (!course || !session) return <AppShell data={data}>
    <BackLink href="/course">All sessions</BackLink>
    <PageHeader title={`Session ${n}`} />
    {course ? <EmptyState href="/course" action="See all sessions">Session {n} is not on the course plan.</EmptyState> :
      <EmptyState href="/welcome" action="Back to Home">{UNPUBLISHED}</EmptyState>}
  </AppShell>;
  const phase = course.phases.find(item => item.id === session.phase)?.title;
  const checks = data.gates?.mine ?? [];
  return <AppShell data={data}>
    <BackLink href="/course">All sessions</BackLink>
    <div className="session-head">
      <HexCell className="session-cell"><span className="mono">S{session.n}</span></HexCell>
      <div className="session-intro">
        <p className="session-meta mono">{phase} · {shortDate(session.date)}</p>
        <h1>{session.title}</h1>
        {session.goal && <p className="lead">{session.goal}</p>}
        {session.deck ? <a className="button primary" href={`/course-files/decks/${session.deck}`} target="_blank" rel="noopener">Open slides<Arrow /></a> :
          <p className="hint">Slides for S{session.n} are not published yet.</p>}
      </div>
    </div>
    <div className="session-grid">
      <Card title="Gate" meta={session.gate.length ? `${session.gate.length} ${session.gate.length === 1 ? "item" : "items"}` : undefined} className="session-gate">
        {session.gate.length === 0 ? <p className="quiet">No gate for this session.</p> :
          <ul className="gate-list">{session.gate.map(item => <li key={item.id}><span>{item.text}</span>{gateBadge(checks, session.n, item.id)}</li>)}</ul>}
      </Card>
      <Card title="Prompts" className="session-prompts">
        {session.prompts.length === 0 ? <p className="quiet">No prompts for this session.</p> :
          <ul className="prompt-list">{session.prompts.map(prompt => <li key={prompt.file}>
            <span className="prompt-label">{prompt.label}</span>
            <span className="prompt-actions">
              <a className="button small" href={`/course-files/prompts/${prompt.file}`} target="_blank" rel="noopener" aria-label={`Open ${prompt.label}`}>Open</a>
              <CopyPrompt file={prompt.file} label={prompt.label} />
            </span>
          </li>)}</ul>}
      </Card>
    </div>
    <Pager course={course} session={session} />
  </AppShell>;
}
