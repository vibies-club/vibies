import type { ReactNode } from "react";
import type { PageData } from "../contracts";
import type { JobDetail, JobEvent, JobPage as JobData } from "../../lib/collab-read";
import { DELIVERABLES, tierAt, payout } from "../../lib/collab-core";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { BackLink, Card, EmptyState, HexBadge, PageHeader } from "../ui";
import { ActionForm, addDays, CollabMessage, JobComb, MONEY_NOTE, Pay, StateBadge, tehranToday, Time, usd } from "../collab-ui";
import { JobForm, TierTable } from "../job-form";

type PageProps = { data: PageData; search: URLSearchParams };

export function JobPage({ data, search }: PageProps) {
  const access = data.access, result = data.job;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AppShell data={data}><Retry href={window.location.pathname} /></AppShell>;
  }
  if (result.kind !== "ok") return <AppShell data={data}>
    <PageHeader title="Job unavailable" />
    <EmptyState href="/collaborate" action="Back to jobs">This job is not available. It may have been hidden by the instructor.</EmptyState>
  </AppShell>;
  return <AppShell data={data}><Job page={result} message={search.get("message")} /></AppShell>;
}

/** Hidden fields every job action carries: the job and the version the viewer saw. */
const keys = (job: JobDetail) => ({ id: job.id, version: job.version });
const due = (job: JobDetail, days: number) => job.claimedAt ? addDays(job.claimedAt, days) : null;

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return <><label htmlFor={id}>{label}</label>{children}{hint && <p className="hint">{hint}</p>}</>;
}

function DeliverForm({ job, again }: { job: JobDetail; again: boolean }) {
  return <form action="/collaborate/action" method="post" className="stack-form">
    <input type="hidden" name="action" value="job_deliver" /><input type="hidden" name="id" value={job.id} /><input type="hidden" name="version" value={job.version} />
    <Field id="deliver-url" label={DELIVERABLES[job.deliverable]} hint="A full https:// link the poster can open.">
      <input id="deliver-url" name="url" type="url" inputMode="url" required maxLength={2048} placeholder="https://" defaultValue={again ? job.deliveryUrl ?? "" : ""} />
    </Field>
    <Field id="deliver-note" label="Note for the poster" hint="What you did and how to check it. Up to 1,000 characters.">
      <textarea id="deliver-note" name="note" required rows={4} maxLength={1000} />
    </Field>
    <button type="submit" className="primary">{again ? "Resubmit delivery" : "Send delivery"}</button>
  </form>;
}

function ReasonForm({ job, action, label, button, hint }: { job: JobDetail; action: string; label: string; button: string; hint?: string }) {
  return <form action="/collaborate/action" method="post" className="stack-form">
    <input type="hidden" name="action" value={action} /><input type="hidden" name="id" value={job.id} /><input type="hidden" name="version" value={job.version} />
    <Field id={`${action}-reason`} label={label} hint={hint}><textarea id={`${action}-reason`} name={action === "job_reject" ? "note" : "reason"} required rows={3} maxLength={1000} /></Field>
    {action === "job_reject" && <label className="check confirmation"><input type="checkbox" name="confirm" value="yes" required /> No criterion is met.</label>}
    <button type="submit">{button}</button>
  </form>;
}

