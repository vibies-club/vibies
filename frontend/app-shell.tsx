import type { ReactNode } from "react";
import type { PageData } from "./contracts";
import { SignOut } from "./access-shell";
import "./hub.css";

type NavItem = { href: string; label: string; icon: ReactNode; active: (path: string) => boolean };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// Phone bar: the first four, then More. Wiki and the Instructor pages sit behind More on phones.
const main: NavItem[] = [
  { href: "/welcome", label: "Home", active: p => p === "/welcome", icon: <path {...stroke} d="M9.4 12.4 14 8.4l4.6 4M10.8 11.3v4.9h6.4v-4.9" /> },
  { href: "/course", label: "Course", active: p => p === "/course" || p.startsWith("/course/"), icon: <path {...stroke} d="M9 8.4h10v6.8H9zM14 15.2v2.4M11.6 17.6h4.8" /> },
  { href: "/projects", label: "Product", active: p => p === "/projects" || p.startsWith("/projects/"), icon: <path {...stroke} d="m14 7.4 4.6 2.6v5L14 17.6 9.4 15v-5zM9.6 10.2 14 12.7l4.4-2.5M14 12.7v4.8" /> },
  { href: "/collaborate", label: "Collaborate", active: p => p === "/collaborate" || p.startsWith("/collaborate/"), icon: <g {...stroke}><circle cx="10.6" cy="12" r="2.3" /><circle cx="17.4" cy="12" r="2.3" /><path d="M12.9 12h2.2" /></g> },
];

const wiki: NavItem = { href: "/wiki", label: "Wiki", active: p => p === "/wiki", icon: <path {...stroke} d="m9.8 9.4 3 2.6-3 2.6M14.6 15h4" /> };

const instructor: NavItem[] = [
  { href: "/admin/members", label: "Members", active: p => p === "/admin/members", icon: <g {...stroke}><circle cx="12" cy="10.3" r="1.9" /><path d="M8.6 16.6c.3-1.9 1.7-3 3.4-3s3.1 1.1 3.4 3" /><circle cx="17.1" cy="10.8" r="1.5" /><path d="M16.6 13.7c1.4.1 2.5 1 2.8 2.6" /></g> },
  { href: "/admin/gates", label: "Gates", active: p => p === "/admin/gates", icon: <path {...stroke} d="m9.8 12.3 2.8 2.8 5.6-6" /> },
];

function Glyph({ children }: { children: ReactNode }) {
  return <svg className="nav-glyph" viewBox="0 0 28 24" width="28" height="24" aria-hidden="true">
    <polygon className="nav-hex" points="7,1.2 21,1.2 26.8,12 21,22.8 7,22.8 1.2,12" />{children}
  </svg>;
}

function NavLink({ item, path, className }: { item: NavItem; path: string; className?: string }) {
  const current = item.active(path);
  return <li className={className}><a href={item.href} aria-current={current ? "page" : undefined}><Glyph>{item.icon}</Glyph><span>{item.label}</span></a></li>;
}

/** Every signed-in page: top bar on desktop, bottom tabs on phones. Denied and unknown access get the bar without navigation. */
export function AppShell({ data, children }: { data: PageData; children: ReactNode }) {
  const access = data.access;
  const path = window.location.pathname;
  const signedIn = access.kind === "member" || access.kind === "instructor";
  const extra = access.kind === "instructor" ? [wiki, ...instructor] : [wiki];
  const moreActive = extra.some(item => item.active(path));
  return <div className={signedIn ? `app has-tabs${access.kind === "instructor" ? " is-instructor" : ""}` : "app"}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-top">
      <a className="app-brand" href={signedIn ? "/welcome" : "/"}><img src="/home/logo.png" alt="" width={36} height={36} /><span>Vibies</span></a>
      {signedIn && <nav className="app-nav" aria-label="Main">
        <ul>
          {main.map(item => <NavLink key={item.href} item={item} path={path} />)}
          {extra.map(item => <NavLink key={item.href} item={item} path={path} className="nav-extra" />)}
          <li className="nav-more">
            <button type="button" popoverTarget="nav-more-menu" data-current={moreActive || undefined}>
              <Glyph><g fill="currentColor"><circle cx="10" cy="12" r="1.3" /><circle cx="14" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></g></Glyph><span>More</span>
            </button>
            <ul id="nav-more-menu" popover="auto" className="nav-more-menu" aria-label="More">
              {extra.map(item => <NavLink key={item.href} item={item} path={path} />)}
            </ul>
          </li>
        </ul>
      </nav>}
      {(signedIn || access.kind === "denied") && <div className="app-account">
        {signedIn && <span className="nickname-chip" title={access.nickname}>
          <svg viewBox="0 0 20 18" width="14" height="13" aria-hidden="true"><polygon points="5,1 15,1 19,9 15,17 5,17 1,9" /></svg>
          <span className="nickname-text">{access.nickname}</span>
          {access.kind === "instructor" && <span className="nickname-role">Instructor</span>}
        </span>}
        <SignOut />
      </div>}
    </header>
    <main id="main" className="app-main" tabIndex={-1}>{children}</main>
    <footer className="app-footer">Private community. Nicknames only.</footer>
  </div>;
}
