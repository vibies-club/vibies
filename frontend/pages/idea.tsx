import { useId } from "react";
import type { PageData } from "../contracts";
import { HELP, STAGES } from "../../lib/collab-core";
import type { IdeaDetail, IdeaPage as IdeaData, IdeaSummary } from "../../lib/collab-read";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { BackLink, Card, EmptyState, HexBadge, PageHeader } from "../ui";
import { ActionForm, CollabMessage, Time } from "../collab-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function IdeaPage({ data, search }: PageProps) {
  const access = data.access, result = data.idea;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AppShell data={data}><Retry href={window.location.pathname} /></AppShell>;
  }
  if (result.kind !== "ok") return <AppShell data={data}>
    <PageHeader title="Idea unavailable" />
    <EmptyState href="/collaborate#ideas" action="Back to ideas">This idea is not available.</EmptyState>
  </AppShell>;
  return <AppShell data={data}><Idea page={result} message={search.get("message")} /></AppShell>;
}

/** Stage and help-wanted badges, shared by the feed and the idea page. */
export function IdeaBadges({ idea }: { idea: Pick<IdeaSummary, "stage" | "help"> }) {
  return <span className="badges">
    <HexBadge tone="strong">{STAGES[idea.stage]}</HexBadge>
    {idea.help.map(item => <HexBadge key={item} tone="muted">{HELP[item]} wanted</HexBadge>)}
  </span>;
}

/** Post and edit form for an idea. */
export function IdeaForm({ idea }: { idea?: IdeaDetail }) {
  const uid = useId(), f = (name: string) => `${uid}-${name}`;
  return <form action="/collaborate/action" method="post" className="job-form idea-form">
    <input type="hidden" name="action" value={idea ? "idea_edit" : "idea_post"} />
    {idea && <><input type="hidden" name="id" value={idea.id} /><input type="hidden" name="version" value={idea.version} /></>}
    <fieldset>
      <legend>The idea</legend>
      <label htmlFor={f("title")}>Title</label>
      <input id={f("title")} name="title" required maxLength={80} defaultValue={idea?.title} />
      <label htmlFor={f("problem")}>The problem</label>
      <p className="hint">What is hard or annoying today, in a few plain sentences.</p>
      <textarea id={f("problem")} name="problem" required rows={5} maxLength={2000} defaultValue={idea?.problem} />
      <label htmlFor={f("audience")}>Who it is for</label>
      <input id={f("audience")} name="audience" required maxLength={200} defaultValue={idea?.audience} placeholder="Students who cook on a budget" />
      <fieldset className="choice">
        <legend>Stage</legend>
        {Object.entries(STAGES).map(([value, label]) => <label key={value} className="check">
          <input type="radio" name="stage" value={value} required defaultChecked={(idea?.stage ?? "idea") === value} /> {label}
        </label>)}
      </fieldset>
      <fieldset className="choice">
        <legend>Help wanted</legend>
        {Object.entries(HELP).map(([value, label]) => <label key={value} className="check">
          <input type="checkbox" name={`help_${value}`} value="yes" defaultChecked={idea?.help.includes(value as keyof typeof HELP)} /> {label}
        </label>)}
      </fieldset>
    </fieldset>
    <p className="hint">Use nicknames only. Everyone in the class can read ideas and comments.</p>
    <button type="submit" className="primary">{idea ? "Save idea" : "Share idea"}</button>
  </form>;
}

