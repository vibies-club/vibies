export type DemoProject = { id: number; title: string; summary: string };
export type DemoState =
  | { kind: "ready"; project: DemoProject }
  | { kind: "empty" }
  | { kind: "error" };

export function demoState(data: unknown, error: unknown): DemoState {
  if (error) return { kind: "error" };
  if (data === null) return { kind: "empty" };
  if (
    typeof data !== "object" || !data ||
    !("id" in data) || data.id !== 1 ||
    !("title" in data) || typeof data.title !== "string" ||
    !("summary" in data) || typeof data.summary !== "string"
  ) return { kind: "error" };
  return { kind: "ready", project: { id: data.id, title: data.title, summary: data.summary } };
}

export function supabaseConfig(url: string | undefined, key: string | undefined) {
  const missing = [
    !url?.trim() && "NEXT_PUBLIC_SUPABASE_URL",
    !key?.trim() && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name): name is string => Boolean(name));
  if (missing.length) return { kind: "configuration" as const, missing };
  try {
    const address = new URL(url!);
    if (address.protocol !== "https:" || address.username || address.password ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key!)) {
      return { kind: "configuration" as const, missing: [] };
    }
  } catch {
    return { kind: "configuration" as const, missing: [] };
  }
  return { kind: "configured" as const, url: url!, key: key! };
}
