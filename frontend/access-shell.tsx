import type { PageData } from "./contracts";

export function SignOut() {
  return <form action="/auth/sign-out" method="post"><button type="submit" className="secondary">Sign out</button></form>;
}

export function AccountLinks({ data }: { data: PageData }) {
  const state = data.access;
  return state.kind === "member" || state.kind === "instructor" || state.kind === "denied"
    ? <><a href="/welcome">My account</a><SignOut /></>
    : <a href="/sign-in">Sign in</a>;
}

export function AccessShell({ data, children }: { data: PageData; children: React.ReactNode }) {
  return <main className="access">
    <header><a href="/" aria-label="Vibies home">vibies<span>.</span></a><nav className="account-controls" aria-label="Account"><AccountLinks data={data} /></nav></header>
    {children}
    <footer>Private community. Nicknames only. <a href="/demo">View the public demo</a></footer>
  </main>;
}

export function Retry({ href = "/welcome" }: { href?: string }) {
  return <section><h1>We could not check your access</h1><p>No private information was loaded. Please try again.</p><a className="button" href={href}>Try again</a></section>;
}
