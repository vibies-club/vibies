import { sign } from "node:crypto";

export type GitHubAppConfig = { appId: string; privateKey: string };
export type GitHubIdentity = { githubId: string; username: string };
export type RepositoryChoice = { id: string; name: string };
export type RepositoryVerification =
  | { kind: "verified"; repositories?: RepositoryChoice[] }
  | { kind: "lost" | "unknown" };

type JsonObject = Record<string, unknown>;
type Installation = { id: string; accountId: string; eligible: boolean; configured: boolean };

const API = "https://api.github.com";
const PAGE_SIZE = 100;
const PAGE_LIMIT = 10;
const REQUEST_TIMEOUT = 5_000;
const VERIFY_TIMEOUT = 20_000;

const object = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const id = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? String(value) : null;

const metadataOnly = (value: unknown) => object(value) &&
  Object.keys(value).length === 1 && value.metadata === "read";

function readInstallation(value: unknown): Installation | null {
  if (!object(value) || !object(value.account)) return null;
  const installationId = id(value.id);
  const accountId = id(value.account.id);
  const suspended = value.suspended_at === null || typeof value.suspended_at === "string";
  if (!installationId || !accountId || typeof value.account.type !== "string" ||
      typeof value.target_type !== "string" ||
      !["all", "selected"].includes(String(value.repository_selection)) ||
      !suspended || !object(value.permissions) ||
      !Object.values(value.permissions).every(permission => typeof permission === "string")) return null;
  return {
    id: installationId,
    accountId,
    eligible: value.account.type === "User" && value.target_type === "User" &&
      value.repository_selection === "selected" && value.suspended_at === null,
    configured: metadataOnly(value.permissions),
  };
}

function appJWT(config: GitHubAppConfig) {
  if (!/^[1-9]\d{0,19}$/.test(config.appId) || !config.privateKey) throw new Error();
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: JsonObject) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iat: now - 60, exp: now + 540, iss: config.appId,
  })}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), config.privateKey).toString("base64url")}`;
}

function api(fetcher: typeof fetch, started: number, path: string, authorization: string,
  init: RequestInit = {}) {
  const remaining = VERIFY_TIMEOUT - (Date.now() - started);
  if (remaining <= 0) throw new Error();
  return fetcher(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${authorization}`,
      "X-GitHub-Api-Version": "2026-03-10",
      ...init.headers,
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT, remaining)),
  });
}

function hasNextPage(value: string | null) {
  if (value === null) return false;
  let next = false;
  for (const part of value.split(",")) {
    const match = part.trim().match(/^<([^>]+)>\s*;\s*rel="(next|last|first|prev)"$/);
    if (!match) return null;
    const url = new URL(match[1]);
    if (url.origin !== API || url.pathname !== "/app/installations" ||
        url.searchParams.get("per_page") !== String(PAGE_SIZE) ||
        !/^[1-9]\d*$/.test(url.searchParams.get("page") ?? "") ||
        [...url.searchParams.keys()].some(key => !["page", "per_page"].includes(key))) return null;
    if (match[2] === "next") next = true;
  }
  return next;
}

async function findInstallation(fetcher: typeof fetch, started: number, jwt: string,
  member: GitHubIdentity): Promise<Installation | "lost" | "unknown"> {
  const seen = new Set<string>();
  const direct = await api(fetcher, started,
    `/users/${encodeURIComponent(member.username)}/installation`, jwt);
  if (direct.status !== 404) {
    if (direct.status !== 200) return "unknown";
    const installation = readInstallation(await direct.json());
    if (Date.now() - started >= VERIFY_TIMEOUT) return "unknown";
    if (!installation) return "unknown";
    if (installation.accountId === member.githubId) return installation;
  }

  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const response = await api(fetcher, started,
      `/app/installations?per_page=${PAGE_SIZE}&page=${page}`, jwt);
    if (response.status !== 200) return "unknown";
    const value: unknown = await response.json();
    if (Date.now() - started >= VERIFY_TIMEOUT) return "unknown";
    if (!Array.isArray(value) || value.length > PAGE_SIZE) return "unknown";
    const installations = value.map(readInstallation);
    if (installations.some(item => !item)) return "unknown";
    for (const installation of installations) {
      if (!installation || seen.has(installation.id)) return "unknown";
      seen.add(installation.id);
    }
    const match = installations.find(item => item?.accountId === member.githubId);
    if (match) return match;
    const next = hasNextPage(response.headers.get("link"));
    if (next === null) return "unknown";
    if (!next) return "lost";
  }
  return "unknown";
}

