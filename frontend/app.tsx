import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { PageData } from "./contracts";
import { isPagePath, loadPage, unavailableData, validatedRedirect } from "./api";
import { AccessShell, Retry } from "./access-shell";
import { HomePage } from "./pages/home";
import { DemoPage } from "./pages/demo";
import { SignInPage } from "./pages/sign-in";
import { AccessDeniedPage } from "./pages/access-denied";
import { WelcomePage } from "./pages/welcome";
import { MembersPage } from "./pages/members";
import { ProjectsPage } from "./pages/projects";
import { ConnectPage } from "./pages/connect";
import { ProjectPage } from "./pages/project";

const path = window.location.pathname;
const search = new URLSearchParams(window.location.search);

function Page({ data }: { data: PageData }) {
  const props = { data, search };
  switch (path) {
    case "/": return <HomePage {...props} />;
    case "/demo": return <DemoPage {...props} />;
    case "/sign-in": return <SignInPage {...props} />;
    case "/access-denied": return <AccessDeniedPage {...props} />;
    case "/welcome": return <WelcomePage {...props} />;
    case "/admin/members": return <MembersPage {...props} />;
    case "/projects": return <ProjectsPage {...props} />;
    case "/projects/connect": return <ConnectPage {...props} />;
    default: return <ProjectPage {...props} />;
  }
}

export function App() {
  const [data, setData] = useState<PageData | null>(null);
  useEffect(() => {
    if (!isPagePath(path)) return;
    let active = true;
    let request: AbortController | undefined;
    const refresh = async () => {
      if (request || document.visibilityState === "hidden") return;
      const controller = new AbortController();
      request = controller;
      setData(null);
      try {
        const next = await loadPage(path, search, controller.signal);
        if (!active || controller.signal.aborted) return;
        if (next.redirect) {
          const destination = validatedRedirect(next.redirect);
          if (destination) { window.location.replace(destination); return; }
        }
        setData(next);
      } catch {
        if (active && !controller.signal.aborted) setData(unavailableData);
      } finally {
        if (request === controller) request = undefined;
      }
    };
    const clear = () => {
      request?.abort();
      request = undefined;
      // Remove private content before this document can enter the back-forward cache.
      flushSync(() => setData(null));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clear();
      else void refresh();
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", onPageShow);
    void refresh();
    return () => {
      active = false;
      request?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  if (!isPagePath(path)) return <AccessShell data={unavailableData}><section><h1>Page not found</h1><a href="/">Go home</a></section></AccessShell>;
  const content = path === "/" ? <HomePage data={data ?? unavailableData} search={search} /> :
    data === null ? <AccessShell data={unavailableData}><section role="status" aria-live="polite" aria-busy="true"><h1>Checking your access</h1><p>Please wait.</p></section></AccessShell> :
    data.kind === "error" || data.access.kind === "error" ? <AccessShell data={unavailableData}><Retry href={`${path}${window.location.search}`} /></AccessShell> : <Page data={data} />;
  return <>
    {data?.staging && <aside className="staging-banner" aria-label="Staging version">Staging · Test content · <code title={data.staging.sha}>{data.staging.sha.slice(0, 7)}</code></aside>}
    {content}
  </>;
}
