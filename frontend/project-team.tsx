import { useId, useState } from "react";
import type { PageData } from "./contracts";
import type { Agreement, AgreementLineView, Team } from "../lib/collab-read";
import { HexBadge } from "./ui";
import { ActionForm, AGREEMENT_NOTE, CollabMessage, SPLIT_HINT, Time } from "./collab-ui";

const tones = ["var(--honey)", "var(--amber)", "var(--gold-hi)", "var(--comb-line)", "var(--honey-edge)", "var(--cell-fill)", "var(--rule-warm)", "var(--honey-accent)", "var(--ground-2)"];

/** A stacked honey bar: one segment per line, in the same order as the table. */
export function ShareBar({ lines }: { lines: Pick<AgreementLineView, "nickname" | "percent">[] }) {
  return <div className="share-bar" role="img" aria-label={lines.map(line => `${line.nickname} ${line.percent}%`).join(", ")}>
    {lines.map((line, index) => <span key={line.nickname} style={{ width: `${line.percent}%`, background: tones[index % tones.length] }} />)}
  </div>;
}

export function AgreementTable({ lines, decisions }: { lines: AgreementLineView[]; decisions?: boolean }) {
  return <table className="agreement-table">
    <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col" className="num">Share</th>{decisions && <th scope="col">Answer</th>}</tr></thead>
    <tbody>{lines.map((line, index) => <tr key={line.nickname}>
      <th scope="row"><span className="swatch" style={{ background: tones[index % tones.length] }} aria-hidden="true" />{line.nickname}
        {line.brings && <span className="brings">{line.brings}</span>}</th>
      <td>{line.role}</td>
      <td className="num mono">{line.percent}%</td>
      {decisions && <td>{line.decision === "accepted" ? <HexBadge tone="strong">Accepted</HexBadge> : line.decision === "declined" ? <HexBadge>Declined</HexBadge> : <HexBadge tone="muted">Waiting</HexBadge>}</td>}
    </tr>)}</tbody>
  </table>;
}

const statusWords: Record<Agreement["status"], string> = { pending: "Waiting", active: "Active", superseded: "Replaced by a newer version", declined: "Declined", replaced: "Withdrawn for a newer proposal" };
function sourceLine(agreement: Agreement) {
  return agreement.source === "job" ? <>Paid out by the job <a href={`/collaborate/jobs/${agreement.jobId}`}>{agreement.jobTitle}</a>.</> : "Proposed by the owner.";
}

