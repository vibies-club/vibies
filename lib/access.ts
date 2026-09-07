import "server-only";
import postgres from "postgres";
import { cookies } from "next/headers";
import { appOrigin, digest, readAccess, validToken, type Access } from "./access-core";

let sql: ReturnType<typeof postgres> | undefined;
export function database() {
  if (sql) return sql;
  const address = process.env.VIBIES_DATABASE_URL;
  if (!address) throw new Error("Access unavailable");
  const url = new URL(address);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Access unavailable");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  sql = postgres(address, { max: 3, prepare: false, ssl: local ? false : "verify-full",
    connect_timeout: 10, idle_timeout: 20, connection: { statement_timeout: 10000 }, onnotice: () => {} });
  return sql;
}

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
    const [row] = await database()`select vibies_private.access_state(${hash}) as result`;
    return readAccess(row?.result);
  } catch { return { kind: "error" }; }
}

export type Account = { githubId: string; username: string; nickname: string | null; status: "unapproved" | "approved" | "revoked" };
export async function members(): Promise<{kind: "ok"; activeCount: number; accounts: Account[]} | {kind: "forbidden" | "error"}> {
  const hash = await sessionHash();
  if (!hash) return { kind: "forbidden" };
  try {
    const [row] = await database()`select vibies_private.members(${hash}) as result`;
    const result = row?.result;
    if (result?.kind === "forbidden") return { kind: "forbidden" };
    if (result?.kind !== "ok" || !Number.isInteger(result.activeCount) ||
        result.activeCount < 0 || result.activeCount > 7 || !Array.isArray(result.accounts) ||
        !result.accounts.every((account: Account) => account && typeof account.githubId === "string" &&
          /^[1-9]\d{0,19}$/.test(account.githubId) && typeof account.username === "string" &&
          (account.nickname === null || typeof account.nickname === "string") &&
          ["unapproved", "approved", "revoked"].includes(account.status))) return { kind: "error" };
    return { kind: "ok", activeCount: result.activeCount, accounts: result.accounts.map((account: Account) => ({
      githubId: account.githubId, username: account.username, nickname: account.nickname, status: account.status,
    })) };
  } catch { return { kind: "error" }; }
}
