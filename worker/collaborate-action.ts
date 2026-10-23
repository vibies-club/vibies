import { readOnlyResponse } from "../lib/read-only";
import { projectForm, projectId, projectVersion } from "../lib/project-core";
import { agreementLines, FORBIDDEN_FIELDS, httpsUrl, ideaFields, isoDate, jobTerms, optionalText, text, wholeNumber } from "../lib/collab-core";
import { go, safeError, type Services } from "./services";

const confirmed = new Set(["job_cancel", "job_abandon", "job_release", "job_reject", "team_leave", "team_remove"]);
const jobActions = new Set(["job_post", "job_edit", "job_cancel", "job_claim", "job_abandon", "job_release", "job_deliver", "job_accept",
  "job_changes", "job_reject", "job_paid", "job_receipt", "job_not_received", "job_dispute", "job_hide", "job_restore", "job_resolve"]);
const teamActions = new Set(["team_invite", "team_accept", "team_decline", "team_leave", "team_remove", "agreement_propose", "agreement_accept", "agreement_decline"]);
const ideaActions = new Set(["idea_post", "idea_edit", "idea_link", "idea_interest", "idea_uninterest", "comment_post"]);
const fundingActions = new Set(["funding_set", "pledge_post", "pledge_withdraw", "pledge_received"]);

