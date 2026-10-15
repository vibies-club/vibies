import { domainOperation } from "./domain";
import "server-only";
import { sessionHash } from "./access";
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

export type { Project, ProjectMilestone, ProjectRoadmap } from "./project-read";
import { readProject, type Project } from "./project-read";

export async function projects(): Promise<{kind:"ok"; mine:Project[]; community:Project[]} | {kind:"forbidden"|"error"}> {
  const hash = await sessionHash();
  if (!hash) return {kind:"forbidden"};
  try {
    const row = { result: await domainOperation("projects", hash) };
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
    const row = { result: await domainOperation("project", hash, id) };
    if (row.result?.kind === "forbidden" || row.result?.kind === "missing") return {kind:row.result.kind};
    return row.result?.kind === "ok" ? {kind:"ok", project:readProject(row.result.project)} : {kind:"error"};
  } catch { return {kind:"error"}; }
}

type Actor = {githubId:string; username:string};
export type ProjectContext = Actor & {repositoryId:string; version:string; publication:string; connection:string};
export async function projectActor(hash: string, id?: string): Promise<Actor | ProjectContext | null> {
  const result = id
    ? await domainOperation("project_operation_context", hash, id)
    : await domainOperation("project_actor", hash);
  const value = result;
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
