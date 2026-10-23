import { useId, type ReactNode } from "react";

const HEX = "25,0.8 75,0.8 99.2,43.3 75,85.8 25,85.8 0.8,43.3";

export function Arrow() {
  return <svg className="arrow" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** The outlined flat-topped hexagon holding one fact. */
export function HexCell({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={`hex-cell ${className ?? ""}`}>
    <svg viewBox="0 0 100 86.6" preserveAspectRatio="none" aria-hidden="true"><polygon points={HEX} /></svg>
    <span className="hex-cell-body">{children}</span>
  </span>;
}

export type BadgeTone = "strong" | "plain" | "muted";

/** A status word beside a small hexagon. The word carries the meaning; the fill only repeats it. */
export function HexBadge({ tone = "plain", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`hex-badge is-${tone}`}>
    <svg viewBox="0 0 20 18" width="14" height="13" aria-hidden="true"><polygon points="5,1 15,1 19,9 15,17 5,17 1,9" /></svg>{children}
  </span>;
}

export function Progress({ value, label, detail }: { value: number; label: string; detail?: ReactNode }) {
  return <div className="progress">
    <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
    <span className="progress-text">{detail ?? `${value}%`}</span>
  </div>;
}

/** One sentence and one next action. */
export function EmptyState({ children, href, action, quiet }: { children: ReactNode; href: string; action: string; quiet?: boolean }) {
  return <div className="empty">
    <HexCell className="empty-mark"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></HexCell>
    <p>{children}</p>
    <a className={quiet ? "button" : "button primary"} href={href}>{action}<Arrow /></a>
  </div>;
}

export function PageHeader({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return <div className="page-header">
    <h1>{title}</h1>
    {lead && <p className="lead">{lead}</p>}
    {children && <div className="page-actions">{children}</div>}
  </div>;
}

export function Card({ title, meta, className, children }: { title?: ReactNode; meta?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return <section className={`card ${className ?? ""}`} aria-labelledby={title ? id : undefined}>
    {title && <div className="card-bar"><h2 id={id}>{title}</h2>{meta && <span className="card-meta">{meta}</span>}</div>}
    <div className="card-body">{children}</div>
  </section>;
}

/** The result of a form action, from the existing ?message= names. */
export function MessageBanner({ children }: { children: ReactNode }) {
  return <div className="banner">
    <svg aria-hidden="true" viewBox="0 0 32 28" width="28" height="25"><polygon points="8,1 24,1 31,14 24,27 8,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M16 7v9m0 4v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    <p role="status">{children}</p>
  </div>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="back-link" href={href}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{children}</a>;
}