type Step = { text: ReactNode; primary?: ReactNode; more?: ReactNode };
function nextStep(page: JobData): Step {
  const { job, viewer, activeClaims } = page;
  const f = keys(job);
  const tier = job.finalTier ?? job.lockedTier ?? 100;
  const owed = job.money !== null ? usd(payout(job.money, tier)) : null;
  const settled = job.events?.at(-1)?.kind === "resolved";
  const record = <ActionForm action="job_accept" fields={f} primary>Record the automatic acceptance</ActionForm>;
  const dispute = <details className="disclosure"><summary>Open a dispute</summary>
    <ReasonForm job={job} action="job_dispute" label="What went wrong" button="Open dispute" hint="The instructor reads both sides and settles it. Everyone involved sees the outcome." /></details>;
  if (viewer === "instructor" && job.state === "disputed") return {
    text: "Both sides are waiting for you. Choose the final step and payout tier, and say why. The reason appears in the job history.",
    primary: <form action="/collaborate/action" method="post" className="stack-form resolve-form">
      <input type="hidden" name="action" value="job_resolve" /><input type="hidden" name="id" value={job.id} /><input type="hidden" name="version" value={job.version} />
      <fieldset className="choice"><legend>Outcome</legend>
        {job.shareGranted !== null && <p className="hint">A granted share stays in the agreement. Choose accepted or paid.</p>}
        {[["accepted", "Accepted, payment still due"], ["paid", "Accepted and already paid"], ["open", "Reopen the job for a new claim"], ["cancelled", "Cancel the job"]]
          .filter(([value]) => job.shareGranted === null || value === "accepted" || value === "paid").map(([value, label], index) => <label key={value} className="check"><input type="radio" name="outcome" value={value} required defaultChecked={index === 0} /> {label}</label>)}
      </fieldset>
      <Field id="resolve-tier" label="Payout tier (for accepted or paid)"><select id="resolve-tier" name="payout" defaultValue={String(job.lockedTier ?? 100)}>
        <option value="100">100%</option><option value="50">50%</option><option value="0">0%</option></select></Field>
      <Field id="resolve-reason" label="Reason"><textarea id="resolve-reason" name="reason" required rows={3} maxLength={1000} /></Field>
      <button type="submit" className="primary">Settle the dispute</button>
    </form>,
  };
  if (job.isPoster) switch (job.state) {
    case "open": return { text: "Waiting for a classmate to claim it. You can edit or cancel it until then." };
    case "claimed": {
      const releasable = job.claimedAt && Date.now() > Date.parse(due(job, job.windowDays)!);
      return { text: releasable ? <>The window ended without a delivery. You can release the claim so someone else can take it, or keep waiting until <Time iso={due(job, job.windowDays * 2)!} />.</>
        : <>{job.claimant} is working on it. Full pay if delivered by <Time iso={due(job, job.windowDays)!} />.</>,
        primary: releasable ? <ActionForm action="job_release" fields={f} primary confirm={`Release the claim from ${job.claimant}.`}>Release the claim</ActionForm> : undefined };
    }
    case "changes": {
      const releasable = Date.now() > Date.parse(addDays(job.changesAt!, 3));
      return { text: releasable ? <>{job.claimant} has not resubmitted within 3 days of your change request. You can release the claim so someone else can take it.</>
        : <>Waiting for {job.claimant} to resubmit. A resubmission by <Time iso={addDays(job.changesAt!, 3)} /> keeps the {job.lockedTier}% tier.</>,
        primary: releasable ? <ActionForm action="job_release" fields={f} primary confirm={`Release the claim from ${job.claimant}.`}>Release the claim</ActionForm> : undefined,
        more: dispute };
    }
    case "delivered": return {
      text: <>{job.claimant} delivered. Check it against every criterion. If you do not answer, it is accepted automatically on <Time iso={addDays(job.deliveredAt!, 7)} />.</>,
      primary: <ActionForm action="job_accept" fields={f} primary>Accept delivery at {job.lockedTier}%</ActionForm>,
      more: <>
        {job.changeRounds < 2 ? <details className="disclosure"><summary>Request changes ({2 - job.changeRounds} {job.changeRounds === 1 ? "round" : "rounds"} left)</summary>
          <form action="/collaborate/action" method="post" className="stack-form">
            <input type="hidden" name="action" value="job_changes" /><input type="hidden" name="id" value={job.id} /><input type="hidden" name="version" value={job.version} />
            <fieldset className="choice"><legend>Which criteria are not met yet?</legend>
              {job.criteria.map((item, index) => <label key={index} className="check"><input type="checkbox" name={`failed${index + 1}`} value="yes" /> {item}</label>)}
            </fieldset>
            <Field id="changes-note" label="Note (optional)"><textarea id="changes-note" name="note" rows={3} maxLength={1000} /></Field>
            <button type="submit">Request changes</button>
          </form></details> : <p className="hint">Both change rounds are used. Accept, reject or open a dispute.</p>}
        <details className="disclosure"><summary>{job.rejectCount === 0 ? "Reject the delivery" : "Reject again (opens a dispute)"}</summary>
          <p className="hint">{job.rejectCount === 0 ? "Only when no criterion is met. The claim goes back to work and the tier unlocks." : "A second reject sends the job to the instructor."}</p>
          <ReasonForm job={job} action="job_reject" label="Why" button={job.rejectCount === 0 ? "Reject delivery" : "Reject and open a dispute"} /></details>
        {dispute}
      </> };
    case "accepted":
      if (job.lapse === "auto_accepted") return { text: "You did not answer within 7 days, so the delivery was accepted automatically. Record it to continue.", primary: record };
      return { text: <>Pay {job.claimant} {owed} outside the site, then record it here.</>, primary: <form action="/collaborate/action" method="post" className="stack-form">
        <input type="hidden" name="action" value="job_paid" /><input type="hidden" name="id" value={job.id} /><input type="hidden" name="version" value={job.version} />
        <Field id="paid-amount" label="Amount paid in US dollars"><div className="affix"><span className="mono" aria-hidden="true">$</span>
          <input id="paid-amount" name="amount" type="number" inputMode="numeric" min={0} max={1000000} required defaultValue={job.money !== null ? payout(job.money, tier) : 0} className="short" /></div></Field>
        <Field id="paid-on" label="Paid on"><input id="paid-on" name="paidOn" type="date" required defaultValue={tehranToday()} className="short" /></Field>
        <Field id="paid-note" label="Note (optional)" hint="For example how you paid. No account numbers."><input id="paid-note" name="note" maxLength={500} /></Field>
        <button type="submit" className="primary">Mark as paid</button>
      </form>, more: dispute };
    case "paid": return { text: job.confirmed ? "Complete. Both sides confirmed." : `${settled ? "Settled by the Instructor. " : ""}Waiting for ${job.claimant} to confirm it arrived.` };
    case "disputed": return { text: "The instructor will settle this. Both of you will see the outcome and the reason in the history." };
    case "cancelled": return { text: "This job is cancelled. It stays in the history." };
  }
  if (job.isClaimant) switch (job.state) {
    case "claimed": return { text: <>Deliver by <Time iso={due(job, job.windowDays)!} /> for full pay, or by <Time iso={due(job, job.windowDays * 2)!} /> for half. After that the claim ends.</>,
      primary: <DeliverForm job={job} again={false} />,
      more: <details className="disclosure"><summary>Let this job go</summary><p className="hint">The job opens again for others.</p>
        <ActionForm action="job_abandon" fields={f} confirm="I want to stop working on this job.">Abandon the claim</ActionForm></details> };
    case "changes": {
      const failed = [...(job.events ?? [])].reverse().find(event => event.kind === "changes_requested")?.detail?.failed ?? [];
      return { text: <>Changes requested{failed.length ? <> on: {failed.join("; ")}</> : null}. Resubmit by <Time iso={addDays(job.changesAt!, 3)} /> to keep the {job.lockedTier}% tier.</>,
        primary: <DeliverForm job={job} again />,
        more: <details className="disclosure"><summary>Let this job go</summary><ActionForm action="job_abandon" fields={f} confirm="I want to stop working on this job.">Abandon the claim</ActionForm></details> };
    }
    case "delivered": return { text: <>Delivered. {job.poster} has until <Time iso={addDays(job.deliveredAt!, 7)} /> to review it. After that it is accepted automatically.</>, more: dispute };
    case "accepted":
      if (job.lapse === "auto_accepted") return { text: "The poster did not answer within 7 days, so your delivery was accepted automatically. Record it to continue.", primary: record };
      return { text: <>Accepted at {job.finalTier}%. Waiting for {job.poster} to pay {owed}.</>, more: dispute };
    case "paid": return job.confirmed ? { text: "Complete. Thank you for the work." } : {
      text: settled ? <>Settled by the Instructor. Confirm when {job.money !== null ? "the payment" : "the share"} arrives, or say it did not.</> :
        job.money !== null ? <>{job.poster} marked {job.paidAmount !== null ? usd(job.paidAmount) : "it"} as paid. Confirm when it arrives.</> :
        <>Your share is recorded in agreement version {job.agreementVersion ?? "?"} of {job.projectTitle}. Confirm when you have seen it.</>,
      primary: <ActionForm action="job_receipt" fields={f} primary>Confirm I received it</ActionForm>,
      more: <details className="disclosure"><summary>It did not arrive</summary>
        <ReasonForm job={job} action="job_not_received" label="What happened" button="Report and open a dispute" /></details> };
    case "disputed": return { text: "The instructor will settle this. You will see the outcome and the reason in the history." };
    default: break;
  }
  if (job.state === "open") {
    if (viewer === "instructor") return { text: "Members claim jobs. You can hide a job or settle a dispute." };
    if (activeClaims >= 2) return { text: "You already have 2 active claims. Deliver or let one go before you claim another." };
    return { text: <>The clock starts when you claim. Full pay if you deliver within {job.windowDays} {job.windowDays === 1 ? "day" : "days"}.</>,
      primary: <ActionForm action="job_claim" fields={f} primary>Claim this job</ActionForm> };
  }
  return { text: job.state === "cancelled" ? "This job is cancelled." : job.claimant ? `${job.claimant} is on this job.` : "This job is in progress." };
}

