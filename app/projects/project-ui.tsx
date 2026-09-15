import { MILESTONE_BLOCKED_NOTE_LIMIT, MILESTONE_TITLE_LIMIT } from "../../lib/project-core";
import type { ProjectDetails } from "../../lib/project-core";
import type { Project, ProjectMilestone } from "../../lib/projects";

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
  return message && Object.hasOwn(messages, message) ? <p role="status">{messages[message]}</p> : null;
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

export function SharedDetails({ project }: { project: ProjectDetails & { nickname: string } }) {
  return <><p>By {project.nickname}</p><p className="project-summary">{project.summary}</p>
    {project.demoUrl && <p><a href={project.demoUrl} rel="noreferrer" referrerPolicy="no-referrer">Open demo</a></p>}</>;
}

export function RoadmapProgress({ project }: { project: Pick<Project, "progressPercentage"> }) {
  return project.progressPercentage === null ? null : <p className="roadmap-summary">{project.progressPercentage}% complete</p>;
}

function milestoneStatus(milestone: ProjectMilestone) {
  return milestone.completed ? "Complete" : milestone.blockedNote ? "Blocked" : "Incomplete";
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
  return <details>
    <summary>Edit milestone</summary>
    <form action="/projects/action" method="post">
      <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_edit" />
      <label htmlFor={titleId}>Milestone title</label>
      <input id={titleId} name="title" required defaultValue={milestone.title} aria-describedby={helpId} />
      {!milestone.completed && <><label htmlFor={noteId}>Blocked note (optional)</label>
        <textarea id={noteId} name="blockedNote" rows={3} defaultValue={milestone.blockedNote ?? ""} aria-describedby={helpId} /></>}
      <p id={helpId} className="hint">Title: 1 to {MILESTONE_TITLE_LIMIT} characters. {!milestone.completed && <>Note: 1 to {MILESTONE_BLOCKED_NOTE_LIMIT} characters when present. Use plain text. The note is visible to everyone who can view this project.</>}</p>
      <button type="submit">Save</button>{" "}<a href={`/projects/${project.id}`}>Cancel</a>
    </form>
  </details>;
}

function MilestoneControls({ project, milestone, index, total }: {
  project: Project;
  milestone: ProjectMilestone;
  index: number;
  total: number;
}) {
  const completeId = `milestone-complete-${milestone.id}`;
  return <div className="roadmap-controls">
    <form action="/projects/action" method="post">
      <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_complete" />
      <label htmlFor={completeId}><input id={completeId} type="checkbox" name="completed" value="yes" defaultChecked={milestone.completed} /> Complete</label>{" "}
      <button type="submit">Save completion</button>
    </form>
    <MilestoneEditor project={project} milestone={milestone} />
    <div className="roadmap-order">
      <form action="/projects/action" method="post">
        <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_move" />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={index === 0}>Move up</button>
      </form>{" "}
      <form action="/projects/action" method="post">
        <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_move" />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={index === total - 1}>Move down</button>
      </form>
    </div>
    <details>
      <summary>Delete milestone</summary>
      <p>Delete “{milestone.title}”?</p>
      <form action="/projects/action" method="post">
        <RoadmapHiddenFields project={project} milestone={milestone} action="milestone_delete" />
        <label className="confirmation"><input type="checkbox" name="confirm" value="yes" required /> I confirm that I want to delete this milestone.</label>{" "}
        <button type="submit">Delete milestone</button>{" "}<a href={`/projects/${project.id}`}>Cancel</a>
      </form>
    </details>
  </div>;
}

export function ProjectRoadmap({ project }: { project: Project }) {
  if (!project.roadmapAvailable || !project.roadmap) return null;
  const { roadmap } = project;
  const addTitleId = "milestone-title-new";
  const addNoteId = "milestone-note-new";
  const addHelpId = "milestone-help-new";
  return <section className="roadmap" aria-labelledby="roadmap-title">
    <h2 id="roadmap-title">Roadmap</h2>
    {roadmap.totalCount === 0 ? <p>No milestones yet.</p> : <>
      <p><progress max={roadmap.totalCount} value={roadmap.completedCount} aria-label={`${roadmap.percentage}% complete`} /></p>
      <p>{roadmap.completedCount} of {roadmap.totalCount} complete, {roadmap.percentage}%.</p>
      <ol>
        {roadmap.milestones.map((milestone, index) => <li key={milestone.id} className="roadmap-milestone">
          <h3>{milestone.title}</h3>
          <p><strong>Status:</strong> {milestoneStatus(milestone)}</p>
          {milestone.blockedNote && <p><strong>Blocked note:</strong> {milestone.blockedNote}</p>}
          {project.isOwner && <MilestoneControls project={project} milestone={milestone} index={index} total={roadmap.totalCount} />}
        </li>)}
      </ol>
    </>}
    {project.isOwner && <form action="/projects/action" method="post" className="roadmap-add">
      <RoadmapHiddenFields project={project} action="milestone_add" />
      <label htmlFor={addTitleId}>Milestone title</label>
      <input id={addTitleId} name="title" required aria-describedby={addHelpId} />
      <label htmlFor={addNoteId}>Blocked note (optional)</label>
      <textarea id={addNoteId} name="blockedNote" rows={3} aria-describedby={addHelpId} />
      <p id={addHelpId} className="hint">Title: 1 to {MILESTONE_TITLE_LIMIT} characters. Note: 1 to {MILESTONE_BLOCKED_NOTE_LIMIT} characters when present. Use plain text. The note is visible to everyone who can view this project.</p>
      {roadmap.totalCount >= 20 && <p role="status">This roadmap has the maximum of 20 milestones.</p>}
      <button type="submit" disabled={roadmap.totalCount >= 20}>Add milestone</button>
    </form>}
  </section>;
}

export function ProjectAction({ id, action, version, children }: { id: string; action: string; version?: string; children: React.ReactNode }) {
  return <form action="/projects/action" method="post"><input type="hidden" name="id" value={id} />
    {version && <input type="hidden" name="version" value={version} />}
    <button name="action" value={action}>{children}</button></form>;
}
