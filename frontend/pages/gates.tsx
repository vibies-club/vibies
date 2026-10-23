import { useEffect, useState } from "react";
import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Card, EmptyState, MessageBanner, PageHeader } from "../ui";
import type { CourseSession, GateBoard } from "../../lib/course";
import { GateDetails, gateBadge } from "./course-pages";
import "../course.css";

type Member = GateBoard["members"][number];

const MESSAGES: Record<string, string> = {
  flagged: "Flagged as needs work. The member sees your note on the session page.",
  cleared: "Flag cleared. The item counts as done again.",
  unchanged: "Nothing changed. That item was not flagged.",
  missing: "That member is no longer approved.",
  error: "Something went wrong. Please try again.",
};

const cellKey = (nickname: string, n: number) => `cell-${encodeURIComponent(nickname)}-${n}`;

function counts(member: Member, session: CourseSession) {
  const checks = member.checks.filter(check => check.sessionNo === session.n && session.gate.some(item => item.id === check.itemId));
  const done = checks.filter(check => check.state === "done").length;
  return { done, flags: checks.length - done, total: session.gate.length };
}

function describe(member: Member, session: CourseSession) {
  const { done, flags, total } = counts(member, session);
  return `${member.nickname}, S${session.n}: ${done} of ${total} done${flags ? `, ${flags} need${flags === 1 ? "s" : ""} work` : ""}`;
}

function tone(member: Member, session: CourseSession) {
  const { done, flags, total } = counts(member, session);
  return flags ? "is-flagged" : done === total ? "is-complete" : done ? "is-partial" : "is-empty";
}

function Panel({ member, session, onClose }: { member: Member; session: CourseSession; onClose: () => void }) {
  return <Card title={`${member.nickname} · S${session.n} ${session.title}`} className="gate-panel">
    <ul className="gate-list gate-rows">{session.gate.map(item => {
      const check = member.checks.find(entry => entry.sessionNo === session.n && entry.itemId === item.id);
      const hidden = <><input type="hidden" name="member" value={member.nickname} /><input type="hidden" name="session" value={session.n} /><input type="hidden" name="item" value={item.id} /></>;
      return <li key={item.id} className="gate-row">
        <div className="gate-row-head"><span>{item.text}</span>{gateBadge(check?.state)}</div>
        <GateDetails check={check} />
        {check?.state === "needs_work" ?
          <form method="post" action="/course/action" className="inline-form">
            <input type="hidden" name="action" value="clear" />{hidden}
            <button type="submit" className="small" aria-label={`Clear flag: ${item.text}`}>Clear flag</button>
          </form> : check?.state === "done" &&
          <details className="gate-mark">
            <summary className="button small" aria-label={`Flag needs work: ${item.text}`}>Flag needs work</summary>
            <form method="post" action="/course/action" className="stack-form">
              <input type="hidden" name="action" value="flag" />{hidden}
              <label htmlFor={`flag-${item.id}`}>Note for {member.nickname}</label>
              <textarea id={`flag-${item.id}`} name="note" rows={2} maxLength={500} required />
              <button type="submit" className="small">Send back</button>
            </form>
          </details>}
      </li>;
    })}</ul>
    <button type="button" className="link-button" onClick={onClose}>Close</button>
  </Card>;
}

export function GatesPage({ data, search }: { data: PageData; search: URLSearchParams }) {
  const [open, setOpen] = useState(() => window.location.hash.slice(1));
  const [early, setEarly] = useState(false);
  useEffect(() => {
    // Move focus to the opened cell so keyboard and screen reader users land on its items.
    const heading = document.querySelector<HTMLElement>("#gate-panel h2");
    if (!open || !heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    document.getElementById("gate-panel")?.scrollIntoView({ block: "start" });
  }, [open]);
  if (data.kind !== "ok" || data.access.kind !== "instructor") return <AppShell data={data}><Retry href="/admin/gates" /></AppShell>;
  const course = data.course, board = data.gateBoard;
  const message = MESSAGES[search.get("message") ?? ""];
  const select = (key: string) => { setOpen(key); history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${key}`); };
  const close = () => { setOpen(""); history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); };
  const header = <PageHeader title="Gates" lead="Each cell shows how many gate items a member has ticked. Open a cell to check proof links and send an item back." />;
  if (!course || !board) return <AppShell data={data}>{header}<EmptyState href="/course" action="Open the course">Slides are not published yet, so there are no gates to review.</EmptyState></AppShell>;
  const gated = course.sessions.filter(session => session.gate.length > 0);
  const selected = board.members.flatMap(member => gated.map(session => ({ member, session }))).find(cell => cellKey(cell.member.nickname, cell.session.n) === open);
  // ponytail: S12 starts the build-your-product arc, so the grid opens there; earlier sessions are one tap away.
  const showEarly = early || (selected !== undefined && selected.session.n < 12);
  const sessions = showEarly ? gated : gated.filter(session => session.n >= 12);
  const hasEarly = gated.some(session => session.n < 12);
  return <AppShell data={data}>
    {header}
    {message && <MessageBanner>{message}</MessageBanner>}
    {board.members.length === 0 ? <EmptyState href="/admin/members" action="Review members">No approved members yet.</EmptyState> : <>
      {hasEarly && <button type="button" className="link-button board-toggle" aria-expanded={showEarly} onClick={() => setEarly(!showEarly)}>{showEarly ? "Hide S1 to S11" : "Show S1 to S11"}</button>}
      <div className="board-scroll">
        <table className="board">
          <thead><tr><th scope="col">Member</th>{sessions.map(session => <th key={session.n} scope="col"><a href={`/course/${session.n}`} title={session.title}>S{session.n}</a></th>)}</tr></thead>
          <tbody>{board.members.map(member => <tr key={member.nickname}>
            <th scope="row">{member.nickname}</th>
            {sessions.map(session => {
              const key = cellKey(member.nickname, session.n), { done, flags, total } = counts(member, session);
              return <td key={session.n}><button type="button" className={`board-cell ${tone(member, session)}`} aria-pressed={open === key} aria-label={describe(member, session)} onClick={() => select(key)}>
                {done}/{total}{flags > 0 && <span className="board-flag" aria-hidden="true">{flags}</span>}
              </button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <ul className="board-list">{board.members.map(member => <li key={member.nickname} className="card">
        <div className="card-bar"><h2>{member.nickname}</h2></div>
        <ul className="board-list-cells">{sessions.map(session => {
          const key = cellKey(member.nickname, session.n), { done, flags, total } = counts(member, session);
          return <li key={session.n}><button type="button" className={`board-row ${tone(member, session)}`} aria-pressed={open === key} aria-label={describe(member, session)} onClick={() => select(key)}>
            <span className="mono">S{session.n}</span><span className="mono">{done}/{total}</span>
            {flags > 0 && <span className="board-flag" aria-hidden="true">{flags}</span>}
          </button></li>;
        })}</ul>
      </li>)}</ul>
      <div id="gate-panel">{selected && <Panel member={selected.member} session={selected.session} onClose={close} />}</div>
    </>}
  </AppShell>;
}
