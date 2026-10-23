/** A deployment-local cutover barrier. Never infer this flag from client input. */
export function isReadOnly() { return process.env.VIBIES_READ_ONLY === "1"; }
export class ReadOnlyError extends Error {
  constructor() { super("Vibies is temporarily read-only during maintenance."); }
}
export function assertWritable() { if (isReadOnly()) throw new ReadOnlyError(); }
export function readOnlyResponse() {
  return new Response("Vibies is temporarily read-only during maintenance. You can still browse. Please try this action again shortly.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "300" },
  });
}
// Unknown operations fail closed, including future mutations.
export const readOnlyOperations = ["access_state", "members", "project_actor", "project_operation_context", "projects", "project", "gates_mine", "gates_board"] as const;
export function assertOperationWritable(name: string) {
  if (!(readOnlyOperations as readonly string[]).includes(name)) assertWritable();
}
