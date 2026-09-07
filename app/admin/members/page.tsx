import { redirect } from "next/navigation";
import { members } from "../../../lib/access";
import { AccessShell, Retry } from "../../access-shell";

export const dynamic = "force-dynamic";
export default async function MembersPage({ searchParams }: {searchParams: Promise<{message?: string}>}) {
  const state = await members();
  if (state.kind === "forbidden") redirect("/welcome");
  if (state.kind === "error") return <AccessShell><Retry href="/admin/members" /></AccessShell>;
  if (state.kind !== "ok") return null;
  const { message } = await searchParams;
  const messages: Record<string, string> = { ok: "Access updated.", full: "All seven Member places are filled.",
    nickname: "Use 2-30 letters, numbers, spaces, hyphens, or underscores. Outer spaces are removed.",
    duplicate: "That nickname is already reserved. Choose another nickname agreed with the Member.",
    missing: "That entry changed. Check the current list before trying again.",
    invalid: "The change was not applied. Check the form and try again.", error: "We could not save the change. Please try again." };
  return <AccessShell><section className="members"><p className="eyebrow">INSTRUCTOR</p><h1>Member access</h1>
    <p className="intro">{state.activeCount} of 7 Member places filled.</p><a href="/welcome">Back to welcome</a>
    {message && messages[message] && <p role="status">{messages[message]}</p>}
    <p className="privacy">Agree on a nickname with the Member before approval. Check it for real names and contact details. Automatic checks cannot detect every real name.</p>
    {(["unapproved", "approved", "revoked"] as const).map(status => <div key={status}>
      <h2>{status === "approved" ? "Active Members" : status === "revoked" ? "Revoked Members" : "Unapproved accounts"}</h2>
      {state.accounts.filter(account => account.status === status).length === 0 && <p>No accounts in this group.</p>}
      {state.accounts.filter(account => account.status === status).map(account => <article key={account.githubId}>
        <h3>{account.nickname ?? "No nickname yet"}</h3>
        <p>GitHub: <strong>{account.username}</strong><br />Stable account ID: <code>{account.githubId}</code></p>
        {status === "unapproved" && <form action="/admin/members/action" method="post">
          <input type="hidden" name="githubId" value={account.githubId} /><input type="hidden" name="action" value="approve" />
          <label htmlFor={`nickname-${account.githubId}`}>Member-agreed nickname</label>
          <input id={`nickname-${account.githubId}`} name="nickname" required minLength={2} maxLength={60} aria-describedby="nickname-help" autoComplete="off" />
          <button type="submit">Approve Member</button></form>}
        {status === "revoked" && <form action="/admin/members/action" method="post"><input type="hidden" name="githubId" value={account.githubId} />
          <button name="action" value="reapprove">Reapprove with the same nickname</button></form>}
        {status === "approved" && <details><summary>Revoke access</summary><p>Access ends on the next protected request. Existing content and onboarding completion remain.</p>
          <form action="/admin/members/action" method="post"><input type="hidden" name="githubId" value={account.githubId} /><input type="hidden" name="action" value="revoke" />
            <label className="confirmation"><input type="checkbox" name="confirm" value="yes" required /> I confirm that this Member's access will end.</label>
            <button type="submit">Confirm revocation</button> <a href="/admin/members">Cancel</a></form></details>}
        {status === "unapproved" && <form action="/admin/members/action" method="post"><input type="hidden" name="githubId" value={account.githubId} />
          <button className="secondary" name="action" value="dismiss">Dismiss entry</button></form>}
      </article>)}
    </div>)}<p id="nickname-help" className="hint">Nicknames use 2-30 letters, numbers, spaces, hyphens, or underscores. Nicknames stay reserved after revocation.</p>
  </section></AccessShell>;
}
