import type { PageData } from "../contracts";
import { AccessShell, Retry } from "../access-shell";
import { ProjectMessage, RoadmapProgress, SharedDetails } from "../../app/projects/project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function ProjectsPage({ data, search }: PageProps) {
  const access = data.access;
  const result = data.projects;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AccessShell data={data}><Retry href="/projects" /></AccessShell>;
  }
  const message = search.get("message") ?? undefined;
  return <AccessShell data={data}><section><p className="eyebrow">YOUR COMMUNITY</p><h1>Projects</h1><a href="/welcome">Back to welcome</a>
    <ProjectMessage message={message} />
    {access.kind === "member" && <>
      <p>{access.onboardingComplete ? "Onboarding complete." : "Publish your first Personal Project to complete onboarding. You can browse while you prepare it."}</p>
      <h2>My projects</h2><p>{result.mine.length} of 3 project places filled.</p>
      <a className="button" href="/projects/connect">Connect a repository</a>
      {result.mine.length === 0 && <p>You have no projects yet.</p>}
      {result.mine.map(project => <article key={project.id}><h3><a href={`/projects/${project.id}`}>{project.title}</a></h3>
        <p>{project.publication} · {project.connection} · {project.moderation}</p></article>)}
    </>}
    <h2>Community projects</h2>
    {result.community.length === 0 && <p>No projects are available yet.</p>}
    {result.community.map(project => <article key={project.id}><h3><a href={`/projects/${project.id}`}>{project.title}</a></h3>
      <SharedDetails project={project} /><RoadmapProgress project={project} /></article>)}
  </section></AccessShell>;
}
