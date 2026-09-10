import { createHash, randomBytes } from "node:crypto";

export const token = () => randomBytes(32).toString("hex");
export const validToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const challenge = (value: string) => createHash("sha256").update(value).digest("base64url");

export function databaseSSL(hostname: string, ca?: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? false :
    { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

export function appOrigin(value: string | undefined) {
  if (!value) throw new Error("Sign-in unavailable");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Sign-in unavailable");
  }
  return url.origin;
}

export function sameOriginPost(request: Request, origin: string) {
  return request.method === "POST" && request.headers.get("origin") === origin &&
    request.headers.get("content-type")?.split(";")[0] === "application/x-www-form-urlencoded";
}

export function nickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/^ +| +$/g, "");
  const length = [...trimmed].length;
  return length >= 2 && length <= 30 && /^[\p{L}\p{Nl}\p{Nd} _-]+$/u.test(trimmed) ? trimmed : null;
}

export type Access = { kind: "signed_out" | "denied" | "member" | "instructor" | "error";
  nickname?: string; onboardingComplete?: boolean };
export function readAccess(value: unknown): Access {
  if (value && typeof value === "object" && "kind" in value) {
    if (value.kind === "signed_out" || value.kind === "denied") return { kind: value.kind };
    if ((value.kind === "member" || value.kind === "instructor") && "nickname" in value && nickname(value.nickname)) {
      if (value.kind === "instructor") return { kind: "instructor", nickname: value.nickname as string };
      if ("onboardingComplete" in value && typeof value.onboardingComplete === "boolean") {
        return { kind: "member", nickname: value.nickname as string, onboardingComplete: value.onboardingComplete };
      }
    }
  }
  return { kind: "error" };
}

export type GitHubConfig = { origin: string; clientId: string; clientSecret: string };

export function authorizationURL(config: GitHubConfig, state: string, verifier: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: `${config.origin}/auth/callback`,
    state, code_challenge: challenge(verifier), code_challenge_method: "S256", scope: "",
  }).toString();
  return url;
}

export function githubAccount(value: unknown) {
  if (!value || typeof value !== "object" || !("id" in value) ||
      !Number.isSafeInteger(value.id) || (value.id as number) <= 0 ||
      !("login" in value) || typeof value.login !== "string" ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value.login)) {
    throw new Error("Sign-in failed");
  }
  return { githubId: String(value.id), username: value.login };
}

export async function exchangeGitHub(config: GitHubConfig, code: string, verifier: string, fetcher = fetch) {
  const response = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      code, code_verifier: verifier, redirect_uri: `${config.origin}/auth/callback` }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Sign-in failed");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || "error" in result ||
      !("access_token" in result) || typeof result.access_token !== "string" ||
      !result.access_token || result.access_token.length > 2048 ||
      !("token_type" in result) || String(result.token_type).toLowerCase() !== "bearer" ||
      ("scope" in result && result.scope !== "")) throw new Error("Sign-in failed");
  const identity = await fetcher("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${result.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!identity.ok) throw new Error("Sign-in failed");
  // GitHub returns a profile. Only these two validated fields leave this function.
  return githubAccount(await identity.json());
}
