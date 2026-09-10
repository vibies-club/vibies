import { redirect } from "next/navigation";
import { accessState } from "../../lib/access";
import { projects } from "../../lib/projects";
import { AccessShell, Retry } from "../access-shell";
import { SharedDetails } from "./project-ui";

export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  const access = await accessState();
  if (access.kind === "signed_out") redirect("/sign-in?message=expired");
  if (access.kind === "denied") redirect("/access-denied");
  if (access.kind === "error") return <AccessShell><Retry href="/projects" /></AccessShell>;
  const result = await projects();
  if (result.kind === "forbidden") redirect("/welcome");
  if (result.kind !== "ok") return <AccessShell><Retry href="/projects" /></AccessShell>;
  return <AccessShell><section><p className="eyebrow">YOUR COMMUNITY</p><h1>Projects</h1><a href="/welcome">Back to welcome</a>
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
      <SharedDetails project={project} /></article>)}
  </section></AccessShell>;
}