type Row = { nickname: string; role: string; percent: string; brings: string };
/** The owner's proposal editor. Leaving teammates drop out and their share goes to the owner by default. */
function Proposal({ team }: { team: Team }) {
  const uid = useId();
  const base = team.active?.lines ?? [{ nickname: team.owner, role: "Owner", percent: 100, brings: null, decision: null }];
  const members = [team.owner, ...team.team.filter(member => member.status === "active").map(member => member.nickname)];
  const kept = base.filter(line => members.includes(line.nickname));
  const freed = base.filter(line => !members.includes(line.nickname)).reduce((sum, line) => sum + line.percent, 0);
  const start: Row[] = members.map(name => {
    const line = kept.find(item => item.nickname === name);
    const role = line?.role ?? (name === team.owner ? "Owner" : team.team.find(member => member.nickname === name)?.role ?? "Teammate");
    const percent = (line?.percent ?? 0) + (name === team.owner ? freed : 0);
    return { nickname: name, role, percent: percent ? String(percent) : "", brings: line?.brings ?? "" };
  });
  const [rows, setRows] = useState(start);
  const total = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const set = (index: number, key: keyof Row, value: string) => setRows(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const equal = () => {
    const share = Math.floor(100 / rows.length), rest = 100 - share * rows.length;
    setRows(rows.map((row, index) => ({ ...row, percent: String(share + (index < rest ? 1 : 0)) })));
  };
  return <form action="/collaborate/action" method="post" className="proposal">
    <input type="hidden" name="action" value="agreement_propose" />
    <input type="hidden" name="projectId" value={team.projectId} />
    <input type="hidden" name="from" value="project" />
    <input type="hidden" name="basis" value={String(team.latestVersion)} />
    <p className="hint">{SPLIT_HINT} Leave a share empty to leave that person out of this version.</p>
    <div className="proposal-rows">
      {rows.map((row, index) => <fieldset key={row.nickname} className="proposal-row">
        <legend>{row.nickname}{row.nickname === team.owner ? " (owner)" : ""}</legend>
        <input type="hidden" name={`member${index + 1}`} value={row.nickname} />
        <label htmlFor={`${uid}-r${index}`}>Role</label>
        <input id={`${uid}-r${index}`} name={`role${index + 1}`} value={row.role} maxLength={40} required onChange={event => set(index, "role", event.target.value)} />
        <label htmlFor={`${uid}-p${index}`}>Share</label>
        <div className="affix"><input id={`${uid}-p${index}`} name={`percent${index + 1}`} type="number" inputMode="numeric" min={0} max={100} step={1}
          value={row.percent} onChange={event => set(index, "percent", event.target.value)} className="short" /><span className="mono" aria-hidden="true">%</span></div>
        <label htmlFor={`${uid}-b${index}`}>What they bring (optional)</label>
        <input id={`${uid}-b${index}`} name={`brings${index + 1}`} value={row.brings} maxLength={200} onChange={event => set(index, "brings", event.target.value)} />
      </fieldset>)}
    </div>
    <div className="proposal-total">
      <ShareBar lines={rows.filter(row => Number(row.percent) > 0).map(row => ({ nickname: row.nickname, percent: Math.min(100, Number(row.percent)) }))} />
      <p className="mono" role="status">Total {total}%{total === 100 ? ". Ready to propose." : `. It must be exactly 100%.`}</p>
    </div>
    <div className="form-actions">
      <button type="button" onClick={equal}>Split equally</button>
      <button type="submit" disabled={total !== 100}>Propose version {team.latestVersion + 1}</button>
    </div>
  </form>;
}

/** Team & shares on the product page, after the roadmap. */
export function ProjectTeam({ data, search }: { data: PageData; search: URLSearchParams }) {
  const team = data.team;
  if (data.project?.kind !== "ok") return null;
  if (!team) return <section className="card team-card" id="team" aria-labelledby="team-title">
    <div className="card-bar"><h2 id="team-title">Team &amp; shares</h2></div>
    <div className="card-body"><p className="quiet">We could not load the team right now. Reload the page to try again.</p></div>
  </section>;
  const fields = { projectId: team.projectId, from: "project" };
  const active = team.active, pending = team.pending;
  return <section className="card team-card" id="team" aria-labelledby="team-title">
    <div className="card-bar"><h2 id="team-title">Team &amp; shares</h2>{active && <span className="card-meta">Version {active.version} active</span>}</div>
    <div className="card-body">
      <CollabMessage message={search.get("message")} only="team" />
      {team.myStatus === "invited" && <div className="invite-callout">
        <p><strong>{team.owner} invited you to this team as {team.myRole}.</strong> Joining lets the owner include you in the share agreement.</p>
        <div className="form-actions">
          <ActionForm action="team_accept" fields={fields} primary>Join the team</ActionForm>
          <ActionForm action="team_decline" fields={fields}>Decline</ActionForm>
        </div>
      </div>}
      <ul className="roster">
        <li><span className="roster-hex" aria-hidden="true">{team.owner.slice(0, 1)}</span><span><strong>{team.owner}</strong><span className="mono quiet">Owner</span></span></li>
        {team.team.map(member => <li key={member.nickname}>
          <span className="roster-hex" aria-hidden="true">{member.nickname.slice(0, 1)}</span>
          <span><strong>{member.nickname}</strong><span className="mono quiet">{member.role}{member.completed > 0 ? ` · ${member.completed} ${member.completed === 1 ? "job" : "jobs"} completed` : ""}</span></span>
          {member.status === "invited" && <HexBadge tone="muted">Invited</HexBadge>}
          {team.isOwner && <details className="disclosure roster-more"><summary>Remove</summary>
            <ActionForm action="team_remove" fields={{ ...fields, member: member.nickname }} confirm={`Remove ${member.nickname} from the team.`}>Remove {member.nickname}</ActionForm>
          </details>}
        </li>)}
      </ul>
      {team.team.length === 0 && team.isOwner && <p className="quiet">No teammates yet. Invite a classmate below.</p>}
      {team.isOwner && team.candidates && team.candidates.length > 0 && <form action="/collaborate/action" method="post" className="invite-form">
        <input type="hidden" name="action" value="team_invite" />
        <input type="hidden" name="projectId" value={team.projectId} />
        <input type="hidden" name="from" value="project" />
        <div><label htmlFor="invite-member">Invite</label>
          <select id="invite-member" name="member" required defaultValue=""><option value="" disabled>Choose a member</option>
            {team.candidates.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
        <div><label htmlFor="invite-role">Role</label><input id="invite-role" name="role" required maxLength={40} placeholder="Designer" /></div>
        <button type="submit">Send invite</button>
      </form>}
      {team.myStatus === "active" && <details className="disclosure"><summary>Leave this team</summary>
        <p className="hint">Your current share line stays in the active version until the owner proposes a new one.</p>
        <ActionForm action="team_leave" fields={fields} confirm="I want to leave this team.">Leave team</ActionForm>
      </details>}

      {!team.insider ? <p className="hint">The share agreement is visible to the team and the instructor.</p> : <div className="agreement">
        <h3>Share agreement</h3>
        <p className="agreement-note">{AGREEMENT_NOTE}</p>
        {active ? <>
          <ShareBar lines={active.lines} />
          <AgreementTable lines={active.lines} />
          <p className="hint">Version {active.version}, active since <Time iso={active.activatedAt!} /> Tehran time. {sourceLine(active)}</p>
        </> : <p className="quiet">No agreement yet, so {team.owner} holds 100% for now.</p>}
        {team.openShareJobs > 0 && <p className="hint">Open jobs promise {team.openShareJobs}% from the owner's line. Accepted share jobs activate a new version at once.</p>}
        {pending && <div className="pending">
          <h4>Version {pending.version} is waiting for answers</h4>
          <ShareBar lines={pending.lines} />
          <AgreementTable lines={pending.lines} decisions />
          {team.myChange && <p className="share-change"><strong>Version {pending.version} changes your share</strong> from {team.myChange.from}% to {team.myChange.to}%. It needs your answer before it can activate.</p>}
          {team.myDecision === "needed" && <div className="form-actions">
            <ActionForm action="agreement_accept" fields={{ ...fields, agreementId: pending.id, version: String(pending.version) }} primary>Accept version {pending.version}</ActionForm>
            <ActionForm action="agreement_decline" fields={{ ...fields, agreementId: pending.id, version: String(pending.version) }}>Decline</ActionForm>
          </div>}
          <p className="hint">It becomes active when everyone listed, and anyone whose share it lowers, accepts. One decline voids it.</p>
        </div>}
        {team.isOwner && <details className="disclosure" open={!active && !pending && team.team.some(member => member.status === "active")}>
          <summary>{pending ? `Replace version ${pending.version} with a new proposal` : "Propose a new version"}</summary>
          <Proposal team={team} />
        </details>}
        {team.history.length > 0 && <details className="disclosure"><summary>History ({team.history.length})</summary>
          <ol className="history">{team.history.map(item => <li key={item.id}>
            <p><strong>Version {item.version}</strong> <span className="mono quiet">{statusWords[item.status]}</span></p>
            <p className="hint">{item.activatedAt ? <>Active from <Time iso={item.activatedAt} /></> : <>Proposed <Time iso={item.createdAt} /></>}{item.closedAt && <> until <Time iso={item.closedAt} /></>}. {sourceLine(item)}</p>
            <p className="mono history-lines">{item.lines.map(line => `${line.nickname} ${line.percent}%`).join(" · ")}</p>
          </li>)}</ol>
        </details>}
      </div>}
    </div>
  </section>;
}
