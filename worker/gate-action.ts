import { readOnlyResponse } from "../lib/read-only";
import { nickname } from "../lib/access-core";
import { gateNote, gateProof } from "../lib/course";
import { projectForm } from "../lib/project-core";
import { readCourse } from "./course";
import { go, safeError, type Env, type Services } from "./services";

/** Members tick their own gate items; the Instructor flags or clears them. */
export async function gateAction(request: Request, services: Services, env: Env) {
  const { allowedPost, domainOperation, accessState, sessionHash, readOnly } = services;
  if (!allowedPost(request)) return safeError(403);
  if (readOnly) return readOnlyResponse();
  const hash = await sessionHash();
  if (!hash) return safeError(403);
  try {
    const form = await projectForm(request);
    if (typeof form === "number") return safeError(form);
    const action = form.get("action") ?? "";
    const n = form.get("session") ?? "";
    const itemId = form.get("item");
    if (!["done", "undo", "flag", "clear"].includes(action) || !/^([1-9]|[12]\d|30)$/.test(n)) return safeError(400);
    const access = await accessState();
    if (access.kind === "error") return safeError();
    const memberAction = action === "done" || action === "undo";
    if (access.kind !== (memberAction ? "member" : "instructor")) return safeError(403);
    const course = await readCourse(env);
    if (!course?.sessions.find(session => session.n === Number(n))?.gate.some(item => item.id === itemId)) return safeError(400);
    const note = gateNote(form.get("note") ?? "");
    let result;
    if (memberAction) {
      const proof = gateProof(form.get("proofUrl") ?? "");
      if (action === "done" && (proof === false || note === false)) return safeError(400);
      result = await domainOperation("set_gate_check", hash, Number(n), itemId, action === "done", action === "done" ? proof : null, action === "done" ? note : null);
    } else {
      const member = nickname(form.get("member"));
      if (!member || (action === "flag" && !note)) return safeError(400);
      result = await domainOperation("flag_gate_check", hash, member, Number(n), itemId, action === "flag", action === "flag" ? note : null);
    }
    if (result.kind === "forbidden") return safeError(403);
    if (result.kind === "invalid") return safeError(400);
    if (memberAction) return go(`/course/${n}?message=${result.kind === "done" ? "done" : "undone"}`);
    const message = ["flagged", "cleared", "unchanged", "missing"].includes(result.kind) ? result.kind : "error";
    return go(`/admin/gates?message=${message}#cell-${encodeURIComponent(form.get("member") ?? "")}-${n}`);
  } catch { return safeError(); }
}
