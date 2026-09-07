import { redirect } from "next/navigation";
import { accessState } from "../../lib/access";
import { AccessShell, Retry } from "../access-shell";

export const dynamic = "force-dynamic";
export default async function AccessDeniedPage() {
  const state = await accessState();
  if (state.kind === "signed_out") redirect("/sign-in?message=expired");
  if (state.kind === "member" || state.kind === "instructor") redirect("/welcome");
  return <AccessShell>{state.kind === "error" ? <Retry href="/access-denied" /> :
    <section><p className="eyebrow">PRIVATE COMMUNITY</p><h1>Access is not approved</h1>
      <p className="intro">You are signed in. Instructor approval is required to enter Vibies.</p>
      <a className="button secondary" href="/welcome">Check access again</a>
    </section>}</AccessShell>;
}
