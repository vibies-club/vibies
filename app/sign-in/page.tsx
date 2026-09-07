import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessState, cookieName } from "../../lib/access";
import { validToken } from "../../lib/access-core";
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
    limited: "You have started sign-in 10 times in 10 minutes. Please wait before trying again.",
    unavailable: "Sign-in is temporarily unavailable. Please try again later.",
    expired: "Please sign in again to continue.",
    signedout: "You are signed out of this browser.",
  };
  return <AccessShell><section><p className="eyebrow">VIBIES COMMUNITY</p><h1>A place to build together.</h1>
    <p className="intro">Sign in with GitHub. The Instructor must approve your access before you can enter.</p>
    {message && messages[message] && <p role="status">{messages[message]}</p>}
    <form action="/auth/start" method="post"><button type="submit">Continue with GitHub</button></form>
    <p className="hint">We keep your GitHub account ID and username for access checks. Members see your agreed nickname.</p>
  </section></AccessShell>;
}
