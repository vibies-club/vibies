import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessState, cookieName } from "../../lib/access";
import { validToken } from "../../lib/access-core";
import { googleEnabled } from "../../lib/google-auth/server";
import { AccessShell, Retry } from "../access-shell";

export const dynamic = "force-dynamic";
export default async function SignInPage({ searchParams }: {searchParams: Promise<{message?: string}>}) {
  if (!validToken((await cookies()).get(cookieName("browser"))?.value)) redirect("/auth/browser");
  const state = await accessState();
  if (state.kind === "member" || state.kind === "instructor") redirect("/welcome");
  if (state.kind === "denied") redirect("/access-denied");
  if (state.kind === "error") return <AccessShell><Retry href="/sign-in" /></AccessShell>;
  const { message } = await searchParams;
  const messages: Record<string, string> = {
    failed: "Sign-in did not finish. Please try again.",
    googlelink: "First sign in with GitHub, then link Google from your account.",
    limited: "You have started sign-in 10 times in 10 minutes. Please wait before trying again.",
    unavailable: "Sign-in is temporarily unavailable. Please try again later.",
    expired: "Please sign in again to continue.",
    signedout: "You are signed out of this browser.",
  };
  return <AccessShell><section><h1>A place to build together.</h1>
    <p className="intro">Sign in with GitHub. New accounts wait for Instructor approval before entering.</p>
    {message && Object.hasOwn(messages, message) && <p role="status">{messages[message]}</p>}
    <form action="/auth/start" method="post"><button type="submit" className="sign-in-primary">Continue with GitHub</button></form>
    {googleEnabled() && <div className="sign-in-google"><p className="hint" id="google-sign-in-hint">Already linked Google to your approved GitHub account?</p>
      <form action="/auth/google/start" method="post"><button type="submit" aria-describedby="google-sign-in-hint">Continue with Google</button></form></div>}
    <p className="hint">We keep your GitHub account ID and username for access checks. Members see your agreed nickname.</p>
  </section></AccessShell>;
}
