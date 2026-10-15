import { nickname } from "./access-core";
import { milestoneDetails, projectDetails, projectId, projectVersion, type ProjectDetails } from "./project-core";
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

export function readProject(value: any): Project {
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

