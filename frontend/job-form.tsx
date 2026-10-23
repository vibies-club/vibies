import { useId, useState } from "react";
import { DELIVERABLES } from "../lib/collab-core";
import type { JobDetail, LinkableProject } from "../lib/collab-read";
import { MONEY_NOTE, usd } from "./collab-ui";

/** Plain-language payout rules with the numbers this job would pay. */
export function TierTable({ windowDays, money, share, projectTitle }: { windowDays: number; money: number | null; share: number | null; projectTitle?: string | null }) {
  const pay = (tier: number) => [money !== null ? usd(Math.floor(money * tier / 100)) : null,
    share !== null ? `${Math.floor(share * tier / 100)}%${projectTitle ? ` of ${projectTitle}` : ""}` : null].filter(Boolean).join(" + ") || `${tier}%`;
  return <div className="tiers">
    <ol className="tier-list">
      <li className="is-full"><span className="tier-hex mono">100%</span><span><strong>Delivered within {windowDays} {windowDays === 1 ? "day" : "days"}</strong><span className="mono">{pay(100)}</span></span></li>
      <li><span className="tier-hex mono">50%</span><span><strong>Delivered within {windowDays * 2} days</strong><span className="mono">{pay(50)}</span></span></li>
      <li className="is-none"><span className="tier-hex mono">0%</span><span><strong>After that</strong><span>The claim ends and the job opens again.</span></span></li>
    </ol>
    <p className="hint">The clock starts at claim. The first delivery locks the tier. After a change request, resubmit within 3 days to keep it. Amounts round down to whole dollars and whole percents.</p>
  </div>;
}

export function JobForm({ projects, instructor, job }: { projects: LinkableProject[]; instructor: boolean; job?: JobDetail }) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const [windowDays, setWindow] = useState(job?.windowDays ?? 7);
  const [money, setMoney] = useState(job?.money !== null && job?.money !== undefined ? String(job.money) : "");
  const [share, setShare] = useState(job?.share ? String(job.share) : "");
  const [project, setProject] = useState(job?.projectId ?? "");
  const chosen = projects.find(p => p.id === project);
  const owned = projects.filter(p => p.line !== null);
  const moneyValue = /^\d{1,7}$/.test(money) && Number(money) >= 1 ? Number(money) : null;
  const shareValue = /^\d{1,3}$/.test(share) && Number(share) >= 1 && Number(share) <= 100 ? Number(share) : null;
  const criteria = job?.criteria ?? [];
  const criterion = (n: number) => <input key={n} id={n === 1 ? f("c1") : undefined} name={`criterion${n}`} required={n === 1} maxLength={200}
    defaultValue={criteria[n - 1] ?? ""} aria-label={`Criterion ${n}`} placeholder={n === 1 ? "The habit screen has a dark mode toggle" : undefined} />;
  return <form action="/collaborate/action" method="post" className="job-form">
    <input type="hidden" name="action" value={job ? "job_edit" : "job_post"} />
    {job && <><input type="hidden" name="id" value={job.id} /><input type="hidden" name="version" value={job.version} /></>}
    <fieldset>
      <legend>The job</legend>
      <label htmlFor={f("title")}>Title</label>
      <input id={f("title")} name="title" required maxLength={80} defaultValue={job?.title} aria-describedby={f("title-hint")} />
      <p id={f("title-hint")} className="hint">One clear outcome, 1 to 80 characters. Use nicknames only.</p>
      <label htmlFor={f("description")}>What needs doing</label>
      <textarea id={f("description")} name="description" required rows={5} maxLength={2000} defaultValue={job?.description} />
      <label htmlFor={f("c1")}>Done when</label>
      <p className="hint">The checklist the poster reviews against. 1 to 10 items.</p>
      <div className="criteria-inputs">{[1, 2, 3].map(criterion)}</div>
      <details className="disclosure" open={criteria.length > 3}><summary>More criteria</summary>
        <div className="criteria-inputs">{[4, 5, 6, 7, 8, 9, 10].map(criterion)}</div>
      </details>
      <fieldset className="choice">
        <legend>Deliver as</legend>
        {Object.entries(DELIVERABLES).map(([value, label], index) => <label key={value} className="check">
          <input type="radio" name="deliverable" value={value} required defaultChecked={job ? job.deliverable === value : index === 0} /> {label}
        </label>)}
      </fieldset>
      <label htmlFor={f("window")}>Time window in days</label>
      <input id={f("window")} name="windowDays" type="number" inputMode="numeric" min={1} max={30} required value={windowDays}
        onChange={event => setWindow(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="short" />
    </fieldset>
    <fieldset>
      <legend>Pay</legend>
      <p className="hint">Money, a share of {instructor ? "a product" : "your product"}, or both.{instructor ? " Instructor jobs pay money only." : ""}</p>
      <label htmlFor={f("money")}>Money in US dollars</label>
      <div className="affix"><span className="mono" aria-hidden="true">$</span>
        <input id={f("money")} name="money" type="number" inputMode="numeric" min={1} max={1000000} step={1} value={money} onChange={event => setMoney(event.target.value)} className="short" /></div>
      {!instructor && <>
        <label htmlFor={f("share")}>Share in whole percent</label>
        <div className="affix"><input id={f("share")} name="share" type="number" inputMode="numeric" min={1} max={100} step={1} value={share}
          onChange={event => setShare(event.target.value)} className="short" disabled={owned.length === 0} aria-describedby={f("share-hint")} /><span className="mono" aria-hidden="true">%</span></div>
        <p id={f("share-hint")} className="hint">{owned.length === 0 ? "Connect a product to offer a share of it." :
          chosen?.line !== null && chosen?.line !== undefined ? `Paid from your own line on ${chosen.title}. Your line today: ${chosen.line}%.` : "Pick the product below. The share comes from your own line."}</p>
      </>}
    </fieldset>
    <fieldset>
      <legend>{instructor ? "Product (optional)" : "Product and milestone"}</legend>
      <label htmlFor={f("project")}>{instructor ? "Help a product" : "Product"}</label>
      <select id={f("project")} name="projectId" value={project} onChange={event => setProject(event.target.value)} required={shareValue !== null}>
        <option value="">{shareValue !== null ? "Choose the product for the share" : "No product"}</option>
        {(instructor ? projects : owned).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
      {chosen && chosen.milestones.length > 0 && <>
        <label htmlFor={f("milestone")}>Milestone (optional)</label>
        <select id={f("milestone")} name="milestoneId" defaultValue={job?.projectId === chosen.id ? job.milestoneId ?? "" : ""} key={chosen.id}>
          <option value="">No milestone</option>
          {chosen.milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </>}
      <label htmlFor={f("skills")}>Skills (optional)</label>
      <input id={f("skills")} name="skills" maxLength={200} defaultValue={job?.skills.join(", ")} placeholder="css, react" aria-describedby={f("skills-hint")} />
      <p id={f("skills-hint")} className="hint">Up to 5 tags, separated by commas.</p>
    </fieldset>
    <section className="tier-preview" aria-label="Payout tiers">
      <h3>How payout works</h3>
      <TierTable windowDays={windowDays} money={moneyValue} share={shareValue} projectTitle={chosen?.title} />
      <p className="money-note">{MONEY_NOTE}</p>
    </section>
    <button type="submit" className="primary">{job ? "Save job" : "Post job"}</button>
  </form>;
}
