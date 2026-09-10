import { redirect } from "next/navigation";
import { accessState } from "../../../lib/access";
import { project } from "../../../lib/projects";
import { AccessShell, Retry } from "../../access-shell";
import { ProjectAction, ProjectMessage, SharedDetails } from "../project-ui";

export const dynamic = "force-dynamic";
export default async function ProjectPage({ params, searchParams }: {params:Promise<{id:string}>;searchParams:Promise<{message?:string}>}) {
  const access = await accessState();
  if (access.kind === "signed_out") redirect("/sign-in?message=expired");
  if (access.kind === "denied") redirect("/access-denied");
  if (access.kind === "error") return <AccessShell><Retry href="/projects" /></AccessShell>;
  const { id } = await params;
  const result = await project(id);
  if (result.kind === "forbidden") redirect("/welcome");
  if (result.kind === "error") return <AccessShell><Retry href="/projects" /></AccessShell>;
  if (result.kind !== "ok") return <AccessShell><section><h1>Project unavailable</h1><p>This project is not available.</p><a href="/projects">Back to projects</a></section></AccessShell>;
  const item = result.project;
  const { message } = await searchParams;
  return <AccessShell><section><p className="eyebrow">PERSONAL PROJECT</p><h1>{item.title}</h1><a href="/projects">Back to projects</a>
    <SharedDetails project={item} />
    {item.isOwner && <>
      <ProjectMessage message={message} />
      <p>{item.publication} · {item.connection} · {item.moderation}</p>
      <p>{access.onboardingComplete ? "Onboarding complete." : "Publish your first Personal Project to complete onboarding."}</p>
      <p>The repository must stay private. Connection shows the last known status. Use Check connection after you change GitHub access.</p>
      <p>Last successful connection check: {item.lastCheckedAt ? <time dateTime={item.lastCheckedAt}>{new Date(item.lastCheckedAt).toUTCString()}</time> : "No successful check recorded."}</p>
      {item.connection === "Connected" && item.publication === "Draft" && <ProjectAction id={item.id} action="publish">Publish</ProjectAction>}
      <ProjectAction id={item.id} action="check">Check connection</ProjectAction>
    </>}
  </section></AccessShell>;
}
