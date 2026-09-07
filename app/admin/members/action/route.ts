import { database, sessionHash } from "../../../../lib/access";
import { nickname } from "../../../../lib/access-core";
import { allowedPost, go, safeError } from "../../../../lib/access-http";

export async function POST(request: Request) {
  if (!allowedPost(request)) return safeError(403);
  const hash = await sessionHash();
  if (!hash) return safeError(403);
  try {
    // Reject oversized forms before reading their body into memory.
    const raw = await request.body?.getReader();
    if (!raw) return safeError(400);
    let body = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await raw.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (body.length > 2048) { await raw.cancel(); return safeError(413); }
    }
    body += decoder.decode();
    const form = new URLSearchParams(body);
    const githubId = form.get("githubId");
    const action = form.get("action");
    if (!githubId || !/^[1-9]\d{0,19}$/.test(githubId) ||
        !action || !["approve", "reapprove", "revoke", "dismiss"].includes(action) ||
        (action === "revoke" && form.get("confirm") !== "yes")) return go("/admin/members?message=invalid");
    const name = action === "approve" ? nickname(form.get("nickname")) : null;
    if (action === "approve" && !name) return go("/admin/members?message=nickname");
    const [row] = await database()`select vibies_private.change_member(${hash}, ${githubId}, ${action}, ${name}) as result`;
    if (row.result.kind === "forbidden") return safeError(403);
    const message = ["ok", "full", "nickname", "duplicate", "missing", "invalid"].includes(row.result.kind) ? row.result.kind : "error";
    return go(`/admin/members?message=${message}`);
  } catch { return go("/admin/members?message=error"); }
}
