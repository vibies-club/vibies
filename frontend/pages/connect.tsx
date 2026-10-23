import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, BackLink, HexCell, MessageBanner, PageHeader } from "../ui";
import { ProjectFields, ProjectMessage } from "../project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function ConnectPage({ data, search }: PageProps) {
  if (data.kind !== "ok" || data.access.kind !== "member" || !data.connect) {
    return <AppShell data={data}><Retry href="/projects/connect" /></AppShell>;
  }
  const { install, repositories, status } = data.connect;
  const refresh = search.get("refresh");
  const message = search.get("message") ?? undefined;
  return <AppShell data={data}>
    <BackLink href="/projects">All products</BackLink>
    <PageHeader title="Connect a repository" lead="Choose your own private personal repository. It must stay private. Select only the repositories you want to connect in the GitHub App settings." />
    <ProjectMessage message={status ?? message} />
    <ol className="steps">
      <li className="step">
        <HexCell className="step-cell"><span className="mono">1</span></HexCell>
        <div><h2>Install the GitHub App</h2>
          <p className="hint">Vibies checks repository metadata. It does not import source files or README contents. Installing the App does not grant Community access.</p>
          {install ? <a className={repositories.length > 0 ? "button" : "button primary"} href={install} rel="noreferrer">Install or configure the GitHub App<Arrow /></a> : <MessageBanner>GitHub App setup is pending. Please try again after setup.</MessageBanner>}
        </div>
      </li>
      <li className="step">
        <HexCell className="step-cell"><span className="mono">2</span></HexCell>
        <div><h2>Refresh the list</h2>
          <p className="hint">After GitHub setup, return here and refresh the list.</p>
          <form method="get" action="/projects/connect"><button name="refresh" value="yes">Refresh eligible repositories</button></form>
          {refresh === "yes" && !status && repositories.length === 0 && <p className="quiet">No eligible repositories were found. Check selected access and keep the repository private.</p>}
        </div>
      </li>
      <li className="step">
        <HexCell className="step-cell"><span className="mono">3</span></HexCell>
        <div><h2>Describe it and save a draft</h2>
          {repositories.length > 0 ? <form method="post" action="/projects/action" className="stack-form">
            <input type="hidden" name="action" value="connect" />
            <label htmlFor="repository">Private repository</label><select id="repository" name="repositoryId" required>
              {repositories.map(repo => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
            </select><ProjectFields /><button type="submit" className="primary">Save Draft</button>
          </form> : <p className="hint">Your repositories appear here after you refresh the list.</p>}
        </div>
      </li>
    </ol>
  </AppShell>;
}
