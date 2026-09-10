import { readDemoProject } from "../../lib/supabase";
import { cookies } from "next/headers";
import { cookieName } from "../../lib/access";
import { SignOut } from "../access-shell";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const state = await readDemoProject();
  const signedIn = (await cookies()).has(cookieName("session"));
  return (
    <main>
      <header><a href="/demo" aria-label="Vibies demo home">vibies<span>.</span></a><span className="label">CLASS DEMO</span>{signedIn ? <SignOut /> : <a href="/sign-in">Sign in</a>}</header>
      <section aria-labelledby="page-title">
        <p className="eyebrow">Built together. Stored for real.</p>
        <h1 id="page-title">A project with<br />a little memory.</h1>
        <p className="intro">One sample project, read from our shared database.</p>
        <article aria-label="Sample project">
          {state.kind === "ready" && <><p className="label">SAMPLE PROJECT</p><h2>{state.project.title}</h2><p>{state.project.summary}</p><span className="tag">Stored in Supabase</span></>}
          {state.kind === "empty" && <><h2>No sample project yet</h2><p>The demo is ready for its first sample.</p></>}
          {state.kind === "error" && <><h2>We could not load the sample</h2><p>Please refresh the page to try again.</p></>}
          {state.kind === "configuration" && <><h2>Setup is incomplete</h2><p>{state.missing.length ? "The app needs these settings:" : "Check the project URL and publishable key in the app settings."}</p>{state.missing.length > 0 && <ul>{state.missing.map(name => <li key={name}><code>{name}</code></li>)}</ul>}</>}
        </article>
      </section>
      <footer>Fictional sample data. Member projects stay private.</footer>
    </main>
  );
}
