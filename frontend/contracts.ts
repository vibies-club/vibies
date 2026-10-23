import type { WikiEntry } from "../lib/wiki-filter";
import type { Access } from "../lib/access-core";
import type { MemberAccount } from "../lib/d1/access";
import type { DemoState } from "../lib/demo";
import type { Project } from "../lib/projects";
import type { RepositoryChoice } from "../lib/project-github";

/** Only validated presentation data crosses the Worker/browser boundary. */
export type PageData = {
  kind: "ok" | "error";
  access: Access;
  googleEnabled: boolean;
  readOnly: boolean;
  redirect?: string;
  staging?: { sha: string };
  linking?: { linked: boolean; canLink: boolean };
  demo?: DemoState;
  members?: { activeCount: number; accounts: MemberAccount[] };
  projects?: { mine: Project[]; community: Project[] };
  project?: { kind: "ok"; project: Project } | { kind: "missing" };
  wiki?: WikiEntry[];
  connect?: { install: string | null; repositories: RepositoryChoice[]; status?: string };
};
