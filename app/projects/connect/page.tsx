import { redirect } from "next/navigation";
import { accessState, sessionHash } from "../../../lib/access";
import { installationURL, projectActor, verifyProject } from "../../../lib/projects";
import { AccessShell, Retry } from "../../access-shell";
import { ProjectFields, ProjectMessage } from "../project-ui";

export const dynamic = "force-dynamic";
export default async function ConnectPage({ searchParams }: {searchParams:Promise<{refresh?:string;message?:string}>}) {
  const access = await accessState();
  if (access.kind === "signed_out") redirect("/sign-in?message=expired");
  if (access.kind === "denied") redirect("/access-denied");
  if (access.kind === "instructor") redirect("/projects");
  if (access.kind === "error") return <AccessShell><Retry href="/projects/connect" /></AccessShell>;
  const { refresh, message } = await searchParams;
  const install = installationURL();
  let repositories: {id:string;name:string}[] = [], status: string | undefined;
  if (refresh === "yes") {
    try {
      const hash = await sessionHash();
      const actor = hash ? await projectActor(hash) : null;
      if (!actor) status = "error";
      else {
        const result = await verifyProject(actor);
        if (result.kind === "verified") repositories = result.repositories ?? [];
        else status = result.kind;
      }
    } catch { status = "error"; }
  }
  return <AccessShell><section><p className="eyebrow">PERSONAL PROJECT</p><h1>Connect a repository</h1><a href="/projects">Back to projects</a>
    <p>Choose your own private personal repository. It must stay private. Select only the repositories you want to connect in the GitHub App settings.</p>
    <p>Vibies checks repository metadata. It does not import source files or README contents. Installing the App does not grant Community access.</p>
    {install ? <p><a className="button" href={install} rel="noreferrer">Install or configure the GitHub App</a></p> : <p role="status">GitHub App setup is pending. Please try again after setup.</p>}
    <p>After GitHub setup, return here and refresh the list.</p>
    <form method="get" action="/projects/connect"><button name="refresh" value="yes">Refresh eligible repositories</button></form>
    <ProjectMessage message={status ?? message} />
    {refresh === "yes" && !status && repositories.length === 0 && <p>No eligible repositories were found. Check selected access and keep the repository private.</p>}
    {repositories.length > 0 && <form method="post" action="/projects/action">
      <input type="hidden" name="action" value="connect" />
      <label htmlFor="repository">Private repository</label><select id="repository" name="repositoryId" required>
        {repositories.map(repo => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
      </select><ProjectFields /><button type="submit">Save Draft</button>
    </form>}
  </section></AccessShell>;
}
