import { redirect } from "next/navigation";
import { accessState } from "../../lib/access";
import { AccessShell, Retry } from "../access-shell";

export const dynamic = "force-dynamic";
export default async function WelcomePage() {
  const state = await accessState();
  if (state.kind === "signed_out") redirect("/sign-in?message=expired");
  if (state.kind === "denied") redirect("/access-denied");
  return <AccessShell>{state.kind === "error" ? <Retry /> :
    <section><p className="eyebrow">YOUR COMMUNITY</p><h1>Welcome, {state.nickname}.</h1>
      <p className="intro">You have access to Vibies. This is the first step in building our community.</p>
      <p><a className="button" href="/projects">Browse projects</a></p>
      {state.kind === "instructor" && <a className="button" href="/admin/members">Manage member access</a>}
    </section>}</AccessShell>;
}