const actorName = (event: JobEvent) => event.actor ?? "Vibies";
function describe(event: JobEvent): ReactNode {
  const who = actorName(event), d = event.detail ?? {};
  switch (event.kind) {
    case "posted": return `${who} posted the job`;
    case "edited": return `${who} edited the job`;
    case "cancelled": return `${who} cancelled the job`;
    case "claimed": return `${who} claimed it`;
    case "abandoned": return `${who} let it go`;
    case "released": return `${who} released the claim`;
    case "expired": return "The claim ended after twice the window";
    case "claimant_left": return "The claimant left the class, so the job opened again";
    case "poster_left": return "The poster left the class, so the job closed";
    case "delivered": return `${who} delivered at the ${d.tier}% tier`;
    case "changes_requested": return `${who} requested changes${d.round ? ` (round ${d.round})` : ""}`;
    case "rejected": return `${who} rejected the delivery`;
    case "accepted": return `${who} accepted at ${d.tier}%`;
    case "auto_accepted": return `Accepted automatically after 7 days at ${d.tier}%${event.actor ? `, recorded by ${event.actor}` : ""}`;
    case "paid": return `${who} marked ${d.amount !== undefined && d.amount !== null ? usd(d.amount) : "it"} as paid${d.on ? ` on ${d.on}` : ""}`;
    case "receipt_confirmed": return `${who} confirmed it arrived`;
    case "not_received": return `${who} reported the payment did not arrive`;
    case "disputed": return `${who} opened a dispute`;
    case "resolved": return `${who} settled the dispute: ${({ accepted: "accepted", paid: "accepted and paid", open: "reopened", cancelled: "cancelled" } as Record<string, string>)[d.outcome ?? ""] ?? "settled"}${d.tier !== undefined && d.tier !== null && (d.outcome === "accepted" || d.outcome === "paid") ? ` at ${d.tier}%` : ""}${d.shortfall ? `. The poster's line covered ${d.share ?? 0}% of the share, ${d.shortfall}% short` : ""}`;
    case "hidden": return `${who} hid the job`;
    case "restored": return `${who} made the job visible again`;
    default: return event.kind;
  }
}
function History({ job }: { job: JobDetail }) {
  const events = job.events ?? [];
  const pending: JobEvent | null = job.lapse && job.lapseAt ? { kind: job.lapse, actorKind: "system", actor: null, at: job.lapseAt, detail: { tier: job.lockedTier ?? undefined } } : null;
  return <Card title="History" meta="Tehran time" className="job-history">
    <ol className="job-trail">{[...events, ...(pending ? [pending] : [])].map((event, index) => {
      const d = event.detail ?? {};
      return <li key={index} className={event === pending ? "is-pending" : undefined}>
        <p><strong>{describe(event)}</strong> <span className="mono quiet"><Time iso={event.at} /></span></p>
        {event === pending && <p className="hint">Shown now. It is saved to the record with the next action.</p>}
        {d.url && <p><a className="text-link" href={d.url} rel="noreferrer" referrerPolicy="no-referrer">Open delivery</a></p>}
        {d.failed && d.failed.length > 0 && <ul className="failed">{d.failed.map(item => <li key={item}>{item}</li>)}</ul>}
        {(d.note || d.reason) && <p className="quote">{d.note ?? d.reason}</p>}
      </li>;
    })}</ol>
  </Card>;
}

