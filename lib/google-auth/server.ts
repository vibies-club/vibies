import { isReadOnly, readOnlyResponse } from "../read-only";
import 'server-only';
import { cookieName, origin, sessionHash } from '../access';
import { allowedPost, go, safeError } from '../access-http';
import { cloudflareDatabase, usesD1 } from '../domain';
import { clearGoogleCookies } from './cookies';
import type { GoogleAuthConfig } from './better-auth';

export function googleEnabled() {
  return usesD1() && !!process.env.VIBIES_GOOGLE_CLIENT_ID && !!process.env.VIBIES_GOOGLE_CLIENT_SECRET && !!process.env.VIBIES_GOOGLE_AUTH_SECRET;
}
async function routes() {
  if (!googleEnabled()) throw new Error('Google sign-in unavailable');
  const db = await cloudflareDatabase();
  const { createGoogleRoutes } = await import('./http');
  return createGoogleRoutes({store:db,database:db as unknown as GoogleAuthConfig['database'],origin:origin(),
    clientId:process.env.VIBIES_GOOGLE_CLIENT_ID!,clientSecret:process.env.VIBIES_GOOGLE_CLIENT_SECRET!,
    secret:process.env.VIBIES_GOOGLE_AUTH_SECRET!,sessionCookie:cookieName('session'),browserCookie:cookieName('browser')});
}
export async function googleRoute(request:Request, operation:'start'|'link'|'callback') {
  if (operation!=='callback' && !allowedPost(request)) return safeError(403);
  if (isReadOnly()) return readOnlyResponse();
  try { return await (await routes())[operation](request); }
  catch { return go('/sign-in?message=unavailable'); }
}
export async function endGoogleBrowserSession(request:Request,response:Response) {
  try { if (!isReadOnly() && googleEnabled()) await (await routes()).signOut(request,response); }
  finally { clearGoogleCookies(request,response,new URL(request.url).protocol==='https:'); }
}
export async function googleLinkStatus() {
  if (!googleEnabled()) return null;
  const hash = await sessionHash(); if (!hash) return null;
  try {
    const db = await cloudflareDatabase();
    return await db.prepare(`SELECT EXISTS(SELECT 1 FROM google_identity_map m JOIN google_accounts g ON g.userId=m.user_id
        WHERE m.github_id=s.github_id) linked,
      (s.auth_provider='github' AND julianday(s.created_at)>julianday('now','-5 minutes')) canLink
      FROM sessions s WHERE s.session_hash=? AND julianday(s.created_at)>julianday('now','-24 hours')`)
      .bind(hash).first<{linked:number;canLink:number}>();
  } catch { return null; }
}
