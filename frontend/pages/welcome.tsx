import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, Card, EmptyState, HexBadge, HexCell, MessageBanner, PageHeader, Progress } from "../ui";
import { ProductStatus } from "../project-ui";
import { daysUntil, localToday, nextSession, type CourseManifest, type CourseSession, type GateCheck } from "../../lib/course";
import type { Project } from "../../lib/project-read";

const SOON = "Course schedule coming soon.";

function longDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function NextClass({ session, quiet }: { session: CourseSession | null; quiet?: boolean }) {
  if (!session) return <Card title="Next class" className="home-next"><p className="quiet">{SOON}</p></Card>;
  return <Card title="Next class" meta={session.date ? `S${session.n} · ${longDate(session.date)}` : `S${session.n}`} className="home-next">
    <div className="next-class">
      <HexCell className="session-cell"><span className="mono">S{session.n}</span></HexCell>
      <div>
        <h3 className="next-title">{session.title}</h3>
        <p className="next-goal">{session.goal}</p>
        <a className={quiet ? "button" : "button primary"} href={`/course/${session.n}`}>{session.deck ? "Open slides" : `Open S${session.n}`}<Arrow /></a>
      </div>
    </div>
  </Card>;
}

function gateState(checks: GateCheck[], n: number, id: string) {
  const state = checks.find(check => check.sessionNo === n && check.itemId === id)?.state;
  return state === "done" ? { tone: "strong" as const, label: "Done" } : state === "needs_work" ? { tone: "plain" as const, label: "Needs work" } : { tone: "muted" as const, label: "To do" };
}

function Gate({ session, checks }: { session: CourseSession | null; checks: GateCheck[] }) {
  if (!session) return <Card title="This week's gate" className="home-gate"><p className="quiet">{SOON}</p></Card>;
  return <Card title="This week's gate" meta={`S${session.n}`} className="home-gate">
    {session.gate.length === 0 ? <p className="quiet">No gate for this session.</p> :
      <ul className="gate-list">{session.gate.map(item => {
        const state = gateState(checks, session.n, item.id);
        return <li key={item.id}><span>{item.text}</span><HexBadge tone={state.tone}>{state.label}</HexBadge></li>;
      })}</ul>}
    <a className="text-link" href={`/course/${session.n}`}>Open S{session.n}</a>
  </Card>;
}

function nextStep(project: Project, roadmap: Project["roadmap"]) {
  if (project.connection === "Disconnected") return { text: "Your repository is disconnected. Check the connection on your product page.", action: "Check connection" };
  if (project.publication === "Draft") return { text: "Your draft is ready. Publish it so classmates can see it.", action: "Review and publish" };
  if (roadmap && roadmap.totalCount === 0) return { text: "Add your first milestone so classmates can follow your progress.", action: "Add a milestone" };
  return null;
}

function Unavailable({ title, className, href, link }: { title: string; className: string; href: string; link: string }) {
  return <Card title={title} className={className}><p className="quiet">We could not load this right now. <a className="text-link" href={href}>{link}</a></p></Card>;
}

function Product({ mine, detail, onboarded, quiet }: { mine?: Project[]; detail?: Project; onboarded: boolean; quiet: boolean }) {
  if (!mine) return <Card title="Your product" className="home-product"><p className="quiet">We could not load your product. <a className="text-link" href="/projects">Open Products.</a></p></Card>;
  const project = mine[0];
  if (!project) return <Card title="Your product" className="home-product">
    <EmptyState href="/projects/connect" action="Connect a repository" quiet={quiet}>
      {onboarded ? "Connect a private repository to start your next product." : "Connect a private repository to start your product. Publishing it completes onboarding."}
    </EmptyState>
  </Card>;
  const roadmap = detail?.id === project.id ? detail.roadmap : undefined;
  const next = roadmap?.milestones.find(milestone => !milestone.completed);
  const step = nextStep(project, roadmap);
  return <Card title="Your product" meta={mine.length > 1 ? `1 of ${mine.length}` : undefined} className="home-product">
    <div className="product-head">
      <h3><a href={`/projects/${project.id}`}>{project.title}</a></h3>
      <ProductStatus project={project} />
    </div>
    {roadmap && roadmap.totalCount > 0 && <Progress value={roadmap.percentage ?? 0} label="Roadmap progress" detail={`${roadmap.completedCount} of ${roadmap.totalCount} milestones`} />}
    {next && <p className="next-milestone"><span className="mono">Next</span> {next.title}{next.blockedNote && <HexBadge>Blocked</HexBadge>}</p>}
    {step ? <EmptyState href={step.action === "Add a milestone" ? `/projects/${project.id}#roadmap-title` : `/projects/${project.id}`} action={step.action} quiet={quiet}>{step.text}</EmptyState> :
      <div className="card-actions">
        {project.demoUrl && <a className="button" href={project.demoUrl} rel="noreferrer" referrerPolicy="no-referrer">Open demo<Arrow /></a>}
        <a className="text-link" href={`/projects/${project.id}`}>Open product page</a>
      </div>}
  </Card>;
}

