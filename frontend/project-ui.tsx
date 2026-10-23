import { MILESTONE_BLOCKED_NOTE_LIMIT, MILESTONE_TITLE_LIMIT } from "../lib/project-core";
import type { ProjectDetails } from "../lib/project-core";
import type { Project, ProjectMilestone } from "../lib/project-read";
import { Arrow, EmptyState, HexBadge, MessageBanner, Progress } from "./ui";

const messages: Record<string, string> = {
  created: "Draft saved. Review the details before you publish.",
  existing: "This repository already has a project. Your saved details are unchanged.",
  published: "Project published. Your onboarding is complete.",
  already: "Already published.",
  connected: "Connection checked. The repository is connected.",
  edited: "Project details saved.",
  deleted: "Project deleted. A project place is now free.",
  hidden: "Project hidden from the Community.",
  restored: "Project restored. It is available only when Published and Connected.",
  lost: "Repository access was lost. Keep the repository private and select it in the GitHub App, then check again.",
  unknown: "We could not check GitHub. No project data changed. Please try again.",
  stale: "The project changed during this request. Reload the page, review it, and try again.",
  full: "All three project places are filled.",
  conflict: "This repository cannot be connected. No project was created.",
  invalid: "The action was not applied. Check the fields and project state, then try again.",
  error: "We could not complete this action. Please try again.",
  milestone_added: "Milestone added.",
  milestone_edited: "Milestone saved.",
  milestone_completed: "Milestone marked complete.",
  milestone_reopened: "Milestone marked incomplete.",
  milestone_moved: "Milestone order saved.",
  milestone_unchanged: "No change was made.",
  milestone_deleted: "Milestone deleted.",
  roadmap_full: "This roadmap has the maximum of 20 milestones.",
};

export function ProjectMessage({ message }: { message?: string }) {
  return message && Object.hasOwn(messages, message) ? <MessageBanner>{messages[message]}</MessageBanner> : null;
}

export function ProjectFields({ details }: { details?: ProjectDetails }) {
  return <>
    <p id="project-privacy" className="privacy">Use nicknames. Follow the <a href="https://github.com/vibies-club/vibies/blob/main/RULES.md" rel="noreferrer">community rules</a>.
      Keep personal information and GitHub account details out of titles and summaries. Choose a demo destination that follows the same rules.
      GitHub Pages links are allowed. Automatic checks cannot detect every personal detail in text or a destination.</p>
    <label htmlFor="project-title">Project title</label>
    <input id="project-title" name="title" required defaultValue={details?.title} aria-describedby="title-help project-privacy" />
    <p id="title-help" className="hint">1 to 80 characters. Use plain text.</p>
    <label htmlFor="project-summary">Short summary</label>
    <textarea id="project-summary" name="summary" required rows={5} defaultValue={details?.summary} aria-describedby="summary-help project-privacy" />
    <p id="summary-help" className="hint">1 to 500 characters. New lines are allowed.</p>
    <label htmlFor="project-demo">Live demo link (optional)</label>
    <input id="project-demo" name="demoUrl" type="url" defaultValue={details?.demoUrl ?? ""} aria-describedby="demo-help project-privacy" />
    <p id="demo-help" className="hint">An HTTPS link, up to 2,048 characters, without a username or password for sign-in. Vibies does not load a preview.</p>
  </>;
}

export function DemoLink({ url, primary }: { url: string | null; primary?: boolean }) {
  return url ? <a className={primary ? "button primary" : "button"} href={url} rel="noreferrer" referrerPolicy="no-referrer">Open demo<Arrow /></a> : null;
}

/** Status words for a product. Community lists only carry live products, so they have no states. */
export function ProductStatus({ project }: { project: Pick<Project, "publication" | "connection" | "moderation"> }) {
  if (!project.publication) return null;
  const live = project.publication === "Published" && project.connection === "Connected" && project.moderation === "Visible";
  return <span className="badges">
    {live ? <HexBadge tone="strong">Live</HexBadge> : <HexBadge tone={project.publication === "Draft" ? "muted" : "plain"}>{project.publication}</HexBadge>}
    {project.connection === "Disconnected" && <HexBadge>Disconnected</HexBadge>}
    {project.moderation === "Hidden" && <HexBadge>Hidden</HexBadge>}
  </span>;
}

