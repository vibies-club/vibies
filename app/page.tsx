import Image, { type StaticImageData } from "next/image";
import localFont from "next/font/local";
import bee from "../public/home/bee.png";
import logo from "../public/home/logo.png";
import iconAccess from "../public/home/icon-access.png";
import iconShare from "../public/home/icon-share.png";
import iconFeedback from "../public/home/icon-feedback.png";
import iconCode from "../public/home/icon-code.png";
import "./home.css";

const display = localFont({ src: "./fonts/bricolage-grotesque.woff2", weight: "200 800", variable: "--font-display", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono.woff2", weight: "100 800", variable: "--font-mono", display: "swap" });

const REPO = "https://github.com/vibies-club/vibies";

function Hex({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`hex ${className ?? ""}`}>
    <svg className="hex-shape" viewBox="0 0 100 86.6" preserveAspectRatio="none" aria-hidden="true"><polygon points="25,0.8 75,0.8 99.2,43.3 75,85.8 25,85.8 0.8,43.3" /></svg>
    <div className="hex-body">{children}</div>
  </div>;
}

function Cell({ n, icon, title, note }: { n: number; icon?: StaticImageData; title: string; note?: string }) {
  return <li className={`hive-cell hive-cell-${n}`} style={{ "--i": n } as React.CSSProperties}>
    <Hex>
      {icon && <Image src={icon} alt="" sizes="96px" className="hive-icon" />}
      <span className="hive-title">{title}</span>
      {note && <span className="hive-note">{note}</span>}
    </Hex>
  </li>;
}

const steps = [
  { title: "Get access", text: "Sign in with GitHub. Your instructor approves you." },
  { title: "Share a project", text: "Connect a repository and describe it in your words." },
  { title: "Build together", text: "Show progress and give useful feedback." },
];

const roadmap = [
  { title: "GitHub sign‑in", state: "Done" },
  { title: "Project sharing", state: "Done" },
  { title: "Feedback", state: "Planned" },
];

const benefits = [
  { title: "Visible progress", text: "Share a project and its next step.", icon: <><rect x="5" y="16" width="5" height="10" rx="1" /><rect x="13.5" y="9" width="5" height="17" rx="1" /><rect x="22" y="12" width="5" height="14" rx="1" /></> },
  { title: "Learn by making", text: "See what others build and talk about it.", icon: <><circle cx="11" cy="10.5" r="4.5" /><circle cx="22.5" cy="12" r="3.5" /><path d="M3 27c0-5 3.6-8 8-8s8 3 8 8z" /><path d="M20 27c0-2.6-.8-4.8-2.2-6.3a7 7 0 0 1 4.7-1.7c3.6 0 6.5 2.5 6.5 8z" /></> },
  { title: "Private by design", text: "Instructor approval. Nicknames only.", icon: <><path d="M11 14V10a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2.6" /><rect x="6.5" y="14" width="19" height="13" rx="2.5" /></> },
];

export default function Home() {
  return <main className={`home ${display.variable} ${mono.variable}`}>
    <header className="home-header">
      <a className="home-brand" href="#top"><Image src={logo} alt="" width={40} height={40} priority /><span>Vibies</span></a>
      <nav aria-label="Page sections"><a href="#how-it-works">How it works</a><a href="#benefits">Benefits</a><a href="#coming-soon">Coming soon</a></nav>
    </header>

    <section className="home-hero" id="top" aria-labelledby="home-title">
      <h1 id="home-title" className="rise"><span className="home-accent">Build real projects</span> together.</h1>
      <p className="home-support rise">A private, instructor-led community for beginners.</p>
      <a className="home-cta rise" href="#coming-soon">See what&apos;s coming<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></a>

      <figure className="hive" aria-labelledby="hive-caption">
        <div className="hive-bee"><Image src={bee} alt="The Vibies bee typing on a laptop" priority sizes="(max-width: 760px) 70vw, 380px" /></div>
        <ul className="hive-cells">
          <Cell n={1} icon={logo} title="Vibies" note="Our class project" />
          <Cell n={2} icon={iconAccess} title="GitHub sign‑in" note="Done" />
          <Cell n={3} icon={iconShare} title="Project sharing" note="Done" />
          <Cell n={4} icon={iconCode} title="Open source" note="On GitHub" />
          <Cell n={5} icon={iconFeedback} title="Feedback" note="Planned" />
          <Cell n={6} title="Built by" note="the class" />
        </ul>
        <figcaption id="hive-caption" className="home-label">Real project · Vibies, built by our class</figcaption>
      </figure>
    </section>

    <section className="home-problem reveal" aria-labelledby="problem-title">
      <h2 id="problem-title">Progress is hard alone.</h2>
      <p>Vibies gives beginners a private place to share work as it grows.</p>
    </section>

    <div className="home-chain" aria-hidden="true" />

    <section className="home-how" id="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title" className="reveal">How it works</h2>
      <ol className="home-steps">
        {steps.map((step, i) => <li key={step.title} className="reveal" style={{ "--i": i } as React.CSSProperties}>
          <Hex><span className="step-number">{String(i + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.text}</p></Hex>
        </li>)}
      </ol>
    </section>

    <section className="home-project reveal" aria-labelledby="project-title">
      <div className="window-bar" aria-hidden="true"><i /><i /><i /><span>github.com/vibies-club/vibies</span></div>
      <div className="project-body">
        <div className="project-owner">
          <Hex className="project-mark"><Image src={logo} alt="" sizes="96px" /></Hex>
          <span>Built by our class</span>
        </div>
        <div className="project-main">
          <h2 id="project-title">Vibies</h2>
          <p>The private home for our class projects. We build it in the open, one pull request at a time.</p>
          <a href={REPO} rel="noreferrer">See the code on GitHub</a>
          <ol className="home-roadmap" aria-label="Vibies roadmap">
            {roadmap.map(item => <li key={item.title} className={item.state === "Done" ? "is-done" : "is-next"}>
              <Hex className="home-roadmap-node">{item.state === "Done"
                ? <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><polygon points="7,3 17,3 22,12 17,21 7,21 2,12" fill="currentColor" /></svg>}</Hex>
              <span className="home-roadmap-title">{item.title}</span>
              <span className="home-roadmap-state">{item.state}</span>
            </li>)}
          </ol>
        </div>
      </div>
    </section>

    <section className="home-benefits" id="benefits" aria-labelledby="benefits-title">
      <h2 id="benefits-title" className="reveal">A place for the work as it grows.</h2>
      <ul>
        {benefits.map((b, i) => <li key={b.title} className="reveal" style={{ "--i": i } as React.CSSProperties}>
          <Hex className="benefit-icon"><svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true">{b.icon}</svg></Hex>
          <div><h3>{b.title}</h3><p>{b.text}</p></div>
        </li>)}
      </ul>
    </section>

    <section className="home-coming" id="coming-soon" aria-labelledby="coming-title">
      <h2 id="coming-title" className="reveal">Coming soon.</h2>
      <p className="reveal">Ask your instructor for an invitation.</p>
    </section>

    <footer className="home-footer">
      <span className="home-brand"><Image src={logo} alt="" width={36} height={36} /><span>Vibies</span></span>
      <a href="https://github.com/vibies-club/vibies/blob/main/RULES.md" rel="noreferrer">Community rules</a>
    </footer>
  </main>;
}
