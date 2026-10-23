import type { PageData } from "../contracts";
import { AccessShell, Retry } from "../access-shell";
import { CopyCommand } from "../../app/wiki/copy-command";
import { filterEntries } from "../../lib/wiki-filter";

export function WikiPage({ data, search }: { data: PageData; search: URLSearchParams }) {
  if (data.kind === "error" || data.access.kind === "error") return <AccessShell data={data}><Retry href="/wiki" /></AccessShell>;
  const query = (search.get("q") ?? "").trim().slice(0, 200);
  const topic = (search.get("topic") ?? "").trim().slice(0, 60);
  const all = data.wiki ?? [];
  const wikiTopics = [...new Set(all.map(entry => entry.topic))];
  const entries = filterEntries(all, query, topic);
  const filtered = Boolean(query || topic);

  return <AccessShell data={data}><section className="wiki">
    <a href="/welcome">Back to welcome</a>
    <p className="eyebrow">THE CLASS REFERENCE</p>
    <h1>Command wiki</h1>
    <p className="intro">Find the command you need, learn what it does, and check where to use it.</p>
    <form action="/wiki" method="get" className="wiki-search" role="search">
      <div><label htmlFor="wiki-query">Search commands and notes</label>
        <input id="wiki-query" name="q" type="search" defaultValue={query} maxLength={200} placeholder="Try git status or split pane" /></div>
      <div><label htmlFor="wiki-topic">Topic</label>
        <select id="wiki-topic" name="topic" defaultValue={topic}>
          <option value="">All topics</option>
          {topic && !wikiTopics.includes(topic) && <option value={topic}>Unknown topic: {topic}</option>}
          {wikiTopics.map(item => <option key={item} value={item}>{item}</option>)}
        </select></div>
      <button type="submit">Search</button>
    </form>
    <div className="wiki-results"><p>{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
      {filtered && <a href="/wiki">Show all</a>}</div>
    <p className="hint">Replace any [placeholders] before running a command. You can also select its text and copy it manually.</p>
    {entries.length === 0 && <div className="wiki-empty"><h2>No commands found</h2><p>Try another word or choose All topics.</p></div>}
    {entries.map(entry => <article className="wiki-entry" id={entry.id} key={entry.id} aria-labelledby={`${entry.id}-title`}>
      <p className="eyebrow">{entry.topic} · {entry.where}</p>
      <h2 id={`${entry.id}-title`}><a href={`/wiki#${entry.id}`}>{entry.title}</a></h2>
      <p>{entry.usage}</p>
      {entry.command && <>
        <pre className="wiki-code" tabIndex={0} aria-label={`${entry.title}: command`}><code>{entry.command}</code></pre>
        <CopyCommand command={entry.command} />
      </>}
      {entry.keys && <p className="wiki-keys"><kbd>{entry.keys}</kbd></p>}
      <dl className="wiki-notes">
        <dt>Before you start</dt><dd>{entry.prerequisites}</dd>
        {entry.placeholders && <><dt>Replace</dt><dd>{entry.placeholders}</dd></>}
        <dt>What to expect</dt><dd>{entry.result}</dd>
      </dl>
      {entry.guide && <p><a href={entry.guide.href}>{entry.guide.label}</a></p>}
      <details><summary>Class sources</summary><ul>{entry.sources.map(source =>
        <li key={`${source.file}:${source.location}`}>{source.file}: {source.location}</li>
      )}</ul></details>
    </article>)}
  </section></AccessShell>;
}
