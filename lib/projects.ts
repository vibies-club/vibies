import "server-only";
import { database, sessionHash } from "./access";
import { nickname } from "./access-core";
import {
  milestoneDetails,
  projectDetails,
  projectId,
  projectVersion,
  repositoryId,
  type ProjectDetails,
} from "./project-core";
import { verifyRepository } from "./project-github";

export type ProjectMilestone = {
  id: string;
  title: string;
  completed: boolean;
  blockedNote: string | null;
};

export type ProjectRoadmap = {
  milestones: ProjectMilestone[];
  completedCount: number;
  totalCount: number;
  percentage: number | null;
};

export type Project = ProjectDetails & { id: string; nickname: string; isOwner: boolean;
  publication?: string; connection?: string; moderation?: string; lastCheckedAt?: string | null; version?: string;
  roadmapAvailable: boolean; roadmap?: ProjectRoadmap; progressPercentage: number | null };

function readProgress(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) throw new Error("Project unavailable");
  return value;
}

function readRoadmap(value: any): ProjectRoadmap {
  if (!value || !Array.isArray(value.milestones) || !Number.isInteger(value.completedCount) ||
      !Number.isInteger(value.totalCount) || value.completedCount < 0 || value.totalCount < 0 ||
      value.completedCount > value.totalCount || value.totalCount !== value.milestones.length) {
    throw new Error("Project unavailable");
  }
  const milestones = value.milestones.map((milestone: any) => {
    if (!projectId(milestone?.id) || typeof milestone?.completed !== "boolean" ||
        !Object.hasOwn(milestone, "blockedNote")) {
      throw new Error("Project unavailable");
    }
    const details = milestoneDetails(milestone.title, milestone.blockedNote);
    if (!details || (milestone.completed && details.blockedNote !== null)) throw new Error("Project unavailable");
    return { id: milestone.id, ...details, completed: milestone.completed };
  });
  if (new Set(milestones.map((milestone: ProjectMilestone) => milestone.id)).size !== milestones.length ||
      milestones.filter((milestone: ProjectMilestone) => milestone.completed).length !== value.completedCount) {
    throw new Error("Project unavailable");
  }
  const percentage = readProgress(value.percentage);
  const expected = value.totalCount === 0 ? null : Math.round(value.completedCount * 100 / value.totalCount);
  if (percentage !== expected) throw new Error("Project unavailable");
  return { milestones, completedCount:value.completedCount, totalCount:value.totalCount, percentage };
}

function readProject(value: any): Project {
  const details = projectDetails(value?.title, value?.summary, value?.demoUrl ?? "");
  if (!details || !projectId(value?.id) || !nickname(value?.nickname) || typeof value?.isOwner !== "boolean") throw new Error("Project unavailable");
  if (value.roadmapAvailable !== undefined && typeof value.roadmapAvailable !== "boolean") throw new Error("Project unavailable");
  const roadmapAvailable = value.roadmapAvailable === true;
  const progressPercentage = readProgress(value.progressPercentage);
  const result: Project = {
    ...details,
    id:value.id,
    nickname:value.nickname,
    isOwner:value.isOwner,
    roadmapAvailable,
    progressPercentage,
  };
  if (roadmapAvailable) {
    if (value.roadmap === undefined) throw new Error("Project unavailable");
    result.roadmap = readRoadmap(value.roadmap);
    if (progressPercentage !== null && progressPercentage !== result.roadmap.percentage) throw new Error("Project unavailable");
  }
  if (value.version !== undefined) {
    if (!projectVersion(value.version)) throw new Error("Project unavailable");
    result.version = value.version;
  }
  if (value.publication !== undefined) {
    if (!["Draft", "Published", "Archived"].includes(value.publication) ||
        !["Connected", "Disconnected"].includes(value.connection) || !["Visible", "Hidden"].includes(value.moderation) ||
        !(value.lastCheckedAt === null || typeof value.lastCheckedAt === "string")) throw new Error("Project unavailable");
    Object.assign(result, { publication:value.publication, connection:value.connection, moderation:value.moderation, lastCheckedAt:value.lastCheckedAt });
  }
  return result;
}

export async function projects(): Promise<{kind:"ok"; mine:Project[]; community:Project[]} | {kind:"forbidden"|"error"}> {
  const hash = await sessionHash();
  if (!hash) return {kind:"forbidden"};
  try {
    const [row] = await database()`select vibies_private.projects(${hash}) as result`;
    if (row.result?.kind === "forbidden") return {kind:"forbidden"};
    if (row.result?.kind !== "ok" || !Array.isArray(row.result.mine) || !Array.isArray(row.result.community)) return {kind:"error"};
    return {kind:"ok", mine:row.result.mine.map(readProject), community:row.result.community.map(readProject)};
  } catch { return {kind:"error"}; }
}

export async function project(id: string): Promise<{kind:"ok"; project:Project} | {kind:"missing"|"forbidden"|"error"}> {
  const hash = await sessionHash();
  if (!hash) return {kind:"forbidden"};
  if (!projectId(id)) return {kind:"missing"};
  try {
    const [row] = await database()`select vibies_private.project(${hash}, ${id}::uuid) as result`;
    if (row.result?.kind === "forbidden" || row.result?.kind === "missing") return {kind:row.result.kind};
    return row.result?.kind === "ok" ? {kind:"ok", project:readProject(row.result.project)} : {kind:"error"};
  } catch { return {kind:"error"}; }
}

type Actor = {githubId:string; username:string};
export type ProjectContext = Actor & {repositoryId:string; version:string; publication:string; connection:string};
export async function projectActor(hash: string, id?: string): Promise<Actor | ProjectContext | null> {
  const [row] = id
    ? await database()`select vibies_private.project_operation_context(${hash}, ${id}::uuid) as result`
    : await database()`select vibies_private.project_actor(${hash}) as result`;
  const value = row.result;
  if (value?.kind === "forbidden") return null;
  if (value?.kind !== "ok" || !repositoryId(value.githubId) || typeof value.username !== "string" ||
      !/^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value.username)) throw new Error("Project unavailable");
  const actor = {githubId:value.githubId, username:value.username};
  if (!id) return actor;
  if (!repositoryId(value.repositoryId) || typeof value.version !== "string" || !/^[1-9]\d*$/.test(value.version) ||
      !["Draft", "Published", "Archived"].includes(value.publication) || !["Connected", "Disconnected"].includes(value.connection)) throw new Error("Project unavailable");
  return {...actor, repositoryId:value.repositoryId, version:value.version, publication:value.publication, connection:value.connection};
}

export function installationURL() {
  const slug = process.env.VIBIES_GITHUB_APP_SLUG;
  return slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `https://github.com/apps/${slug}/installations/new` : null;
}

export async function verifyProject(actor: Actor, id?: string) {
  const appId = process.env.VIBIES_GITHUB_APP_ID;
  const privateKey = process.env.VIBIES_GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return {kind:"unknown" as const};
  return verifyRepository({appId, privateKey}, actor, id);
}
