import type { PageData } from "../contracts";
import { AccessShell } from "../access-shell";
import { privateReturnPath } from "../api";
import "../../app/sign-in/sign-in.css";

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GitHubMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.09c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.01-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.77 10.77 0 0 1 5.64 0c2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.69.11 2.98.72.78 1.16 1.78 1.16 3.01 0 4.32-2.64 5.27-5.15 5.55.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>;
}

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
  return <AccessShell data={data} className="sign-in" brand={<><img src="/home/logo.png" alt="" width={40} height={40} /><span>Vibies</span></>}>
    <div className="sign-in-body">
      <section aria-labelledby="sign-in-title"><h1 id="sign-in-title"><span>A place to build</span> together.</h1>
        <p className="intro">Sign in with GitHub. The Instructor must approve your access before you can enter.</p>
        {message && Object.hasOwn(messages, message) && <div className="sign-in-status"><svg aria-hidden="true" viewBox="0 0 32 28" width="32" height="28"><polygon points="8,1 24,1 31,14 24,27 8,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M16 7v9m0 4v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><p role="status">{messages[message]}</p></div>}
        <form action="/auth/start" method="post">{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}<button type="submit"><GitHubMark /><span>Continue with GitHub</span><Arrow /></button></form>
        {data.googleEnabled && <div className="sign-in-google"><p className="hint" id="google-sign-in-hint">Already linked Google to your approved GitHub account?</p>
          <form action="/auth/google/start" method="post">{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}<button type="submit" aria-describedby="google-sign-in-hint">Continue with Google</button></form></div>}
        <div className="sign-in-privacy">
          <div className="sign-in-badge" aria-hidden="true">
            <svg viewBox="0 0 100 86.6"><polygon points="25,0.8 75,0.8 99.2,43.3 75,85.8 25,85.8 0.8,43.3" /></svg>
            <img src="/home/icon-access.png" alt="" width={48} height={48} />
          </div>
          <p className="hint">We keep your GitHub account ID and username for access checks. Members see your agreed nickname.</p>
        </div>
      </section>
      <div className="sign-in-mascot" aria-hidden="true"><img src="/home/bee.png" alt="" width={380} height={380} /></div>
    </div>
  </AccessShell>;
}
