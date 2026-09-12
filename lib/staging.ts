export function stagingIdentity(env: Record<string, string | undefined> = process.env) {
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const projectId = env.VERCEL_PROJECT_ID;
  if (env.VIBIES_STAGING !== "true" || env.VERCEL_ENV !== "production" ||
      env.VERCEL_GIT_COMMIT_REF !== "staging" || !sha || !/^[a-f0-9]{40}$/.test(sha) ||
      !projectId || !/^prj_[A-Za-z0-9_-]{1,123}$/.test(projectId)) return null;
  return { sha, projectId, ref: "staging" };
}
