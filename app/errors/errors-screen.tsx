"use client";

import { useRef, useState, type ReactNode } from "react";
import { demoErrors, searchDemoErrors } from "../../lib/demo-errors";

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    Git: <><circle cx="7" cy="5" r="2" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="8" r="2" /><path d="M7 7v10M17 10v2c0 3-10 2-10 5" /></>,
    npm: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5" /></>,
    "Local server": <><rect x="4" y="3" width="16" height="7" rx="1" /><rect x="4" y="14" width="16" height="7" rx="1" /><path d="M7 6.5h.1M7 17.5h.1M12 6.5h5M12 17.5h5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 5 5L20 7" />,
  };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name] ?? <path d="m5 5 7 7-7 7M14 19h6" />}
  </svg>;
}

function Hex({ children, light = false }: { children?: ReactNode; light?: boolean }) {
  return <span className={`error-hex${light ? " error-hex-light" : ""}`} aria-hidden="true">
    <svg className="error-hex-shape" viewBox="0 0 60 52" fill="none"><path d="M15 .8h30L59.2 26 45 51.2H15L.8 26Z" /></svg>
    <span>{children}</span>
  </span>;
}

export function ErrorsScreen({ initialState, initialQuery }: {
  initialState: "results" | "loading" | "error";
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState(demoErrors[0].id);
  const [copyFeedback, setCopyFeedback] = useState({ id: "", message: "" });
  const heading = useRef<HTMLHeadingElement>(null);
  const matches = searchDemoErrors(query);
  const selected = matches.find(item => item.id === selectedId) ?? matches[0];
  const isPreview = initialState !== "results";

  async function copyError() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.error);
      setCopyFeedback({ id: selected.id, message: "Error text copied." });
    } catch {
      setCopyFeedback({ id: selected.id, message: "Copy is unavailable. Select the error text and copy it." });
    }
  }

  return <>
    <a className="errors-skip" href="#errors-main">Skip to common errors</a>
    <header className="errors-header">
      <a href="/" className="errors-brand"><Hex light />Vibies</a>
      <nav aria-label="Demo navigation"><a href="/demo">Projects</a><a href="/errors" aria-current="page">Common errors</a></nav>
    </header>
    <main id="errors-main" className="errors-workspace">
      <aside className="errors-index" aria-labelledby="errors-title">
        <h1 id="errors-title">Common errors</h1>
        <p className="errors-intro">Find the error. Follow the steps.<br />Get back to building.</p>
        <p className="errors-demo-label">Demo · 5 sample errors</p>
        <label className="errors-search">
          <Icon name="search" /><span className="errors-sr-only">Search common errors</span>
          <input type="search" placeholder="Search error text or a tool…" value={query} disabled={isPreview} onChange={event => setQuery(event.target.value)} />
        </label>
        <p className="errors-sr-only" role="status">{!isPreview && `${matches.length} ${matches.length === 1 ? "result" : "results"}.${selected ? ` Showing ${selected.title}.` : ""}`}</p>
        {!isPreview && matches.length > 0 && <ul className="errors-results" aria-label="Matching errors">
          {matches.map(item => <li key={item.id}>
            <button className="error-result" aria-pressed={item.id === selected?.id} aria-controls="error-detail" onClick={() => {
              setSelectedId(item.id);
              setCopyFeedback({ id: "", message: "" });
              if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => {
                heading.current?.focus({ preventScroll: true });
                heading.current?.scrollIntoView({ behavior: "instant", block: "start" });
              });
            }}>
              <Hex><Icon name={item.tool} /></Hex>
              <span className="error-result-text"><strong>{item.title}</strong><span>{item.tool}</span></span>
              <Icon name="chevron" />
            </button>
          </li>)}
        </ul>}
        {isPreview && <div className="errors-skeleton" aria-hidden="true">{demoErrors.map(item => <span key={item.id} />)}</div>}
        {!isPreview && matches.length === 0 && <p className="errors-no-match">No matching examples.</p>}
      </aside>

      <section className="error-detail" id="error-detail" aria-label="Error and solution">
        {initialState === "loading" ? <div className="errors-state">
          <Hex light><Icon name="search" /></Hex>
          <h2>Loading common errors</h2>
          <p role="status">Loading the examples and their solutions…</p>
          <p className="errors-preview-note">Demo preview: loading state.</p>
          <a className="errors-action" href="/errors">View examples</a>
        </div> : initialState === "error" ? <div className="errors-state">
          <Hex light><span>!</span></Hex>
          <h2>We could not load the examples</h2>
          <p role="alert">The error list is unavailable. Try again to return to the demo examples.</p>
          <p className="errors-preview-note">Demo preview: load failure.</p>
          <a className="errors-action" href="/errors">Try again</a>
        </div> : !selected ? <div className="errors-state">
          <Hex light><Icon name="search" /></Hex>
          <h2>No errors match your search</h2>
          <p>Try a short part of the error message or a tool name, such as Git or npm.</p>
          <button className="errors-action" onClick={() => setQuery("")}>Clear search</button>
        </div> : <>
          <div className="error-detail-heading">
            <h2 ref={heading} tabIndex={-1}>{selected.title}</h2>
            <p className="error-tool">{selected.tool}</p>
          </div>
          <h3>Error</h3>
          <div className="error-code"><code>{selected.error}</code><button className="error-copy" onClick={copyError} aria-label="Copy error text"><Icon name="copy" /></button></div>
          <p className="error-copy-feedback" role="status">{copyFeedback.id === selected.id ? copyFeedback.message : ""}</p>
          <h3>Cause</h3>
          <p className="error-cause">{selected.cause}</p>
          <h3>How to fix it</h3>
          <ol className="error-steps">{selected.steps.map((step, index) => <li key={step}><Hex light>{index + 1}</Hex><p>{step}</p></li>)}</ol>
          <div className="error-confirmation"><Hex><Icon name="check" /></Hex><div><h3>Success check</h3><p>{selected.confirmation}</p></div></div>
          <details className="error-location"><summary>Where it happened</summary><p>{selected.location}</p></details>
        </>}
      </section>
    </main>
    <footer className="errors-footer">
      <details><summary>Preview demo states</summary><nav aria-label="Demo state previews">
        <a href="/errors">Results</a><a href="/errors?q=no-such-example">No matches</a><a href="/errors?state=loading">Loading</a><a href="/errors?state=error">Load failure</a>
      </nav></details>
    </footer>
  </>;
}
