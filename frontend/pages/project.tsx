import type { PageData } from "../contracts";
import { AccessShell, Retry } from "../access-shell";
import { ProjectAction, ProjectFields, ProjectMessage, ProjectRoadmap, SharedDetails } from "../../app/projects/project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function ProjectPage({ data, search }: PageProps) {
  const access = data.access;
  const result = data.project;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AccessShell data={data}><Retry href="/projects" /></AccessShell>;
  }
  if (result.kind !== "ok") return <AccessShell data={data}><section><h1>Project unavailable</h1><p>This project is not available.</p><a href="/projects">Back to projects</a></section></AccessShell>;
  const item = result.project;
  const message = search.get("message") ?? undefined;
  return <AccessShell data={data}><section><p className="eyebrow">PERSONAL PROJECT</p><h1>{item.title}</h1><a href="/projects">Back to projects</a>
    <SharedDetails project={item} />
    {(item.isOwner || access.kind === "instructor") && <ProjectMessage message={message} />}
    <ProjectRoadmap project={item} />
    {access.kind === "instructor" && <>
      <p>{item.moderation === "Hidden" ? "Hidden from the Community." : "Visible to the Community."}</p>
      <ProjectAction id={item.id} version={item.version} action={item.moderation === "Hidden" ? "restore" : "hide"}>
        {item.moderation === "Hidden" ? "Restore project" : "Hide project"}
      </ProjectAction>
    </>}
    {item.isOwner && <>
      <p>{item.publication} · {item.connection} · {item.moderation}</p>
      <p>{access.onboardingComplete ? "Onboarding complete." : "Publish your first Personal Project to complete onboarding."}</p>
      <p>The repository must stay private. Connection shows the last known status. Use Check connection after you change GitHub access.</p>
      <p>Last successful connection check: {item.lastCheckedAt ? <time dateTime={item.lastCheckedAt}>{new Date(item.lastCheckedAt).toUTCString()}</time> : "No successful check recorded."}</p>
      {item.connection === "Connected" && item.publication === "Draft" && <ProjectAction id={item.id} action="publish">Publish</ProjectAction>}
      <ProjectAction id={item.id} action="check">Check connection</ProjectAction>
      <details><summary>Edit project</summary>
        <form action="/projects/action" method="post">
          <input type="hidden" name="action" value="edit" />
          <input type="hidden" name="id" value={item.id} />
          <ProjectFields details={item} /><button type="submit">Save changes</button>
        </form>
      </details>
      <details><summary>Delete project</summary>
        <p>Delete {item.title}?</p>
        <p>This permanently removes the project from Vibies and frees one project place. Your GitHub repository stays unchanged. Completed onboarding is kept.</p>
        <form action="/projects/action" method="post">
          <input type="hidden" name="action" value="delete" />
          <input type="hidden" name="id" value={item.id} />
          <button name="confirm" value="yes">Confirm delete</button>
        </form>
        <a href={`/projects/${item.id}`}>Cancel</a>
      </details>
    </>}
  </section></AccessShell>;
}
