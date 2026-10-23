import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { Arrow, HexCell } from "../ui";

export function AccessDeniedPage({ data }: { data: PageData; search: URLSearchParams }) {
  const state = data.access;
  return <AppShell data={data}>{state.kind === "error" ? <Retry href="/access-denied" /> :
    <section className="notice">
      <HexCell className="notice-cell"><img src="/home/icon-access.png" alt="" width={48} height={48} /></HexCell>
      <h1>Access is not approved</h1>
      <p className="lead">You are signed in. Instructor approval is required to enter Vibies.</p>
      <a className="button primary" href="/welcome">Check access again<Arrow /></a>
    </section>}</AppShell>;
}
