import { cookies } from "next/headers";
import { cookieName } from "../lib/access";

export function SignOut() {
  return <form action="/auth/sign-out" method="post"><button type="submit" className="secondary">Sign out</button></form>;
}

export async function AccessShell({ children, className, brand }: { children: React.ReactNode; className?: string; brand?: React.ReactNode }) {
  const signedIn = (await cookies()).has(cookieName("session"));
  return <main className={className ? `access ${className}` : "access"}>
    <header><a href="/demo" aria-label="Vibies home">{brand ?? <>vibies<span>.</span></>}</a><nav aria-label="Account">{signedIn ? <SignOut /> : <a href="/sign-in">Sign in</a>}</nav></header>
    {children}
    <footer>Private community. Nicknames only. <a href="/demo">View the public demo</a></footer>
  </main>;
}

export function Retry({ href = "/welcome" }: { href?: string }) {
  return <section><h1>We could not check your access</h1><p>No private information was loaded. Please try again.</p><a className="button" href={href}>Try again</a></section>;
}
