import type { PageData } from "../contracts";
import { AccountLinks } from "../access-shell";

export function DemoPage({ data }: { data: PageData; search: URLSearchParams }) {
  const state = data.demo ?? { kind: "error" };
  return (
    <main>
      <header><a href="/demo" aria-label="Vibies demo home">vibies<span>.</span></a><span className="label">CLASS DEMO</span><nav className="account-controls" aria-label="Account"><AccountLinks data={data} /></nav></header>
      <section aria-labelledby="page-title">
        <p className="eyebrow">Built together. Stored for real.</p>
        <h1 id="page-title">A project with<br />a little memory.</h1>
        <p className="intro">One sample project, read from our shared database.</p>
        <article aria-label="Sample project">
          {state.kind === "ready" && <><p className="label">SAMPLE PROJECT</p><h2>{state.project.title}</h2><p>{state.project.summary}</p><span className="tag">Saved to our database</span></>}
          {state.kind === "empty" && <><h2>No sample project yet</h2><p>The demo is ready for its first sample.</p></>}
          {state.kind === "error" && <><h2>We could not load the sample</h2><p>Please refresh the page to try again.</p></>}

        </article>
      </section>
      <footer>Fictional sample data. Member projects stay private.</footer>
    </main>
  );
}
