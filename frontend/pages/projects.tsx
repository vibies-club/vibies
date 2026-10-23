import type { PageData } from "../contracts";
import type { Project } from "../../lib/project-read";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, EmptyState, PageHeader } from "../ui";
import { DemoLink, ownerNextStep, ProductStatus, ProjectAction, ProjectMessage, RoadmapProgress, SeedRoadmap, SummaryPreview } from "../project-ui";

type PageProps = { data: PageData; search: URLSearchParams };

/** Exactly one next action per product, in the order the product needs it. */
function NextAction({ project }: { project: Project }) {
  const step = ownerNextStep(project);
  if (step === "check") return <div className="next-action"><p>Vibies lost sight of this repository. Keep it private and selected in the GitHub App.</p>
    <ProjectAction id={project.id} action="check">Check connection</ProjectAction></div>;
  if (step === "publish") return <div className="next-action"><p>This is a draft. Publish it so classmates can see it.</p>
    <ProjectAction id={project.id} action="publish">Publish</ProjectAction></div>;
  if (step === "roadmap") return <div className="next-action"><p>No roadmap yet. Start with the course steps.</p>
    <SeedRoadmap project={project} addHref={`/projects/${project.id}#milestone-title-new`} quiet /></div>;
  return null;
}

function MyProduct({ project }: { project: Project }) {
  return <li className="product-card">
    <div className="product-head"><h3><a href={`/projects/${project.id}`}>{project.title}</a></h3><ProductStatus project={project} /></div>
    <RoadmapProgress project={project} />
    {project.nextMilestone && <p className="next-milestone"><span className="mono">Next</span>{project.nextMilestone}</p>}
    {project.progressPercentage === 100 && <p className="next-milestone"><span className="mono">Done</span>Every milestone is complete.</p>}
    <NextAction project={project} />
    <div className="card-actions"><DemoLink url={project.demoUrl} /><a className="text-link" href={`/projects/${project.id}`}>Open product page</a></div>
  </li>;
}

function CommunityRow({ project }: { project: Project }) {
  return <li className="community-row">
    <div className="community-main">
      <h3><a href={`/projects/${project.id}`}>{project.title}</a></h3>
      <span className="by mono">by {project.nickname}</span>
      <SummaryPreview project={project} />
    </div>
    <div className="community-meta">
      <RoadmapProgress project={project} />
      {project.demoUrl && <a className="text-link" href={project.demoUrl} rel="noreferrer" referrerPolicy="no-referrer">Open demo<Arrow /></a>}
    </div>
  </li>;
}

export function ProjectsPage({ data, search }: PageProps) {
  const access = data.access;
  const result = data.projects;
  if (data.kind !== "ok" || !result || (access.kind !== "member" && access.kind !== "instructor")) {
    return <AppShell data={data}><Retry href="/projects" /></AppShell>;
  }
  const message = search.get("message") ?? undefined;
  const isMember = access.kind === "member";
  return <AppShell data={data}>
    <PageHeader title="Products" lead={isMember ? (access.onboardingComplete ? "Keep your roadmap moving and see what classmates are building." : "Publish your first product to complete onboarding. You can browse classmates' products while you prepare it.") : "Every live product in the class."} />
    <ProjectMessage message={message} />
    {isMember && <section className="list-section" aria-labelledby="mine-title">
      <div className="section-head"><h2 id="mine-title">My products</h2><span className="mono">{result.mine.length} of 3 places</span>
        {result.mine.length > 0 && result.mine.length < 3 && <a className="button" href="/projects/connect">Connect another repository<Arrow /></a>}</div>
      {result.mine.length === 0 ? <EmptyState href="/projects/connect" action="Connect a repository">Connect a private GitHub repository to start your first product.</EmptyState> :
        <ul className="product-list">{result.mine.map(project => <MyProduct key={project.id} project={project} />)}</ul>}
    </section>}
    <section className="list-section" aria-labelledby="community-title">
      <div className="section-head"><h2 id="community-title">Community</h2><span className="mono">{result.community.length} live</span></div>
      {result.community.length === 0 ? <p className="quiet">No products are live yet. Published products show up here for the whole class.</p> :
        <ul className="community-list">{result.community.map(project => <CommunityRow key={project.id} project={project} />)}</ul>}
    </section>
  </AppShell>;
}
