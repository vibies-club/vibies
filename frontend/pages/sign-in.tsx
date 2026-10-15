import type { PageData } from "../contracts";
import { AccessShell } from "../access-shell";
import { privateReturnPath } from "../api";

export function SignInPage({ data, search }: { data: PageData; search: URLSearchParams }) {
  const message = search.get("message");
  const returnTo = privateReturnPath(search.get("returnTo"));
  const messages: Record<string, string> = {
    failed: "Sign-in did not finish. Please try again.",
    googlelink: "First sign in with GitHub, then link Google from your account.",
    limited: "You have started sign-in 10 times in 10 minutes. Please wait before trying again.",
    unavailable: "Sign-in is temporarily unavailable. Please try again later.",
    expired: "Please sign in again to continue.",
    signedout: "You are signed out of this browser.",
  };
  return <AccessShell data={data}><section><h1>A place to build together.</h1>
    <p className="intro">Sign in with GitHub. New accounts wait for Instructor approval before entering.</p>
    {message && Object.hasOwn(messages, message) && <p role="status">{messages[message]}</p>}
    <form action="/auth/start" method="post">{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}<button type="submit" className="sign-in-primary">Continue with GitHub</button></form>
    {data.googleEnabled && <div className="sign-in-google"><p className="hint" id="google-sign-in-hint">Already linked Google to your approved GitHub account?</p>
      <form action="/auth/google/start" method="post">{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}<button type="submit" aria-describedby="google-sign-in-hint">Continue with Google</button></form></div>}
    <p className="hint">We keep your GitHub account ID and username for access checks. Members see your agreed nickname.</p>
  </section></AccessShell>;
}
