import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, EmptyState, PageHeader } from "../ui";
import { DemoLink, ProductStatus, ProjectMessage, RoadmapProgress, SummaryPreview } from "../project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

export function ProjectsPage({ data, search }: PageProps) {
  const access = data.access;
  const result = data.projects;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AppShell data={data}><Retry href="/projects" /></AppShell>;
  }
  const message = search.get("message") ?? undefined;
  return <AppShell data={data}>
    <PageHeader title="Products" lead={access.kind === "member" ? (access.onboardingComplete ? "Onboarding complete. Keep your roadmap moving." : "Publish your first product to complete onboarding. You can browse while you prepare it.") : "Every live product in the class."} />
    <ProjectMessage message={message} />
    {access.kind === "member" && <section className="list-section" aria-labelledby="mine-title">
      <div className="section-head"><h2 id="mine-title">My products</h2><span className="mono">{result.mine.length} of 3 places</span>
        {result.mine.length > 0 && <a className="button primary" href="/projects/connect">Connect a repository<Arrow /></a>}</div>
      {result.mine.length === 0 ? <EmptyState href="/projects/connect" action="Connect a repository">Connect a private repository to start your first product.</EmptyState> :
        <ul className="product-list">{result.mine.map(project => <li key={project.id} className="product-card">
          <div className="product-head"><h3><a href={`/projects/${project.id}`}>{project.title}</a></h3><ProductStatus project={project} /></div>
          <SummaryPreview project={project} />
          <div className="card-actions"><a className="text-link" href={`/projects/${project.id}`}>Open product page</a></div>
        </li>)}</ul>}
    </section>}
    <section className="list-section" aria-labelledby="community-title">
      <div className="section-head"><h2 id="community-title">Community</h2><span className="mono">{result.community.length} live</span></div>
      {result.community.length === 0 ? <p className="quiet">No products are live yet.</p> :
        <ul className="product-list">{result.community.map(project => <li key={project.id} className="product-card">
          <div className="product-head"><h3><a href={`/projects/${project.id}`}>{project.title}</a></h3><span className="by mono">by {project.nickname}</span></div>
          <RoadmapProgress project={project} />
          <SummaryPreview project={project} />
          <div className="card-actions"><DemoLink url={project.demoUrl} /><a className="text-link" href={`/projects/${project.id}`}>Open product page</a></div>
        </li>)}</ul>}
    </section>
  </AppShell>;
}
