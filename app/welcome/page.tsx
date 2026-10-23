import { redirect } from "next/navigation";
import { accessState } from "../../lib/access";
import { googleLinkStatus } from "../../lib/google-auth/server";
import { AccessShell, Retry } from "../access-shell";

export const dynamic = "force-dynamic";
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const state = await accessState();
  if (state.kind === "signed_out") redirect("/sign-in?message=expired");
  if (state.kind === "denied") redirect("/access-denied");
  const linking = state.kind === "member" || state.kind === "instructor" ? await googleLinkStatus() : null;
  const { google } = await searchParams;
  const googleMessage = google === "linked" && linking?.linked ? "Google sign-in is linked." : google === "failed" ? "Google linking did not finish. Please try again." : google === "reauth" ? "Sign out and sign in with GitHub again before linking Google." : null;
  return <AccessShell>{state.kind === "error" ? <Retry /> :
    <section><p className="eyebrow">YOUR COMMUNITY</p><h1>Welcome, {state.nickname}.</h1>
      <p className="intro">You have access to Vibies. This is the first step in building our community.</p>
      <p><a className="button" href="/projects">Browse projects</a></p>
      <p><a className="button secondary" href="/wiki">Command wiki</a></p>
      {state.kind === "instructor" && <a className="button" href="/admin/members">Manage member access</a>}
      {googleMessage && <p role="status">{googleMessage}</p>}
      {linking && (linking.linked ? (googleMessage ? null : <p className="hint">Google sign-in is linked to your account.</p>) : linking.canLink ?
        <form action="/auth/google/link" method="post"><button type="submit" className="secondary">Link Google sign-in</button></form> :
        <p className="hint">To link Google, sign out and sign in with GitHub again.</p>)}
    </section>}</AccessShell>;
}
