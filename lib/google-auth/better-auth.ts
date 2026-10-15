import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { appOrigin } from "../access-core.ts";
import type { AccessDatabase } from "../d1/access.ts";
import { googleLinkGrant } from "./store.ts";

export const GOOGLE_AUTH_VERSION = "1.7.9";
export const GOOGLE_AUTH_PATH = "/auth/google/provider";
export type GoogleAuthConfig = {
  database: NonNullable<BetterAuthOptions["database"]>;
  store: AccessDatabase;
  origin: string;
  secret: string;
  clientId: string;
  clientSecret: string;
  /** Request-bound values from the private bridge and existing Vibies cookies. */
  link?: { grantHash: string; sessionHash: string };
};

/** Construct per request. Do not expose `auth.handler`: use googleCallbackHandler below. */
export function createGoogleAuth(config: GoogleAuthConfig) {
  const origin = appOrigin(config.origin);
  const grant = async () => config.link
    ? googleLinkGrant(config.store, config.link.grantHash, config.link.sessionHash) : null;
  return betterAuth({
    appName: "Vibies",
    baseURL: origin,
    basePath: GOOGLE_AUTH_PATH,
    secret: config.secret,
    database: config.database,
    logger: { disabled: true },
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    user: { modelName: "google_users", changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: { modelName: "google_sessions", expiresIn: 300, updateAge: 300,
      disableSessionRefresh: true, cookieCache: { enabled: false } },
    account: {
      modelName: "google_accounts", storeStateStrategy: "database", storeAccountCookie: false,
      updateAccountOnSignIn: false,
      additionalFields: { authorizationHash: { type: "string", required: false, input: false, returned: false } },
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true,
        updateUserInfoOnLink: false },
    },
    verification: { modelName: "google_verifications" },
    socialProviders: { google: { clientId: config.clientId, clientSecret: config.clientSecret,
      disableSignUp: true, disableIdTokenSignIn: true, overrideUserInfoOnSignIn: false,
      // Subject identity is resolved independently by Better Auth. None of the provider profile is persisted.
      mapProfileToUser: () => ({ name: "Member", email: "unlinked@vibies.invalid", image: undefined }),
    } },
    advanced: { cookiePrefix: "vibies-google", useSecureCookies: origin.startsWith("https:"),
      ipAddress: { disableIpTracking: true },
      defaultCookieAttributes: { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/" } },
    databaseHooks: {
      user: { create: { before: async () => false }, update: { before: async () => false } },
      session: { create: { before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }) } },
      account: {
        create: { before: async (account) => {
          const authorization = await grant();
          if (!authorization || account.providerId !== "google" || account.userId !== authorization.user_id) return false;
          return { data: { ...account, accessToken: null, refreshToken: null, idToken: null,
            accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null, password: null,
            authorizationHash: config.link!.grantHash } };
        } },
        update: { before: async () => false },
        delete: { before: async () => false },
      },
    },
    plugins: [{ id: "vibies-github-bridge", endpoints: {
      githubBridge: createAuthEndpoint.serverOnly({ method: "POST" }, async (ctx) => {
        const authorization = await grant();
        if (!authorization) throw new APIError("FORBIDDEN", { message: "Google linking unavailable" });
        const user = await ctx.context.internalAdapter.findUserById(authorization.user_id);
        if (!user) throw new APIError("FORBIDDEN", { message: "Google linking unavailable" });
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError("FORBIDDEN", { message: "Google linking unavailable" });
        await setSessionCookie(ctx, { user, session });
        return ctx.json({ ok: true });
      }),
    } }],
  });
}

/** Only the OAuth callback is public. Initiation, bridge and session APIs are server-side only. */
export async function googleCallbackHandler(auth: ReturnType<typeof createGoogleAuth>, request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== `${GOOGLE_AUTH_PATH}/callback/google` || request.method !== "GET")
    return new Response("Not found", { status: 404 });
  return auth.handler(request);
}
