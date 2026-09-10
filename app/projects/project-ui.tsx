import type { ProjectDetails } from "../../lib/project-core";

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
  stale: "The project changed during this request. Review it and try again.",
  full: "All three project places are filled.",
  conflict: "This repository cannot be connected. No project was created.",
  invalid: "The action was not applied. Check the fields and project state, then try again.",
  error: "We could not complete this action. Please try again.",
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

export function ProjectAction({ id, action, version, children }: { id: string; action: string; version?: string; children: React.ReactNode }) {
  return <form action="/projects/action" method="post"><input type="hidden" name="id" value={id} />
    {version && <input type="hidden" name="version" value={version} />}
    <button name="action" value={action}>{children}</button></form>;
}