/** A clamped summary for lists; the full text lives on the product page. */
export function SummaryPreview({ project }: { project: Pick<Project, "id" | "summary"> }) {
  const long = project.summary.length > 160 || project.summary.split("\n").length > 3;
  return <>
    <p className={long ? "summary is-clamped" : "summary"}>{project.summary}</p>
    {long && <a className="text-link" href={`/projects/${project.id}`}>Read more</a>}
  </>;
}

export function RoadmapProgress({ project }: { project: Pick<Project, "progressPercentage"> }) {
  return project.progressPercentage === null ? <p className="mono quiet">No roadmap yet</p> :
    <Progress value={project.progressPercentage} label="Roadmap progress" />;
}

function milestoneStatus(milestone: ProjectMilestone, next: boolean) {
  return milestone.completed ? "Done" : milestone.blockedNote ? "Blocked" : next ? "Next up" : "Planned";
}

function MilestoneNode({ milestone, next }: { milestone: ProjectMilestone; next: boolean }) {
  return <svg className="milestone-node" viewBox="0 0 34 30" width="34" height="30" aria-hidden="true">
    <polygon points="9,1.5 25,1.5 32.5,15 25,28.5 9,28.5 1.5,15" />
    {milestone.completed ? <path d="m11 15.5 4 4 8-8.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> :
      milestone.blockedNote ? <path d="M17 9v7m0 4v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> :
      next ? <polygon className="node-dot" points="13.5,10 20.5,10 24,15 20.5,20 13.5,20 10,15" /> : null}
  </svg>;
}

function RoadmapHiddenFields({ project, milestone, action }: {
  project: Project;
  milestone?: ProjectMilestone;
  action: string;
}) {
  return <>
    <input type="hidden" name="action" value={action} />
    <input type="hidden" name="id" value={project.id} />
    <input type="hidden" name="version" value={project.version ?? ""} />
    {milestone && <input type="hidden" name="milestoneId" value={milestone.id} />}
  </>;
}

function MilestoneEditor({ project, milestone }: { project: Project; milestone: ProjectMilestone }) {
  const titleId = `milestone-title-${milestone.id}`;
  const noteId = `milestone-note-${milestone.id}`;
  const helpId = `milestone-help-${milestone.id}`;
  return <form action="/projects/action" method="post">
      <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_edit" />
      <label htmlFor={titleId}>Milestone title</label>
      <input id={titleId} name="title" required defaultValue={milestone.title} aria-describedby={helpId} />
      {!milestone.completed && <><label htmlFor={noteId}>Blocked note (optional)</label>
        <textarea id={noteId} name="blockedNote" rows={3} defaultValue={milestone.blockedNote ?? ""} aria-describedby={helpId} /></>}
      <p id={helpId} className="hint">Title: 1 to {MILESTONE_TITLE_LIMIT} characters. {!milestone.completed && <>Note: 1 to {MILESTONE_BLOCKED_NOTE_LIMIT} characters when present. Use plain text. The note is visible to everyone who can view this project.</>}</p>
      <div className="form-actions"><button type="submit">Save</button><a className="text-link" href={`/projects/${project.id}`}>Cancel</a></div>
    </form>;
}

function MilestoneControls({ project, milestone, index, total }: {
  project: Project;
  milestone: ProjectMilestone;
  index: number;
  total: number;
}) {
  const toggle = milestone.completed ? "Mark not done" : "Mark done";
  return <div className="roadmap-controls">
    <form action="/projects/action" method="post">
      <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_complete" />
      <input type="hidden" name="completed" value={milestone.completed ? "no" : "yes"} />
      <button type="submit" className="small" aria-label={`${toggle}: ${milestone.title}`}>{toggle}</button>
    </form>
    <details className="disclosure milestone-more">
    <summary>Edit, move or delete</summary>
    <MilestoneEditor project={project} milestone={milestone} />
    <div className="roadmap-order">
      <form action="/projects/action" method="post">
        <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_move" />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" className="small" disabled={index === 0}>Move up</button>
      </form>{" "}
      <form action="/projects/action" method="post">
        <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_move" />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" className="small" disabled={index === total - 1}>Move down</button>
      </form>
    </div>
    <details className="disclosure">
      <summary>Delete</summary>
      <p>Delete “{milestone.title}”?</p>
      <form action="/projects/action" method="post">
        <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_delete" />
        <label className="confirmation check"><input type="checkbox" name="confirm" value="yes" required /> I confirm that I want to delete this milestone.</label>
        <div className="form-actions"><button type="submit">Delete milestone</button><a className="text-link" href={`/projects/${project.id}`}>Cancel</a></div>
      </form>
    </details>
    </details>
  </div>;
}