function Job({ page, message }: { page: JobData; message: string | null }) {
  const { job, viewer } = page;
  const step = nextStep(page);
  const failedNow = job.state === "changes" ? [...(job.events ?? [])].reverse().find(event => event.kind === "changes_requested")?.detail?.failed ?? [] : [];
  const preview = job.state === "claimed" && job.claimedAt ? tierAt(job.claimedAt, job.windowDays, Date.now()) :
    job.state === "changes" && job.changesAt && Date.now() <= Date.parse(addDays(job.changesAt, 3)) ? job.lockedTier : null;
  return <>
    <BackLink href="/collaborate">All jobs</BackLink>
    <CollabMessage message={message} />
    <header className="job-head">
      <Pay job={job} />
      <h1>{job.title}</h1>
      <p className="job-by">
        {job.byInstructor ? <HexBadge tone="strong">Funded by {job.poster}</HexBadge> : <span className="mono">by {job.poster}</span>}
        <span className="mono quiet">Posted <Time iso={job.createdAt} dayOnly /></span>
        <StateBadge state={job.state} />
        {job.hidden && <HexBadge>Hidden by the instructor</HexBadge>}
      </p>
    </header>
    <JobComb state={job.state} confirmed={job.confirmed} />
    <div className="job-layout">
      <div className="job-main">
        <Card title="Done when" meta={`${job.criteria.length} ${job.criteria.length === 1 ? "criterion" : "criteria"}`}>
          <ol className="criteria">{job.criteria.map((item, index) => <li key={index} className={failedNow.includes(item) ? "is-failed" : undefined}>
            <span>{item}</span>{failedNow.includes(item) && <HexBadge>Not met yet</HexBadge>}</li>)}</ol>
        </Card>
        <Card title="About this job">
          <p className="summary">{job.description}</p>
          <dl className="facts">
            <dt>Deliver as</dt><dd>{DELIVERABLES[job.deliverable]}</dd>
            <dt>Window</dt><dd>{job.windowDays} {job.windowDays === 1 ? "day" : "days"} from the claim</dd>
            {job.projectId && <><dt>Product</dt><dd><a className="text-link" href={`/projects/${job.projectId}`}>{job.projectTitle ?? "Product"}</a>{job.milestoneTitle && <> · {job.milestoneTitle}</>}</dd></>}
            {job.skills.length > 0 && <><dt>Skills</dt><dd>{job.skills.join(", ")}</dd></>}
            {job.claimant && <><dt>Claimant</dt><dd>{job.claimant}{job.claimantCompleted ? ` · ${job.claimantCompleted} ${job.claimantCompleted === 1 ? "job" : "jobs"} completed` : ""}</dd></>}
          </dl>
        </Card>
        {job.party && job.deliveryUrl && <Card title="Latest delivery" meta={job.lockedTier !== null ? `Tier ${job.lockedTier}% locked` : undefined}>
          <p><a className="button" href={job.deliveryUrl} rel="noreferrer" referrerPolicy="no-referrer">Open the delivery</a></p>
          {job.deliveryNote && <p className="quote">{job.deliveryNote}</p>}
          {job.deliveredAt && <p className="hint">Delivered <Time iso={job.deliveredAt} /> Tehran time.</p>}
        </Card>}
        {job.party && (job.paidAt || job.agreementVersion) && <Card title="Payment record">
          {job.money !== null && job.paidAt && <p><span className="mono strong-mono">{usd(job.paidAmount ?? 0)}</span> marked paid{job.paidOn ? ` on ${job.paidOn}` : ""}.</p>}
          {job.agreementVersion && <p>{job.shareGranted}% of {job.projectTitle} recorded in <a className="text-link" href={`/projects/${job.projectId}#team`}>agreement version {job.agreementVersion}</a>.</p>}
          {job.paidNote && <p className="quote">{job.paidNote}</p>}
          <p className="hint">{job.confirmed ? <>Confirmed by {job.claimant} <Time iso={job.receiptAt!} />.</> : "Not confirmed yet."}</p>
        </Card>}
        {job.events && <History job={job} />}
      </div>
      <aside className="job-side" aria-label="Your next step and timing">
        <section className="card job-next" aria-labelledby="next-title">
          <div className="card-bar"><h2 id="next-title">{step.primary ? "Your next step" : "Where it stands"}</h2></div>
          <div className="card-body">
            <p>{step.text}</p>
            {step.primary}
            {step.more && <div className="more-actions">{step.more}</div>}
          </div>
        </section>
        {job.claimedAt && <Card title="Timing" meta="Tehran time">
          <dl className="facts timing">
            <dt>Claimed</dt><dd><Time iso={job.claimedAt} /></dd>
            <dt>Full pay until</dt><dd><Time iso={due(job, job.windowDays)!} /></dd>
            <dt>Half pay until</dt><dd><Time iso={due(job, job.windowDays * 2)!} /></dd>
            {job.state === "changes" && job.changesAt && <><dt>Resubmit by</dt><dd><Time iso={addDays(job.changesAt, 3)} /></dd></>}
            {job.state === "delivered" && job.deliveredAt && <><dt>Review by</dt><dd><Time iso={addDays(job.deliveredAt, 7)} /></dd></>}
          </dl>
          {preview !== null && <p className="tier-now"><span className="mono">{preview}%</span> if delivered now: <Pay job={job} tier={preview} /></p>}
          {job.lockedTier !== null && job.state !== "claimed" && <p className="hint">Tier locked at {job.lockedTier}% by the delivery.</p>}
        </Card>}
        {!job.claimedAt && <Card title="Payout">
          <TierTable windowDays={job.windowDays} money={job.money} share={job.share} projectTitle={job.projectTitle} />
        </Card>}
        {job.isPoster && job.state === "open" && <Card title="Manage">
          <details className="disclosure" id="edit"><summary>Edit job</summary><JobForm projects={page.projects} instructor={viewer === "instructor"} job={job} /></details>
          <details className="disclosure"><summary>Cancel job</summary>
            <ActionForm action="job_cancel" fields={keys(job)} confirm="Cancel this job. It cannot be reopened.">Cancel job</ActionForm></details>
        </Card>}
        {viewer === "instructor" && <Card title="Moderation">
          <p>{job.hidden ? "Hidden from Members. The poster and claimant still see it." : "Visible to every Member."}</p>
          <ActionForm action={job.hidden ? "job_restore" : "job_hide"} fields={keys(job)}>{job.hidden ? "Make visible again" : "Hide job"}</ActionForm>
        </Card>}
        <p className="money-note">{MONEY_NOTE}</p>
      </aside>
    </div>
  </>;
}
