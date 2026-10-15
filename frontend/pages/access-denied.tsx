import type { PageData } from "../contracts";
import { AccessShell, Retry } from "../access-shell";

export function AccessDeniedPage({ data }: { data: PageData; search: URLSearchParams }) {
  const state = data.access;
  return <AccessShell data={data}>{state.kind === "error" ? <Retry href="/access-denied" /> :
    <section><p className="eyebrow">PRIVATE COMMUNITY</p><h1>Access is not approved</h1>
      <p className="intro">You are signed in. Instructor approval is required to enter Vibies.</p>
      <a className="button secondary" href="/welcome">Check access again</a>
    </section>}</AccessShell>;
}
