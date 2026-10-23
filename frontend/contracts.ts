import type { WikiEntry } from "../lib/wiki-filter";
import type { Access } from "../lib/access-core";
import type { MemberAccount } from "../lib/d1/access";
import type { DemoState } from "../lib/demo";
import type { Project } from "../lib/project-read";
import type { RepositoryChoice } from "../lib/project-github";
import type { CourseManifest, CourseSession, GateBoard, GateCheck } from "../lib/course";
import type { Board, Funding, IdeaPage, IdeaSummary, JobPage, Team } from "../lib/collab-read";

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
  course?: CourseManifest;   // /welcome, /course
  session?: CourseSession;   // /course/:n
  gates?: { mine: GateCheck[] }; // /welcome, /course, /course/:n
  gateBoard?: GateBoard;     // /admin/gates
  collab?: Board;            // /collaborate
  job?: ({ kind: "ok" } & JobPage) | { kind: "missing" }; // /collaborate/jobs/:id
  team?: Team;               // /projects/:id (Team & shares)
  ideas?: IdeaSummary[];     // /collaborate (Ideas tab)
  idea?: ({ kind: "ok" } & IdeaPage) | { kind: "missing" }; // /collaborate/ideas/:id
  funding?: Funding;         // /projects/:id (Funding)
};
