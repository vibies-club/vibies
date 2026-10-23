import { readOnlyResponse } from "../lib/read-only";
import { go, safeError, type Services } from "./services";
import { milestoneDetails, projectDetails, projectForm, projectId, projectVersion, repositoryId } from "../lib/project-core";
import type { ProjectContext } from "../lib/project-read";
export async function projectAction(request: Request, services: Services) {
  const { allowedPost, domainOperation, accessState, sessionHash, projectActor, verifyProject, readOnly } = services;
  if (!allowedPost(request)) return safeError(403);
  if (readOnly) return readOnlyResponse();
  const hash = await sessionHash();
  if (!hash) return safeError(403);
  try {
    const form = await projectForm(request);
    if (typeof form === "number") return safeError(form);
    const action = form.get("action");
    if (!["connect", "publish", "check", "edit", "delete", "hide", "restore", "milestone_add", "milestone_edit",
      "milestone_complete", "milestone_move", "milestone_delete", "seed_course_roadmap"].includes(action ?? "")) return safeError(400);
    if (form.has("kind")) return safeError(400);
    if (action === "connect") {
      const actor = await projectActor(hash);
      if (!actor) return safeError(403);
      const id = form.get("repositoryId");
      const details = projectDetails(form.get("title"), form.get("summary"), form.get("demoUrl") ?? "");
      if (!repositoryId(id) || !details) return go("/projects/connect?message=invalid");
      const verified = await verifyProject(actor, id);
      if (verified.kind !== "verified") return go(`/projects/connect?message=${verified.kind}`);
      const row = { result: await domainOperation("connect_project", hash, id, details.title, details.summary, details.demoUrl) };
      const result = row.result;
      if (result.kind === "forbidden") return safeError(403);
      if (["created", "existing"].includes(result.kind) && projectId(result.id)) return go(`/projects/${result.id}?message=${result.kind}`);
      return go(`/projects/connect?message=${["full", "conflict", "invalid"].includes(result.kind) ? result.kind : "error"}`);
    }
    const id = form.get("id");
    if (!projectId(id)) return safeError(404);
    if (["milestone_add", "milestone_edit", "milestone_complete", "milestone_move", "milestone_delete", "seed_course_roadmap"].includes(action ?? "")) {
      const context = await projectActor(hash, id) as ProjectContext | null;
      if (!context) return safeError(403);
      const version = form.get("version");
      if (!projectVersion(version)) return safeError(400);
      const milestoneId = form.get("milestoneId");
      if (action !== "milestone_add" && action !== "seed_course_roadmap" && !projectId(milestoneId)) return safeError(404);
      let result;
      if (action === "seed_course_roadmap") {
        result = await domainOperation("seed_project_roadmap", hash, id, version);
      } else if (action === "milestone_add" || action === "milestone_edit") {
        const details = milestoneDetails(form.get("title"), form.get("blockedNote") ?? null);
        if (!details) return go(`/projects/${id}?message=invalid`);
        const value = action === "milestone_add"
          ? await domainOperation("add_project_milestone", hash, id, version, details.title, details.blockedNote)
          : await domainOperation("edit_project_milestone", hash, id, milestoneId, version, details.title, details.blockedNote);
        result = value;
      } else if (action === "milestone_complete") {
        const completed = form.get("completed");
        if (completed !== null && completed !== "yes" && completed !== "no") return safeError(400);
        const row = { result: await domainOperation("set_project_milestone_completion", hash, id, milestoneId, version, completed === "yes") };
        result = row.result;
      } else if (action === "milestone_move") {
        const direction = form.get("direction");
        if (direction !== "up" && direction !== "down") return safeError(400);
        const row = { result: await domainOperation("move_project_milestone", hash, id, milestoneId, version, direction) };
        result = row.result;
      } else {
        if (form.get("confirm") !== "yes") return safeError(400);
        const row = { result: await domainOperation("delete_project_milestone", hash, id, milestoneId, version) };
        result = row.result;
      }
      if (result.kind === "forbidden") return safeError(403);
      const message = result.kind === "added" ? "milestone_added"
        : result.kind === "edited" ? "milestone_edited"
        : result.kind === "completed" ? "milestone_completed"
        : result.kind === "reopened" ? "milestone_reopened"
        : result.kind === "moved" ? "milestone_moved"
        : result.kind === "unchanged" ? "milestone_unchanged"
        : result.kind === "deleted" ? "milestone_deleted"
        : result.kind === "seeded" ? "roadmap_seeded"
        : result.kind === "not_empty" ? "roadmap_not_empty"
        : result.kind === "full" ? "roadmap_full"
        : result.kind === "stale" ? "stale"
        : "invalid";
      return go(`/projects/${id}?message=${message}`);
    }
    if (action === "hide" || action === "restore") {
      const access = await accessState();
      if (access.kind === "error") return safeError();
      if (access.kind !== "instructor") return safeError(403);
      const version = form.get("version");
      if (!projectVersion(version)) return safeError(400);
      const row = { result: await domainOperation("moderate_project", hash, id, version, action === "hide") };
      if (row.result.kind === "forbidden") return safeError(403);
      if (row.result.kind === "restored") return go("/projects?message=restored");
      return go(`/projects/${id}?message=${["hidden", "stale"].includes(row.result.kind) ? row.result.kind : "error"}`);
    }
    if (action === "edit" || action === "delete") {
      if (action === "delete" && form.get("confirm") !== "yes") return safeError(400);
      const context = await projectActor(hash, id) as ProjectContext | null;
      if (!context) return safeError(403);
      let result;
      if (action === "edit") {
        const details = projectDetails(form.get("title"), form.get("summary"), form.get("demoUrl") ?? "");
        if (!details) return go(`/projects/${id}?message=invalid`);
        const row = { result: await domainOperation("edit_project", hash, id, context.version, details.title, details.summary, details.demoUrl) };
        result = row.result;
      } else {
        const row = { result: await domainOperation("delete_project", hash, id, context.version) };
        result = row.result;
      }
      if (result.kind === "forbidden") return safeError(403);
      if (result.kind === "deleted") return go("/projects?message=deleted");
      return go(`/projects/${id}?message=${["edited", "stale", "invalid"].includes(result.kind) ? result.kind : "error"}`);
    }
    // Two attempts let concurrent Publish return Already published after fresh checks.
    // A stale connection check stops, so a late provider result cannot replace a newer one.
    for (let attempt = 0; attempt < 2; attempt++) {
      const context = await projectActor(hash, id) as ProjectContext | null;
      if (!context) return safeError(403);
      if (action === "publish" && (context.connection !== "Connected" || context.publication === "Archived")) return go(`/projects/${id}?message=invalid`);
      const verified = await verifyProject(context, context.repositoryId);
      if (verified.kind === "unknown") return go(`/projects/${id}?message=unknown`);
      let result;
      if (action === "check" || verified.kind === "lost") {
        const row = { result: await domainOperation("record_project_connection", hash, id, context.version, verified.kind === "verified") };
        result = row.result;
      } else {
        // Fresh Verified is established only here on the server, never from form data.
        const row = { result: await domainOperation("publish_project", hash, id, context.version) };
        result = row.result;
      }
      if (result.kind === "forbidden") return safeError(403);
      if (result.kind === "stale" && action === "publish" && attempt === 0) continue;
      const message = result.kind === "already_published" ? "already" : result.kind === "disconnected" ? "lost" : result.kind;
      return go(`/projects/${id}?message=${["published", "already", "connected", "lost", "stale", "invalid"].includes(message) ? message : "error"}`);
    }
    return go(`/projects/${id}?message=stale`);
  } catch { return safeError(); }
}
