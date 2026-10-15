import type { PageData } from "./contracts";

const privatePaths = new Set(["/welcome", "/admin/members", "/projects", "/projects/connect"]);
const projectPath = /^\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicPaths = new Set(["/", "/demo", "/sign-in", "/access-denied"]);

export function privateReturnPath(value: string | null): string | null {
  return value && (privatePaths.has(value) || projectPath.test(value)) ? value : null;
}

export function isPagePath(path: string): boolean {
  return publicPaths.has(path) || privateReturnPath(path) !== null;
}

export function validatedRedirect(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || url.hash || (!isPagePath(url.pathname) && url.pathname !== "/auth/browser")) return null;
  for (const [key, entry] of url.searchParams) {
    if (!["message", "google", "status", "refresh", "returnTo"].includes(key) || entry.length > 200) return null;
    if (key === "returnTo" && !privateReturnPath(entry)) return null;
  }
  return `${url.pathname}${url.search}`;
}

export const unavailableData: PageData = {
  kind: "error", access: { kind: "error" }, googleEnabled: false, readOnly: false,
};

export async function loadPage(path: string, search: URLSearchParams, signal: AbortSignal): Promise<PageData> {
  const query = new URLSearchParams({ path });
  for (const key of ["message", "google", "status", "refresh", "returnTo"]) {
    const value = search.get(key);
    if (value !== null) query.set(key, value);
  }
  const response = await fetch(`/api/page?${query}`, {
    cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal,
  });
  // Authorization failures also carry the validated destination and must be parsed.
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Invalid page response");
  const page = data as PageData;
  if ((page.kind !== "ok" && page.kind !== "error") || !page.access ||
      !["signed_out", "denied", "member", "instructor", "error"].includes(page.access.kind) ||
      typeof page.googleEnabled !== "boolean" || typeof page.readOnly !== "boolean") throw new Error("Invalid page response");
  if (!response.ok && ![401, 403, 503].includes(response.status)) throw new Error("Page unavailable");
  if (page.redirect !== undefined && !validatedRedirect(page.redirect)) throw new Error("Invalid page redirect");
  if (!response.ok && !page.redirect) return unavailableData;
  return page;
}