async function installationToken(fetcher: typeof fetch, started: number, jwt: string,
  installationId: string) {
  const response = await api(fetcher, started,
    `/app/installations/${installationId}/access_tokens`, jwt, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { metadata: "read" } }),
    });
  if (response.status !== 201) return null;
  const value: unknown = await response.json();
  if (Date.now() - started >= VERIFY_TIMEOUT) return null;
  return object(value) && typeof value.token === "string" &&
    value.token.length > 0 && value.token.length <= 2_048 && metadataOnly(value.permissions)
    ? value.token : null;
}

function readRepository(value: unknown) {
  if (!object(value) || !object(value.owner)) return null;
  const repositoryId = id(value.id);
  const ownerId = id(value.owner.id);
  const name = value.name;
  if (!repositoryId || !ownerId || typeof name !== "string" || !name ||
      [...name].length > 100 || /[\p{Cc}\p{Cf}]/u.test(name) ||
      typeof value.private !== "boolean" || typeof value.owner.type !== "string") return null;
  return { id: repositoryId, name, ownerId, ownerType: value.owner.type, private: value.private };
}

async function repositories(fetcher: typeof fetch, started: number, token: string,
  member: GitHubIdentity, repositoryId?: string): Promise<RepositoryVerification> {
  const choices: RepositoryChoice[] = [];
  const seen = new Set<string>();
  let total: number | undefined;

  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const response = await api(fetcher, started,
      `/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`, token);
    if (response.status !== 200) return { kind: "unknown" };
    const value: unknown = await response.json();
    if (Date.now() - started >= VERIFY_TIMEOUT) return { kind: "unknown" };
    if (!object(value) || !Number.isSafeInteger(value.total_count) ||
        (value.total_count as number) < 0 || !Array.isArray(value.repositories) ||
        value.repositories.length > PAGE_SIZE ||
        (total !== undefined && total !== value.total_count)) return { kind: "unknown" };
    total = value.total_count as number;
    const pageRepositories = value.repositories.map(readRepository);
    if (pageRepositories.some(item => !item)) return { kind: "unknown" };
    if (seen.size + pageRepositories.length > total) return { kind: "unknown" };
    for (const repository of pageRepositories) {
      if (!repository || seen.has(repository.id)) return { kind: "unknown" };
      seen.add(repository.id);
      const eligible = repository.private && repository.ownerType === "User" &&
        repository.ownerId === member.githubId;
      if (repository.id === repositoryId) return eligible ? { kind: "verified" } : { kind: "lost" };
      if (!repositoryId && eligible) choices.push({ id: repository.id, name: repository.name });
    }
    if (seen.size > total) return { kind: "unknown" };
    if (seen.size === total) return repositoryId
      ? { kind: "lost" }
      : { kind: "verified", repositories: choices };
    if (pageRepositories.length === 0) return { kind: "unknown" };
  }
  return { kind: "unknown" };
}

export async function verifyRepository(config: GitHubAppConfig, member: GitHubIdentity,
  repositoryId?: string, fetcher: typeof fetch = fetch): Promise<RepositoryVerification> {
  if (!/^[1-9]\d{0,19}$/.test(member.githubId) ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(member.username) ||
      (repositoryId !== undefined && !/^[1-9]\d{0,19}$/.test(repositoryId))) {
    return { kind: "unknown" };
  }
  const started = Date.now();
  try {
    const jwt = appJWT(config);
    const installation = await findInstallation(fetcher, started, jwt, member);
    if (installation === "lost" || installation === "unknown") return { kind: installation };
    if (!installation.configured) return { kind: "unknown" };
    if (!installation.eligible) return { kind: "lost" };
    const token = await installationToken(fetcher, started, jwt, installation.id);
    return token ? await repositories(fetcher, started, token, member, repositoryId) : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}
