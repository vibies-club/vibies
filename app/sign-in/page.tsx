import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessState, cookieName } from "../../lib/access";
import { validToken } from "../../lib/access-core";
import { Retry } from "../access-shell";
import { Arrow, GitHubMark, PrivacyNote, SignInShell } from "./sign-in-shell";

export const dynamic = "force-dynamic";
export default async function SignInPage({ searchParams }: {searchParams: Promise<{message?: string}>}) {
  if (!validToken((await cookies()).get(cookieName("browser"))?.value)) redirect("/auth/browser");
  const state = await accessState();
  if (state.kind === "member" || state.kind === "instructor") redirect("/welcome");
  if (state.kind === "denied") redirect("/access-denied");
  if (state.kind === "error") return <SignInShell><Retry href="/sign-in" /></SignInShell>;
  const { message } = await searchParams;
  const messages: Record<string, string> = {
    failed: "Sign-in did not finish. Please try again.",
    limited: "You have started sign-in 10 times in 10 minutes. Please wait before trying again.",
    unavailable: "Sign-in is temporarily unavailable. Please try again later.",
    expired: "Please sign in again to continue.",
    signedout: "You are signed out of this browser.",
  };
  return <SignInShell><section aria-labelledby="sign-in-title"><h1 id="sign-in-title"><span>A place to build</span> together.</h1>
    <p className="intro">Sign in with GitHub. The Instructor must approve your access before you can enter.</p>
    {message && Object.hasOwn(messages, message) && <div className="sign-in-status"><svg aria-hidden="true" viewBox="0 0 32 28" width="32" height="28"><polygon points="8,1 24,1 31,14 24,27 8,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M16 7v9m0 4v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><p role="status">{messages[message]}</p></div>}
    <form action="/auth/start" method="post"><button type="submit"><GitHubMark /><span>Continue with GitHub</span><Arrow /></button></form>
    <PrivacyNote />
  </section></SignInShell>;
}
