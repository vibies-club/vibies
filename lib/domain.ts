import "server-only";
import { assertOperationWritable, isReadOnly } from "./read-only";
import { postgresDatabase } from "./postgres";
import type { AccessDatabase } from "./d1/access";

type Arguments = {
  access_state: [hash: string | null];
  members: [hash: string | null];
  change_member: [hash: string | null, githubId: string, action: string, nickname: string | null];
  begin_sign_in: [browserHash: string, stateHash: string];
  consume_sign_in: [browserHash: string, stateHash: string];
  finish_sign_in: [githubId: string, username: string, sessionHash: string, previousHash: string | null];
  end_session: [hash: string | null];
  project_actor: [hash: string];
  project_operation_context: [hash: string, id: string];
  projects: [hash: string];
  project: [hash: string, id: string];
  connect_project: [hash: string, repositoryId: string, title: string, summary: string, demoUrl: string | null];
  add_project_milestone: [hash: string, id: string, version: string, title: string, blockedNote: string | null];
  edit_project_milestone: [hash: string, id: string, milestoneId: string | null, version: string, title: string, blockedNote: string | null];
  set_project_milestone_completion: [hash: string, id: string, milestoneId: string | null, version: string, completed: boolean];
  move_project_milestone: [hash: string, id: string, milestoneId: string | null, version: string, direction: string];
  delete_project_milestone: [hash: string, id: string, milestoneId: string | null, version: string];
  moderate_project: [hash: string, id: string, version: string, hidden: boolean];
  edit_project: [hash: string, id: string, version: string, title: string, summary: string, demoUrl: string | null];
  delete_project: [hash: string, id: string, version: string];
  record_project_connection: [hash: string, id: string, version: string, verified: boolean];
  publish_project: [hash: string, id: string, version: string];
};

export function usesD1() { return process.env.VIBIES_DATABASE_BACKEND === "d1"; }

/** Fail closed even when a new build accidentally uses a fresh or wrong database. */
export async function cloudflareDatabase(): Promise<AccessDatabase> {
  const { env } = await import("cloudflare:workers");
  const binding = (env as unknown as { DB?: AccessDatabase }).DB;
  const environment = process.env.VIBIES_ENVIRONMENT;
  if (!binding || !environment) throw new Error("Access unavailable");
  const activation = await binding.prepare("SELECT state, environment_id FROM deployment_activation WHERE singleton = 1")
    .first<{ state: string; environment_id: string }>();
  if (activation?.state !== "active" || activation.environment_id !== environment) throw new Error("Access unavailable");
  return binding;
}

// Results remain untrusted JSON and are checked by the existing access/project readers.
// Only this closed list of named operations can cross the database boundary.
export async function domainOperation<K extends keyof Arguments>(name: K, ...args: Arguments[K]): Promise<any> {
  assertOperationWritable(name);
  if (usesD1()) {
    const db = await cloudflareDatabase();
    const accessOperation = name === "access_state" || name === "members" || name === "change_member" ||
      name === "begin_sign_in" || name === "consume_sign_in" || name === "finish_sign_in" || name === "end_session";
    const operations = accessOperation ? await import("./d1/access") : await import("./d1/projects");
    const operation = (operations as Record<string, unknown>)[name] as (db: AccessDatabase, ...values: unknown[]) => Promise<unknown>;
    if (typeof operation !== "function") throw new Error("Access unavailable");
    return operation(db, ...args);
  }
  if (isReadOnly() && name === "access_state") {
    const [row] = await postgresDatabase().unsafe("select vibies_private.access_state_read_only($1) as result", args);
    return row?.result;
  }
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  const [row] = await postgresDatabase().unsafe(`select vibies_private.${name}(${placeholders}) as result`, args);
  return row?.result;
}
