import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { BackLink, Card, EmptyState, PageHeader } from "../ui";
import { DemoLink, ProductStatus, ProjectAction, ProjectFields, ProjectMessage, ProjectRoadmap } from "../project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function ProjectPage({ data, search }: PageProps) {
  const access = data.access;
  const result = data.project;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AppShell data={data}><Retry href="/projects" /></AppShell>;
  }
  if (result.kind !== "ok") return <AppShell data={data}>
    <PageHeader title="Product unavailable" />
    <EmptyState href="/projects" action="Back to products">This product is not available.</EmptyState>
  </AppShell>;
  const item = result.project;
  const message = search.get("message") ?? undefined;
  const canPublish = item.isOwner && item.connection === "Connected" && item.publication === "Draft";
  return <AppShell data={data}>
    <BackLink href="/projects">All products</BackLink>
    <PageHeader title={item.title}>
      <span className="by mono">by {item.nickname}</span>
      {(item.isOwner || access.kind === "instructor") && <ProductStatus project={item} />}
    </PageHeader>
    {(item.isOwner || access.kind === "instructor") && <ProjectMessage message={message} />}
    <div className="project-layout">
      <div className="project-main">
        <Card title="About" className="project-about">
          <p className="summary">{item.summary}</p>
          {item.demoUrl && <div className="card-actions"><DemoLink url={item.demoUrl} primary={!canPublish} /></div>}
        </Card>
        <ProjectRoadmap project={item} quiet={canPublish || Boolean(item.demoUrl)} />
      </div>
      {(item.isOwner || access.kind === "instructor") && <aside className="project-side" aria-label="Product settings">
        {access.kind === "instructor" && <Card title="Moderation">
          <p>{item.moderation === "Hidden" ? "Hidden from the Community." : "Visible to the Community."}</p>
          <ProjectAction id={item.id} version={item.version} action={item.moderation === "Hidden" ? "restore" : "hide"}>
            {item.moderation === "Hidden" ? "Restore project" : "Hide project"}
          </ProjectAction>
        </Card>}
        {item.isOwner && <Card title="Status" meta={`${item.publication} · ${item.connection}`}>
          <p>{access.onboardingComplete ? "Onboarding complete." : "Publish your first Personal Project to complete onboarding."}</p>
          <p className="hint">The repository must stay private. Connection shows the last known status. Use Check connection after you change GitHub access.</p>
          <p className="hint">Last successful connection check: {item.lastCheckedAt ? <time dateTime={item.lastCheckedAt}>{new Date(item.lastCheckedAt).toUTCString()}</time> : "No successful check recorded."}</p>
          <div className="form-actions">
            {canPublish && <ProjectAction id={item.id} action="publish" primary>Publish</ProjectAction>}
            <ProjectAction id={item.id} action="check">Check connection</ProjectAction>
          </div>
          <details className="disclosure"><summary>Edit project</summary>
            <form action="/projects/action" method="post">
              <input type="hidden" name="action" value="edit" />
              <input type="hidden" name="id" value={item.id} />
              <ProjectFields details={item} /><button type="submit">Save changes</button>
            </form>
          </details>
          <details className="disclosure"><summary>Delete project</summary>
            <p>Delete {item.title}?</p>
            <p className="hint">This permanently removes the project from Vibies and frees one project place. Your GitHub repository stays unchanged. Completed onboarding is kept.</p>
            <form action="/projects/action" method="post">
              <input type="hidden" name="action" value="delete" />
              <input type="hidden" name="id" value={item.id} />
              <div className="form-actions"><button name="confirm" value="yes">Confirm delete</button><a className="text-link" href={`/projects/${item.id}`}>Cancel</a></div>
            </form>
          </details>
        </Card>}
      </aside>}
    </div>
  </AppShell>;
}
