export const PROJECT_BODY_LIMIT = 32_768;
export type ProjectDetails = { title: string; summary: string; demoUrl: string | null };

export function projectDetails(title: unknown, summary: unknown, demoUrl: unknown): ProjectDetails | null {
  if (typeof title !== "string" || typeof summary !== "string" || typeof demoUrl !== "string") return null;
  const summaryLines = summary.replace(/\r\n/g, "\n");
  if (/[\p{Cc}\p{Cf}]/u.test(title) || /[\p{Cc}\p{Cf}]/u.test(summaryLines.replace(/\n/g, ""))) return null;
  const details = { title: title.trim(), summary: summaryLines.trim(), demoUrl: demoUrl.trim() || null };
  if ([...details.title].length < 1 || [...details.title].length > 80 ||
      [...details.summary].length < 1 || [...details.summary].length > 500) return null;
  if (details.demoUrl) {
    if ([...details.demoUrl].length > 2048 || /[\s\p{Cc}\p{Cf}]/u.test(details.demoUrl) || !/^https:\/\//i.test(details.demoUrl)) return null;
    try {
      const url = new URL(details.demoUrl);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    } catch { return null; }
  }
  return details;
}

export const projectId = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const repositoryId = (value: unknown): value is string => typeof value === "string" &&
  /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));

export async function projectForm(request: Request): Promise<URLSearchParams | 400 | 413> {
  const reader = request.body?.getReader();
  if (!reader) return 400;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PROJECT_BODY_LIMIT) { await reader.cancel(); return 413; }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const form = new URLSearchParams(body);
    if ([...form.keys()].some(key => form.getAll(key).length !== 1)) return 400;
    return form;
  } catch { return 400; }
  finally { reader.releaseLock(); }
}
