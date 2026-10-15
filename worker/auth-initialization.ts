import { getBooleanEnvVar } from '@better-auth/core/env';
import { appOrigin } from '../lib/access-core';
import { googleAuthForRequest, type GoogleAuthConfig } from '../lib/google-auth/better-auth';
import type { Env } from './services';

/** Prepare metadata only. Activation and every database operation remain request-bound. */
export async function primeGoogleAuth(bindings: Partial<Env> & { BETTER_AUTH_TELEMETRY?: unknown }): Promise<boolean> {
  try {
    // Better Auth's environment flag overrides telemetry.enabled=false. Skip
    // priming if either source could enable it; never mutate the environment.
    if (bindings.BETTER_AUTH_TELEMETRY !== undefined || getBooleanEnvVar('BETTER_AUTH_TELEMETRY', false)) return false;
    const { DB, VIBIES_APP_ORIGIN, VIBIES_ENVIRONMENT, VIBIES_GOOGLE_CLIENT_ID,
      VIBIES_GOOGLE_CLIENT_SECRET, VIBIES_GOOGLE_AUTH_SECRET } = bindings;
    if (!DB || typeof DB.prepare !== 'function' || typeof DB.batch !== 'function' ||
      !('exec' in DB) || typeof DB.exec !== 'function' || ![VIBIES_APP_ORIGIN, VIBIES_ENVIRONMENT,
        VIBIES_GOOGLE_CLIENT_ID, VIBIES_GOOGLE_CLIENT_SECRET, VIBIES_GOOGLE_AUTH_SECRET]
        .every(value => typeof value === 'string' && value.length > 0)) return false;
    const auth = await googleAuthForRequest({ database: DB as GoogleAuthConfig['database'], store: DB,
      origin: appOrigin(VIBIES_APP_ORIGIN!), clientId: VIBIES_GOOGLE_CLIENT_ID!,
      clientSecret: VIBIES_GOOGLE_CLIENT_SECRET!, secret: VIBIES_GOOGLE_AUTH_SECRET! });
    await auth.$context;
    return true;
  } catch {
    // Failed preparation is evicted by the auth cache. Requests retry normally,
    // still behind the activation and authorization checks.
    return false;
  }
}
