import type { PageData } from "../contracts";
import { Retry } from "../access-shell";
import { AppShell } from "../app-shell";
import { HexBadge, HexCell, MessageBanner, PageHeader } from "../ui";

type PageProps = { data: PageData; search: URLSearchParams };

const groups = [
  { status: "unapproved", title: "Waiting for approval", tone: "muted" },
  { status: "approved", title: "Active Members", tone: "strong" },
  { status: "revoked", title: "Revoked Members", tone: "plain" },
] as const;

export function MembersPage({ data, search }: PageProps) {
  const state = data.members;
  if (data.kind !== "ok" || data.access.kind !== "instructor" || !state) {
    return <AppShell data={data}><Retry href="/admin/members" /></AppShell>;
  }
  const message = search.get("message") ?? undefined;
  const messages: Record<string, string> = { ok: "Access updated.", full: "All eight Member places are filled.",
    nickname: "Use 2-30 letters, numbers, spaces, hyphens, or underscores. Outer spaces are removed.",
    duplicate: "That nickname is already reserved. Choose another nickname agreed with the Member.",
    missing: "That entry changed. Check the current list before trying again.",
    invalid: "The change was not applied. Check the form and try again.", error: "We could not save the change. Please try again." };
  return <AppShell data={data}>
    <PageHeader title="Members" lead={<><span className="mono">{state.activeCount} of 8</span> Member places filled.</>} />
    {message && Object.hasOwn(messages, message) && <MessageBanner>{messages[message]}</MessageBanner>}
    <p className="privacy privacy-note"><HexCell className="privacy-cell"><img src="/home/icon-access.png" alt="" width={32} height={32} /></HexCell>
      <span>Agree on a nickname with the Member before approval. Check it for real names and contact details. Automatic checks cannot detect every real name.</span></p>
    {groups.map(({ status, title, tone }) => {
      const accounts = state.accounts.filter(account => account.status === status);
      return <section key={status} className="list-section" aria-labelledby={`group-${status}`}>
        <div className="section-head"><h2 id={`group-${status}`}>{title}</h2><span className="mono">{accounts.length}</span></div>
        {accounts.length === 0 && <p className="quiet">No accounts in this group.</p>}
        <ul className="member-list">{accounts.map(account => <li key={account.githubId} className="member-card">
          <div className="product-head"><h3>{account.nickname ?? "No nickname yet"}</h3><HexBadge tone={tone}>{status === "unapproved" ? "Waiting" : status === "approved" ? "Active" : "Revoked"}</HexBadge></div>
          <dl className="facts"><dt>GitHub</dt><dd><strong>{account.username}</strong></dd><dt>Stable account ID</dt><dd><code>{account.githubId}</code></dd></dl>
          {status === "unapproved" && <form action="/admin/members/action" method="post" className="stack-form">
            <input type="hidden" name="githubId" value={account.githubId} /><input type="hidden" name="action" value="approve" />
            <label htmlFor={`nickname-${account.githubId}`}>Member-agreed nickname</label>
            <input id={`nickname-${account.githubId}`} name="nickname" required minLength={2} maxLength={60} aria-describedby="nickname-help" autoComplete="off" />
            <button type="submit" className="primary">Approve Member</button></form>}
          {status === "revoked" && <form action="/admin/members/action" method="post"><input type="hidden" name="githubId" value={account.githubId} />
            <button name="action" value="reapprove">Reapprove with the same nickname</button></form>}
          {status === "approved" && <details className="disclosure"><summary>Revoke access</summary><p className="hint">Access ends on the next protected request. Existing content and onboarding completion remain.</p>
            <form action="/admin/members/action" method="post"><input type="hidden" name="githubId" value={account.githubId} /><input type="hidden" name="action" value="revoke" />
              <label className="confirmation check"><input type="checkbox" name="confirm" value="yes" required /> I confirm that this Member's access will end.</label>
              <div className="form-actions"><button type="submit">Confirm revocation</button><a className="text-link" href="/admin/members">Cancel</a></div></form></details>}
          {status === "unapproved" && <form action="/admin/members/action" method="post"><input type="hidden" name="githubId" value={account.githubId} />
            <button className="secondary link-button" name="action" value="dismiss">Dismiss entry</button></form>}
        </li>)}</ul>
      </section>;
    })}
    <p id="nickname-help" className="hint">Nicknames use 2-30 letters, numbers, spaces, hyphens, or underscores. Nicknames stay reserved after revocation.</p>
  </AppShell>;
}