function Waiting({ data }: { data: PageData }) {
  const members = data.members;
  if (!members) return <Unavailable title="Members waiting" className="home-gate" href="/admin/members" link="Open Members." />;
  const waiting = members.accounts.filter(account => account.status === "unapproved").length;
  return <Card title="Members waiting" className="home-gate">
    <div className="stat">
      <HexCell className="stat-cell"><span className="mono">{waiting}</span></HexCell>
      <p>{waiting === 0 ? "Nobody is waiting for approval." : waiting === 1 ? "One account is waiting for approval." : `${waiting} accounts are waiting for approval.`}
        <span className="mono stat-note">{members.activeCount} of 8 places filled</span></p>
    </div>
    <a className="text-link" href="/admin/members">Review members</a>
  </Card>;
}

function Community({ count }: { count: number }) {
  return <Card title="Community" className="home-product">
    <div className="stat">
      <HexCell className="stat-cell"><span className="mono">{count}</span></HexCell>
      <p>{count === 1 ? "One product is live for the class." : `${count} products are live for the class.`}</p>
    </div>
    <a className="text-link" href="/projects">See all products</a>
  </Card>;
}

function DemoDay({ course, today }: { course?: CourseManifest; today: string }) {
  if (!course) return <p className="demo-day"><span className="mono">Demo Day</span><span className="quiet">{SOON}</span></p>;
  const days = daysUntil(course.demoDay, today);
  const when = days > 1 ? `${days} days to go` : days === 1 ? "Tomorrow" : days === 0 ? "Today" : "Done";
  return <p className="demo-day"><span className="mono">Demo Day</span><span className="mono">{longDate(course.demoDay)}</span><HexBadge tone={days >= 0 && days <= 7 ? "strong" : "plain"}>{when}</HexBadge></p>;
}

export function WelcomePage({ data, search }: { data: PageData; search: URLSearchParams }) {
  const state = data.access;
  const linking = data.linking;
  const google = search.get("google");
  const googleMessage = google === "linked" && linking?.linked ? "Google sign-in is linked." : google === "failed" ? "Google linking did not finish. Please try again." : google === "reauth" ? "Sign out and sign in with GitHub again before linking Google." : null;
  if (state.kind === "error" || (state.kind !== "member" && state.kind !== "instructor")) return <AppShell data={data}><Retry /></AppShell>;
  const today = localToday();
  const session = data.course ? nextSession(data.course, today) : null;
  const projects = data.projects;
  const detail = data.project?.kind === "ok" ? data.project.project : undefined;
  return <AppShell data={data}>
    <PageHeader title={<>Hi, {state.nickname}.</>} lead={state.kind === "instructor" ? "Your class at a glance." : "Your week at a glance."} />
    {googleMessage && <MessageBanner>{googleMessage}</MessageBanner>}
    <div className="dashboard">
      <NextClass session={session} />
      {state.kind === "instructor" ? <>
        <Waiting data={data} />
        {projects ? <Community count={projects.community.length} /> : <Unavailable title="Community" className="home-product" href="/projects" link="Open Products." />}
      </> : <>
        <Gate session={session} checks={data.gates?.mine ?? []} />
        <Product mine={projects?.mine} detail={detail} onboarded={state.onboardingComplete === true} quiet={session !== null} />
      </>}
    </div>
    <DemoDay course={data.course} today={today} />
    <section className="account" aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      {linking ? (linking.linked ? (googleMessage ? null : <p className="hint">Google sign-in is linked to your account.</p>) : linking.canLink ?
        <form action="/auth/google/link" method="post"><button type="submit" className="secondary">Link Google sign-in</button></form> :
        <p className="hint">To link Google, sign out and sign in with GitHub again.</p>) :
        <p className="hint">You sign in with GitHub. Your classmates see your nickname, {state.nickname}.</p>}
    </section>
  </AppShell>;
}
