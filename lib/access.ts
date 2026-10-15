import "server-only";
import { cookies } from "next/headers";
import { domainOperation } from "./domain";
import { appOrigin, digest, readAccess, validToken, type Access } from "./access-core";

export { postgresDatabase as database } from "./postgres";

export const origin = () => appOrigin(process.env.VIBIES_APP_ORIGIN);
export function githubConfig() {
  const clientId = process.env.VIBIES_GITHUB_CLIENT_ID;
  const clientSecret = process.env.VIBIES_GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Sign-in unavailable");
  return { origin: origin(), clientId, clientSecret };
}

export function cookieName(name: "session" | "browser" | "oauth") {
  return `${process.env.NODE_ENV === "production" ? "__Host-" : ""}vibies-${name}`;
}
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/" });

export async function sessionHash() {
  const value = (await cookies()).get(cookieName("session"))?.value;
  return validToken(value) ? digest(value) : null;
}

export async function accessState(): Promise<Access> {
  const hash = await sessionHash();
  if (!hash) return { kind: "signed_out" };
  try {
    return readAccess(await domainOperation("access_state", hash));
  } catch { return { kind: "error" }; }
}

export type Account = { githubId: string; username: string; nickname: string | null; status: "unapproved" | "approved" | "revoked" };
export async function members(): Promise<{kind: "ok"; activeCount: number; accounts: Account[]} | {kind: "forbidden" | "error"}> {
  const hash = await sessionHash();
  if (!hash) return { kind: "forbidden" };
  try {
    const result = await domainOperation("members", hash);
    if (result?.kind === "forbidden") return { kind: "forbidden" };
    if (result?.kind !== "ok" || !Number.isInteger(result.activeCount) ||
        result.activeCount < 0 || result.activeCount > 8 || !Array.isArray(result.accounts) ||
        !result.accounts.every((account: Account) => account && typeof account.githubId === "string" &&
          /^[1-9]\d{0,19}$/.test(account.githubId) && typeof account.username === "string" &&
          (account.nickname === null || typeof account.nickname === "string") &&
          ["unapproved", "approved", "revoked"].includes(account.status))) return { kind: "error" };
    return { kind: "ok", activeCount: result.activeCount, accounts: result.accounts.map((account: Account) => ({
      githubId: account.githubId, username: account.username, nickname: account.nickname, status: account.status,
    })) };
  } catch { return { kind: "error" }; }
}