function Idea({ page, message }: { page: IdeaData; message: string | null }) {
  const { idea, viewer } = page;
  const member = viewer === "member";
  const fields = { id: idea.id };
  return <>
    <BackLink href="/collaborate#ideas">All ideas</BackLink>
    <CollabMessage message={message} />
    <header className="job-head">
      <IdeaBadges idea={idea} />
      <h1>{idea.title}</h1>
      <p className="job-by"><span className="mono">by {idea.author}</span><span className="mono quiet">Shared <Time iso={idea.createdAt} dayOnly /></span></p>
    </header>
    <div className="job-layout">
      <div className="job-main">
        <Card title="The problem">
          <p className="summary">{idea.problem}</p>
          <dl className="facts">
            <dt>For</dt><dd>{idea.audience}</dd>
            {idea.projectId && <><dt>Product</dt><dd>{idea.projectTitle
              ? <a className="text-link" href={`/projects/${idea.projectId}`}>{idea.projectTitle}</a> : "A product in progress"}</dd></>}
          </dl>
        </Card>
        <Card title="Comments" meta={`${idea.comments.length}`} className="idea-comments">
          {idea.comments.length === 0 ? <p className="quiet">No comments yet. Ask a question or add what you know.</p> :
            <ol className="comment-list">{idea.comments.map((comment, index) => <li key={index}>
              <p><strong>{comment.author}</strong>{comment.byInstructor && <> <HexBadge tone="strong">Instructor</HexBadge></>} <span className="mono quiet"><Time iso={comment.at} /></span></p>
              <p className="comment-body">{comment.body}</p>
            </li>)}</ol>}
          <form action="/collaborate/action" method="post" className="stack-form">
            <input type="hidden" name="action" value="comment_post" /><input type="hidden" name="id" value={idea.id} />
            <label htmlFor="comment-body">Add a comment</label>
            <textarea id="comment-body" name="body" required rows={3} maxLength={1000} />
            <button type="submit">Post comment</button>
          </form>
        </Card>
      </div>
      <aside className="job-side" aria-label="Interest and next steps">
        <Interest page={page} />
        <Card title="Interested" meta={`${idea.interest.length}`}>
          {idea.interest.length === 0 ? <p className="quiet">Nobody yet.</p> : <ul className="roster">{idea.interest.map(person => <li key={person.nickname}>
            <span className="roster-hex" aria-hidden="true">{person.nickname.slice(0, 1)}</span>
            <span><strong>{person.nickname}</strong><span className="mono quiet">{person.role}</span>{person.note && <span className="hint">{person.note}</span>}</span>
            {person.team === "active" ? <HexBadge tone="strong">On the team</HexBadge> : person.team === "invited" ? <HexBadge tone="muted">Invited</HexBadge> :
              idea.isMine && idea.projectId && <InviteButton idea={idea} nickname={person.nickname} role={person.role} />}
          </li>)}</ul>}
        </Card>
        {idea.isMine && <Card title="Manage">
          <details className="disclosure"><summary>{idea.projectId ? "Change the linked product" : "Turn into a product"}</summary>
            <p className="hint">Link the product you built from this idea. Interested classmates can then be invited to its team.</p>
            {idea.products && idea.products.length > 0 ? <form action="/collaborate/action" method="post" className="stack-form">
              <input type="hidden" name="action" value="idea_link" /><input type="hidden" name="id" value={idea.id} /><input type="hidden" name="version" value={idea.version} />
              <label htmlFor="idea-product">Product</label>
              <select id="idea-product" name="projectId" defaultValue={idea.projectId ?? ""}>
                <option value="">No product</option>
                {idea.products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}
              </select>
              <button type="submit">Save link</button>
            </form> : <p><a className="text-link" href="/projects/connect">Connect a product first</a></p>}
          </details>
          <details className="disclosure"><summary>Edit idea</summary><IdeaForm idea={idea} /></details>
        </Card>}
        {!member && <p className="hint">You can comment on ideas. Members share ideas and say they are interested.</p>}
      </aside>
    </div>
  </>;
}

function InviteButton({ idea, nickname, role }: { idea: IdeaDetail; nickname: string; role: string }) {
  return <ActionForm action="team_invite" fields={{ projectId: idea.projectId!, from: "idea", ideaId: idea.id, member: nickname, role }}>Invite to team</ActionForm>;
}

/** The viewer's one next step on an idea. */
function Interest({ page }: { page: IdeaData }) {
  const { idea, viewer } = page;
  if (viewer !== "member") return null;
  let body;
  if (idea.isMine) body = idea.projectId
    ? <p>{idea.interest.some(person => !person.team) ? "Invite the interested classmates below to your product team." : "Everyone interested has an invite or a place on the team."}</p>
    : <p>When you start building, link the product so you can invite interested classmates to its team.</p>;
  else if (idea.mine) body = <>
    {idea.projectId && idea.myTeam === "invited" ? <p><strong>{idea.author} invited you to the team.</strong> Answer on the <a className="text-link" href={`/projects/${idea.projectId}#team`}>product page</a>.</p>
      : idea.projectId && idea.myTeam === "active" ? <p>You are on the team for this idea.</p>
      : idea.projectId ? <p>This idea is now a product. {idea.author} can invite you to its team.</p>
      : <p>You told {idea.author} you are interested as <strong>{idea.mine.role}</strong>.</p>}
    <details className="disclosure"><summary>Change or withdraw</summary>
      <InterestForm idea={idea} />
      <ActionForm action="idea_uninterest" fields={{ id: idea.id }}>Withdraw interest</ActionForm>
    </details>
  </>;
  else body = <><p>Want to help? Say how. {idea.author} sees your role and note.</p><InterestForm idea={idea} primary /></>;
  return <section className="card job-next" aria-labelledby="idea-next">
    <div className="card-bar"><h2 id="idea-next">{idea.isMine ? "Your idea" : idea.mine ? "You are interested" : "I'm interested"}</h2></div>
    <div className="card-body">{body}</div>
  </section>;
}

function InterestForm({ idea, primary }: { idea: IdeaDetail; primary?: boolean }) {
  return <form action="/collaborate/action" method="post" className="stack-form">
    <input type="hidden" name="action" value="idea_interest" /><input type="hidden" name="id" value={idea.id} />
    <label htmlFor="interest-role">Your role</label>
    <input id="interest-role" name="role" required maxLength={40} defaultValue={idea.mine?.role} placeholder="Designer" />
    <label htmlFor="interest-note">Note (optional)</label>
    <textarea id="interest-note" name="note" rows={2} maxLength={500} defaultValue={idea.mine?.note ?? ""} />
    <button type="submit" className={primary ? "primary" : undefined}>{idea.mine ? "Save" : "I'm interested"}</button>
  </form>;
}
