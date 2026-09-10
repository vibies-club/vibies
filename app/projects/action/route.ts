import { database, sessionHash } from "../../../lib/access";
import { allowedPost, go, safeError } from "../../../lib/access-http";
import { projectDetails, projectForm, projectId, repositoryId } from "../../../lib/project-core";
import { projectActor, verifyProject, type ProjectContext } from "../../../lib/projects";

export async function POST(request: Request) {
  if (!allowedPost(request)) return safeError(403);
  const hash = await sessionHash();
  if (!hash) return safeError(403);
  try {
    const form = await projectForm(request);
    if (typeof form === "number") return safeError(form);
    const action = form.get("action");
    if (!["connect", "publish", "check", "edit", "delete"].includes(action ?? "")) return safeError(400);
    if (form.has("kind")) return safeError(400);
    if (action === "connect") {
      const actor = await projectActor(hash);
      if (!actor) return safeError(403);
      const id = form.get("repositoryId");
      const details = projectDetails(form.get("title"), form.get("summary"), form.get("demoUrl") ?? "");
      if (!repositoryId(id) || !details) return go("/projects/connect?message=invalid");
      const verified = await verifyProject(actor, id);
      if (verified.kind !== "verified") return go(`/projects/connect?message=${verified.kind}`);
      const [row] = await database()`select vibies_private.connect_project(${hash}, ${id}, ${details.title}, ${details.summary}, ${details.demoUrl}) as result`;
      const result = row.result;
      if (result.kind === "forbidden") return safeError(403);
      if (["created", "existing"].includes(result.kind) && projectId(result.id)) return go(`/projects/${result.id}?message=${result.kind}`);
      return go(`/projects/connect?message=${["full", "conflict", "invalid"].includes(result.kind) ? result.kind : "error"}`);
    }
    const id = form.get("id");
    if (!projectId(id)) return safeError(404);
    if (action === "edit" || action === "delete") {
      if (action === "delete" && form.get("confirm") !== "yes") return safeError(400);
      const context = await projectActor(hash, id) as ProjectContext | null;
      if (!context) return safeError(403);
      let result;
      if (action === "edit") {
        const details = projectDetails(form.get("title"), form.get("summary"), form.get("demoUrl") ?? "");
        if (!details) return go(`/projects/${id}?message=invalid`);
        const [row] = await database()`select vibies_private.edit_project(${hash}, ${id}::uuid, ${context.version}::bigint, ${details.title}, ${details.summary}, ${details.demoUrl}) as result`;
        result = row.result;
      } else {
        const [row] = await database()`select vibies_private.delete_project(${hash}, ${id}::uuid, ${context.version}::bigint) as result`;
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
        const [row] = await database()`select vibies_private.record_project_connection(${hash}, ${id}::uuid, ${context.version}::bigint, ${verified.kind === "verified"}) as result`;
        result = row.result;
      } else {
        // Fresh Verified is established only here on the server, never from form data.
        const [row] = await database()`select vibies_private.publish_project(${hash}, ${id}::uuid, ${context.version}::bigint) as result`;
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
