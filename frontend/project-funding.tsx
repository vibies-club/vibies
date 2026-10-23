import type { PageData } from "./contracts";
import { HexBadge, Progress } from "./ui";
import { ActionForm, CollabMessage, Time, usd } from "./collab-ui";

const FUNDING_NOTE = "Pledges are promises. Vibies records them and never moves money. The owner marks a pledge received once it arrives outside the site.";

/** Funding on the product page, after Team & shares. */
export function ProjectFunding({ data, search }: { data: PageData; search: URLSearchParams }) {
  const funding = data.funding;
  if (data.project?.kind !== "ok" || !funding) return null;
  if (!funding.isOwner && !funding.seeking && funding.pledged === 0) return null;
  const fields = { projectId: funding.projectId };
  const open = funding.pledges.filter(pledge => pledge.status === "pledged");
  return <section className="card funding-card" id="funding" aria-labelledby="funding-title">
    <div className="card-bar"><h2 id="funding-title">Funding</h2>{funding.seeking ? <HexBadge tone="strong">Seeking funding</HexBadge> : <span className="card-meta">Not seeking</span>}</div>
    <div className="card-body">
      <CollabMessage message={search.get("message")} only="funding" />
      {(funding.seeking || funding.pledged > 0) && <>
        {funding.goal !== null && <Progress value={Math.min(100, Math.round(funding.pledged * 100 / funding.goal))} label="Pledged toward the goal"
          detail={`${usd(funding.pledged)} of ${usd(funding.goal)}`} />}
        <dl className="facts">
          <dt>Pledged</dt><dd>{usd(funding.pledged)} from {funding.backers} {funding.backers === 1 ? "backer" : "backers"}</dd>
          <dt>Received</dt><dd>{usd(funding.received)}</dd>
        </dl>
      </>}
      <p className="money-note">{FUNDING_NOTE}</p>
      {!funding.isOwner && funding.seeking && <form action="/collaborate/action" method="post" className="stack-form">
        <input type="hidden" name="action" value="pledge_post" /><input type="hidden" name="projectId" value={funding.projectId} />
        <label htmlFor="pledge-amount">Pledge in US dollars</label>
        <div className="affix"><span className="mono" aria-hidden="true">$</span>
          <input id="pledge-amount" name="amount" type="number" inputMode="numeric" min={1} max={1000000} step={1} required className="short" /></div>
        <label htmlFor="pledge-note">Note (optional)</label>
        <input id="pledge-note" name="note" maxLength={500} placeholder="What it is for, or when you can send it" />
        <button type="submit" className="primary">Pledge</button>
      </form>}
      {funding.pledges.length > 0 && <div className="pledges">
        <h3>{funding.isOwner ? "Pledges" : "Your pledges"}</h3>
        <ul className="job-rows">{funding.pledges.map(pledge => <li key={pledge.id}>
          <span><strong className="mono strong-mono">{usd(pledge.amount)}</strong> {funding.isOwner && <>from <strong>{pledge.pledger}</strong> </>}
            <span className="mono quiet"><Time iso={pledge.at} dayOnly /></span></span>
          <span className="job-row-state">
            {pledge.status === "received" ? <HexBadge tone="strong">Received</HexBadge> : pledge.status === "withdrawn" ? <HexBadge tone="muted">Withdrawn</HexBadge> : <HexBadge>Pledged</HexBadge>}
            {pledge.status === "pledged" && funding.isOwner && <ActionForm action="pledge_received" fields={{ ...fields, pledgeId: pledge.id }}>Mark received</ActionForm>}
            {pledge.status === "pledged" && pledge.mine && <ActionForm action="pledge_withdraw" fields={{ ...fields, pledgeId: pledge.id }}>Withdraw</ActionForm>}
          </span>
          {pledge.note && <span className="hint">{pledge.note}</span>}
        </li>)}</ul>
        {funding.isOwner && open.length > 0 && <p className="hint">{open.length} {open.length === 1 ? "pledge is" : "pledges are"} still open.</p>}
      </div>}
      {funding.isOwner && <details className="disclosure">
        <summary>{funding.seeking ? "Change the goal or stop seeking" : "Seek funding"}</summary>
        <form action="/collaborate/action" method="post" className="stack-form">
          <input type="hidden" name="action" value="funding_set" /><input type="hidden" name="projectId" value={funding.projectId} />
          <input type="hidden" name="version" value={funding.version} />
          <label className="check"><input type="checkbox" name="seeking" value="yes" defaultChecked={funding.seeking || !funding.goal} /> Seeking funding</label>
          <label htmlFor="funding-goal">Goal in US dollars</label>
          <div className="affix"><span className="mono" aria-hidden="true">$</span>
            <input id="funding-goal" name="goal" type="number" inputMode="numeric" min={1} max={1000000} step={1} defaultValue={funding.goal ?? ""} className="short" /></div>
          <p className="hint">Classmates and the Instructor see the goal and the totals. Only you see who pledged.</p>
          <button type="submit">Save</button>
        </form>
      </details>}
    </div>
  </section>;
}