/** POST /collaborate/action. Forms carry intent only; every outcome, tier and state is decided in SQL. */
export async function collaborateAction(request: Request, services: Services) {
  const { allowedPost, domainOperation, sessionHash, readOnly } = services;
  if (!allowedPost(request)) return safeError(403);
  if (readOnly) return readOnlyResponse();
  const hash = await sessionHash();
  if (!hash) return safeError(403);
  try {
    const form = await projectForm(request);
    if (typeof form === "number") return safeError(form);
    if (FORBIDDEN_FIELDS.some(field => form.has(field))) return safeError(400);
    const action = form.get("action") ?? "";
    if (![jobActions, teamActions, ideaActions, fundingActions].some(set => set.has(action))) return safeError(400);
    if (confirmed.has(action) && form.get("confirm") !== "yes") return safeError(400);
    const run = (name: string, ...args: unknown[]) => domainOperation(name, hash, ...args) as Promise<{ kind: string; id?: string }>;

    if (action === "job_post") {
      const terms = jobTerms(form);
      if (!terms) return go("/collaborate?message=invalid#post");
      const result = await run("job_post", terms);
      if (result.kind === "forbidden") return safeError(403);
      return result.kind === "posted" && projectId(result.id) ? go(`/collaborate/jobs/${result.id}?message=posted`) : go(`/collaborate?message=${result.kind}#post`);
    }

    if (jobActions.has(action)) {
      const id = form.get("id"), version = form.get("version");
      if (!projectId(id)) return safeError(404);
      if (!projectVersion(version)) return safeError(400);
      const back = (message: string) => go(`/collaborate/jobs/${id.toLowerCase()}?message=${message}`);
      let result: { kind: string };
      switch (action) {
        case "job_edit": { const terms = jobTerms(form); if (!terms) return back("invalid"); result = await run("job_edit", id, version, terms); break; }
        case "job_deliver": {
          const url = httpsUrl(form.get("url")), note = text(form.get("note"), 1, 1000, true);
          if (!url || !note) return back("invalid_delivery");
          result = await run("job_deliver", id, version, url, note); break;
        }
        case "job_changes": {
          const failed = Array.from({ length: 10 }, (_, n) => n + 1).filter(n => form.get(`failed${n}`) === "yes");
          const note = optionalText(form.get("note"), 1000, true);
          if (!failed.length || note === undefined) return back("invalid_changes");
          result = await run("job_changes", id, version, failed, note); break;
        }
        case "job_reject": { const note = text(form.get("note"), 1, 1000, true); if (!note) return back("invalid"); result = await run("job_reject", id, version, note); break; }
        case "job_paid": {
          const amount = wholeNumber(form.get("amount"), 0, 1_000_000), on = isoDate(form.get("paidOn")), note = optionalText(form.get("note"), 500, true);
          if (amount === null || !on || note === undefined) return back("invalid");
          result = await run("job_paid", id, version, amount, on, note); break;
        }
        case "job_not_received": case "job_dispute": {
          const reason = text(form.get("reason"), 1, 1000, true);
          if (!reason) return back("invalid");
          result = await run(action, id, version, reason); break;
        }
        case "job_resolve": {
          const outcome = form.get("outcome"), reason = text(form.get("reason"), 1, 1000, true), rawTier = form.get("payout");
          const settles = outcome === "accepted" || outcome === "paid";
          const payout = settles ? wholeNumber(rawTier, 0, 100) : null;
          if (!reason || !["accepted", "paid", "open", "cancelled"].includes(outcome ?? "") || (settles && ![0, 50, 100].includes(payout as number))) return back("invalid");
          result = await run("job_resolve", id, version, outcome, payout, reason); break;
        }
        case "job_hide": case "job_restore": result = await run("job_moderate", id, version, action === "job_hide"); break;
        default: result = await run(action, id, version);
      }
      if (result.kind === "forbidden") return safeError(403);
      if (result.kind === "missing") return safeError(404);
      // Accept cannot settle a share the poster no longer covers; the copy points the poster to a dispute.
      return back(action === "job_accept" && ["insufficient_share", "project_missing"].includes(result.kind) ? `accept_${result.kind}` : result.kind);
    }

    if (action === "idea_post") {
      const fields = ideaFields(form);
      if (!fields) return go("/collaborate?message=idea_invalid#idea-new");
      const result = await run("idea_post", fields);
      if (result.kind === "forbidden") return safeError(403);
      return result.kind === "posted" && projectId(result.id) ? go(`/collaborate/ideas/${result.id}?message=idea_posted`) : go(`/collaborate?message=idea_${result.kind}#idea-new`);
    }

    if (ideaActions.has(action)) {
      const id = form.get("id");
      if (!projectId(id)) return safeError(404);
      const back = (kind: string) => go(`/collaborate/ideas/${id.toLowerCase()}?message=idea_${kind}`);
      let result: { kind: string };
      switch (action) {
        case "idea_edit": { const fields = ideaFields(form); if (!fields) return back("invalid"); result = await run("idea_edit", id, form.get("version"), fields); break; }
        case "idea_link": result = await run("idea_link", id, form.get("version"), form.get("projectId") ?? ""); break;
        case "idea_interest": result = await run("idea_interest", id, form.get("role"), form.get("note")); break;
        case "comment_post": result = await run("comment_post", id, form.get("body")); break;
        default: result = await run("idea_uninterest", id);
      }
      if (result.kind === "forbidden") return safeError(403);
      if (result.kind === "missing") return safeError(404);
      return back(result.kind);
    }

    const project = form.get("projectId"), from = form.get("from"), idea = form.get("ideaId");
    if (!projectId(project)) return safeError(404);

    if (fundingActions.has(action)) {
      const back = (kind: string) => go(`/projects/${project.toLowerCase()}?message=funding_${kind}#funding`);
      let result: { kind: string };
      if (action === "funding_set") result = await run("funding_set", project, form.get("version"), form.get("seeking") === "yes", form.get("goal"));
      else if (action === "pledge_post") result = await run("pledge_post", project, form.get("amount"), form.get("note"));
      else {
        const pledge = form.get("pledgeId");
        if (!projectId(pledge)) return safeError(404);
        result = await run("pledge_close", pledge, action === "pledge_received" ? "received" : "withdrawn");
      }
      if (result.kind === "forbidden") return safeError(403);
      if (result.kind === "missing") return safeError(404);
      return back(result.kind);
    }

    const fromIdea = from === "idea" && action === "team_invite" && projectId(idea);
    if (from !== "teams" && from !== "project" && !fromIdea) return safeError(400);
    const prefix = action.startsWith("agreement_") ? "agreement_" : "team_";
    const back = (kind: string) => go(fromIdea ? `/collaborate/ideas/${idea!.toLowerCase()}?message=${prefix}${kind}`
      : from === "teams" ? `/collaborate?message=${prefix}${kind}#teams` : `/projects/${project.toLowerCase()}?message=${prefix}${kind}#team`);
    let result: { kind: string };
    switch (action) {
      case "team_invite": {
        const role = text(form.get("role"), 1, 40);
        if (!role) return back("invalid");
        result = await run("team_invite", project, form.get("member"), role); break;
      }
      case "team_accept": case "team_decline": result = await run("team_respond", project, action === "team_accept"); break;
      case "team_leave": result = await run("team_leave", project); break;
      case "team_remove": result = await run("team_remove", project, form.get("member")); break;
      case "agreement_propose": {
        const lines = agreementLines(form), basis = form.get("basis");
        if (!lines || !basis) return back("invalid");
        result = await run("agreement_propose", project, basis, lines); break;
      }
      default: {
        const agreement = form.get("agreementId"), version = form.get("version");
        if (!projectId(agreement) || !projectVersion(version)) return safeError(400);
        result = await run("agreement_respond", project, agreement, version, action === "agreement_accept");
      }
    }
    if (result.kind === "forbidden") return safeError(403);
    if (result.kind === "missing") return safeError(404);
    return back(result.kind);
  } catch { return safeError(); }
}
