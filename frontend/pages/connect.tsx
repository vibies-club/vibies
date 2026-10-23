import type { ReactNode } from "react";
import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, BackLink, HexCell, MessageBanner, PageHeader } from "../ui";
import { ProjectFields, ProjectMessage } from "../project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

function Step({ n, current, title, children }: { n: number; current: number; title: string; children: ReactNode }) {
  const state = n < current ? "is-done" : n === current ? "is-current" : "is-later";
  return <li className={`step ${state}`} aria-current={n === current ? "step" : undefined}>
    <HexCell className="step-cell">{n < current
      ? <svg viewBox="0 0 24 24" width="22" height="22" aria-label="Done"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : <span className="mono">{n}</span>}</HexCell>
    <div><h2>{title}</h2>{children}</div>
  </li>;
}

export function ConnectPage({ data, search }: PageProps) {
  if (data.kind !== "ok" || data.access.kind !== "member" || !data.connect) {
    return <AppShell data={data}><Retry href="/projects/connect" /></AppShell>;
  }
  const { install, repositories, status } = data.connect;
  const refreshed = search.get("refresh") === "yes";
  const message = search.get("message") ?? undefined;
  // The first step that is not finished is the current one. Without a refresh we cannot tell whether the App is installed.
  const current = repositories.length > 0 ? 3 : status === "lost" ? 1 : refreshed || message ? 2 : 1;
  const problem = status === "lost"
    ? "We could not find the Vibies GitHub App on your GitHub account. Install it, then come back and refresh."
    : status ? "We could not reach GitHub just now. Wait a minute, then refresh again."
    : refreshed && repositories.length === 0 ? "The GitHub App is installed, and no private repository is selected in it yet. Open the App settings, select a private repository, then refresh."
    : null;
  return <AppShell data={data}>
    <BackLink href="/projects">All products</BackLink>
    <PageHeader title="Connect a repository" lead="Three steps. Your repository stays private. Vibies checks its details and never imports your code." />
    <ProjectMessage message={message} />
    <ol className="steps">
      <Step n={1} current={current} title="Install the GitHub App">
        <p className="hint">Install the Vibies GitHub App and select only the private repositories you want to connect. Installing it does not change who can see the Community.</p>
        {current === 1 && problem && <MessageBanner>{problem}</MessageBanner>}
        {install ? <a className={current === 1 ? "button primary" : "button"} href={install} rel="noreferrer">{current === 1 ? "Install the GitHub App" : "Change App settings"}<Arrow /></a>
          : <MessageBanner>The GitHub App is not set up yet. Please try again later.</MessageBanner>}
      </Step>
      <Step n={2} current={current} title="Refresh and pick a private repository">
        {current === 2 && problem && <MessageBanner>{problem}</MessageBanner>}
        {repositories.length > 0 ? <>
          <label htmlFor="repository">Private repository</label>
          <select id="repository" name="repositoryId" form="connect-form" required>
            {repositories.map(repo => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
          </select>
        </> : <p className="hint">After you install the App, refresh to load your private repositories.</p>}
        <form method="get" action="/projects/connect"><button name="refresh" value="yes" className={current === 2 ? "primary" : undefined}>{repositories.length > 0 ? "Refresh the list" : "Refresh my repositories"}</button></form>
      </Step>
      <Step n={3} current={current} title="Title, summary and demo link">
        {repositories.length > 0 ? <form id="connect-form" method="post" action="/projects/action" className="stack-form">
          <input type="hidden" name="action" value="connect" />
          <ProjectFields /><button type="submit" className="primary">Save draft<Arrow /></button>
          <p className="hint">A draft is only visible to you. You can publish it from its product page.</p>
        </form> : <p className="hint">Describe your product here once you pick a repository.</p>}
      </Step>
    </ol>
  </AppShell>;
}
