import type { PageData } from "../contracts";
import { AccessShell, Retry } from "../access-shell";

export function WelcomePage({ data, search }: { data: PageData; search: URLSearchParams }) {
  const state = data.access;
  const linking = data.linking;
  const google = search.get("google");
  const googleMessage = google === "linked" && linking?.linked ? "Google sign-in is linked." : google === "failed" ? "Google linking did not finish. Please try again." : google === "reauth" ? "Sign out and sign in with GitHub again before linking Google." : null;
  return <AccessShell data={data}>{state.kind === "error" ? <Retry /> :
    <section><p className="eyebrow">YOUR COMMUNITY</p><h1>Welcome, {state.nickname}.</h1>
      <p className="intro">You have access to Vibies. This is the first step in building our community.</p>
      <p><a className="button" href="/projects">Browse projects</a></p>
      {state.kind === "instructor" && <a className="button" href="/admin/members">Manage member access</a>}
      {googleMessage && <p role="status">{googleMessage}</p>}
      {linking && (linking.linked ? (googleMessage ? null : <p className="hint">Google sign-in is linked to your account.</p>) : linking.canLink ?
        <form action="/auth/google/link" method="post"><button type="submit" className="secondary">Link Google sign-in</button></form> :
        <p className="hint">To link Google, sign out and sign in with GitHub again.</p>)}
    </section>}</AccessShell>;
}
