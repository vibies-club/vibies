import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { BackLink, Card, EmptyState, HexBadge, PageHeader } from "../ui";
import { DemoLink, ownerNextStep, ProductStatus, ProjectAction, ProjectFields, ProjectMessage, ProjectRoadmap } from "../project-ui";
import { ProjectTeam } from "../project-team";
import { ProjectFunding } from "../project-funding";

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
  const isInstructor = access.kind === "instructor";
  const step = ownerNextStep(item);
  // One honey button per page: a pending status step wins, then the empty roadmap, then the demo.
  const statusStep = step === "check" || step === "publish";
  return <AppShell data={data}>
    <BackLink href="/projects">All products</BackLink>
    <PageHeader title={item.title}>
      <span className="by mono">by {item.nickname}</span>
      {item.publication ? <ProductStatus project={item} /> : <span className="badges"><HexBadge tone="strong">Live</HexBadge></span>}
      {item.demoUrl && <DemoLink url={item.demoUrl} primary={!step} />}
    </PageHeader>
    {(item.isOwner || isInstructor) && <ProjectMessage message={message} />}
    <div className="project-layout">
      <div className="project-main">
        {statusStep && <section className="next-step" aria-labelledby="next-step-title">
          <h2 id="next-step-title">{step === "check" ? "Check the connection" : "Publish when you are ready"}</h2>
          <p>{step === "check"
            ? "Vibies lost sight of this repository. Keep it private and selected in the GitHub App, then check again."
            : "This product is a draft, so only you can see it. Publishing shares it with the class and completes onboarding."}</p>
          <ProjectAction id={item.id} action={step} primary>{step === "check" ? "Check connection" : "Publish"}</ProjectAction>
        </section>}
        <Card title="About" className="project-about">
          <p className="summary">{item.summary}</p>
        </Card>
        <ProjectRoadmap project={item} quiet={statusStep} />
        {/* Collaborate: team, share agreement and funding sections drop in here, after the roadmap. */}
        <ProjectTeam data={data} search={search} />
        <ProjectFunding data={data} search={search} />
      </div>
      {(item.isOwner || isInstructor) && <aside className="project-side" aria-label="Product settings">
        {isInstructor && <Card title="Moderation" meta={item.moderation === "Hidden" ? "Hidden" : "Visible"}>
          <p>{item.moderation === "Hidden"
            ? "Hidden from the Community. Only the owner and you can open it."
            : "Classmates can see this product in the Community."}</p>
          <p className="hint">{item.moderation === "Hidden"
            ? "Restoring shows it again while it stays published and connected."
            : "Hiding takes it out of the Community list and closes its page for classmates. The owner keeps every detail and milestone."}</p>
          <ProjectAction id={item.id} version={item.version} action={item.moderation === "Hidden" ? "restore" : "hide"}>
            {item.moderation === "Hidden" ? "Restore project" : "Hide project"}
          </ProjectAction>
        </Card>}
        {item.isOwner && <Card title="Settings" meta={`${item.publication} · ${item.connection}`} className="owner-settings">
          <p className="hint">{access.onboardingComplete ? "Onboarding complete." : "Publish your first product to complete onboarding."} The repository must stay private.</p>
          <p className="hint">Last connection check: {item.lastCheckedAt ? <time dateTime={item.lastCheckedAt}>{new Date(item.lastCheckedAt).toUTCString()}</time> : "none recorded yet."}</p>
          {step !== "check" && <div className="form-actions"><ProjectAction id={item.id} action="check">Check connection</ProjectAction></div>}
          <details className="disclosure"><summary>Edit details</summary>
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
