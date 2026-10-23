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