export function ProjectRoadmap({ project, quiet }: { project: Project; quiet?: boolean }) {
  if (!project.roadmapAvailable || !project.roadmap) return null;
  const { roadmap } = project;
  const addTitleId = "milestone-title-new";
  const addNoteId = "milestone-note-new";
  const addHelpId = "milestone-help-new";
  const nextId = roadmap.milestones.find(milestone => !milestone.completed)?.id;
  return <section className="card roadmap" aria-labelledby="roadmap-title">
    <div className="card-bar"><h2 id="roadmap-title">Roadmap</h2>{roadmap.totalCount > 0 && <span className="card-meta">{roadmap.completedCount} of {roadmap.totalCount} done</span>}</div>
    <div className="card-body">
    {roadmap.totalCount === 0 ? (project.isOwner ?
      <EmptyState href="#milestone-title-new" action="Add a milestone" quiet={quiet}>Add your first milestone so classmates can follow your progress.</EmptyState> :
      <p className="quiet">No milestones yet.</p>) : <>
      <Progress value={roadmap.percentage ?? 0} label="Roadmap progress" detail={`${roadmap.percentage}% complete`} />
      <ol className="milestones">
        {roadmap.milestones.map((milestone, index) => {
          const next = milestone.id === nextId;
          return <li key={milestone.id} className={`milestone${milestone.completed ? " is-done" : ""}${next ? " is-next" : ""}`}>
            <MilestoneNode milestone={milestone} next={next} />
            <div className="milestone-body">
              <h3>{milestone.title}</h3>
              <p className="milestone-state">{milestoneStatus(milestone, next)}</p>
              {milestone.blockedNote && <p className="blocked-note"><span className="mono">Blocked note</span> {milestone.blockedNote}</p>}
              {project.isOwner && <MilestoneControls project={project} milestone={milestone} index={index} total={roadmap.totalCount} />}
            </div>
          </li>;
        })}
      </ol>
    </>}
    {project.isOwner && <form action="/projects/action" method="post" className="roadmap-add">
      <h3>Add a milestone</h3>
      <RoadmapHiddenFields project={project} action="milestone_add" />
      <label htmlFor={addTitleId}>Milestone title</label>
      <input id={addTitleId} name="title" required aria-describedby={addHelpId} />
      <label htmlFor={addNoteId}>Blocked note (optional)</label>
      <textarea id={addNoteId} name="blockedNote" rows={3} aria-describedby={addHelpId} />
      <p id={addHelpId} className="hint">Title: 1 to {MILESTONE_TITLE_LIMIT} characters. Note: 1 to {MILESTONE_BLOCKED_NOTE_LIMIT} characters when present. Use plain text. The note is visible to everyone who can view this project.</p>
      {roadmap.totalCount >= 20 && <p role="status">This roadmap has the maximum of 20 milestones.</p>}
      <button type="submit" disabled={roadmap.totalCount >= 20}>Add milestone</button>
    </form>}
    </div>
  </section>;
}

export function ProjectAction({ id, action, version, primary, children }: { id: string; action: string; version?: string; primary?: boolean; children: React.ReactNode }) {
  return <form action="/projects/action" method="post" className="inline-form"><input type="hidden" name="id" value={id} />
    {version && <input type="hidden" name="version" value={version} />}
    <button name="action" value={action} className={primary ? "primary" : undefined}>{children}</button></form>;
}
