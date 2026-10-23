import type { PageData } from "../contracts";
import { AccessShell, Retry } from "../access-shell";
import { ProjectFields, ProjectMessage } from "../project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function ConnectPage({ data, search }: PageProps) {
  if (data.kind !== "ok" || data.access.kind !== "member" || !data.connect) {
    return <AccessShell data={data}><Retry href="/projects/connect" /></AccessShell>;
  }
  const { install, repositories, status } = data.connect;
  const refresh = search.get("refresh");
  const message = search.get("message") ?? undefined;
  return <AccessShell data={data}><section><p className="eyebrow">PERSONAL PROJECT</p><h1>Connect a repository</h1><a href="/projects">Back to projects</a>
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
