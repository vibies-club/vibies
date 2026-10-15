import { isReadOnly, readOnlyResponse } from "../read-only.ts";
import { appOrigin, digest, sameOriginPost, token, validToken } from "../access-core.ts";
import { begin_sign_in, consume_sign_in, end_session, type AccessDatabase } from "../d1/access.ts";
import { googleAuthForRequest, googleCallbackHandler, type GoogleAuthConfig } from "./better-auth.ts";
import { beginGoogleLink, cancelGoogleLink, finishGoogleSignIn } from "./store.ts";
import { clearGoogleCookies, cookie, grantCookie, readCookies } from "./cookies.ts";
export { clearGoogleCookies, grantCookie } from "./cookies.ts";

export type GoogleRoutesConfig = Omit<GoogleAuthConfig, 'link' | 'store'> & {
  store: AccessDatabase; sessionCookie: string; browserCookie: string; readOnly?: boolean; loginDestination?: string;
};
const fixedDestination = '/auth/google/callback';
function redirect(path: string) {
  return new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
function carryCookies(target: Headers, source: Headers) {
  for (const value of source.getSetCookie()) target.append('Set-Cookie', value);
}
function requestWithCookies(request: Request, headers: Headers) {
  const jar = readCookies(request);
  for (const value of headers.getSetCookie()) {
    const part = value.split(';')[0]; const index = part.indexOf('=');
    jar.set(part.slice(0,index),part.slice(index+1));
  }
  const next = new Headers(request.headers);
  next.set('cookie',[...jar].map(([key,value])=>`${key}=${value}`).join('; '));
  return next;
}

export function createGoogleRoutes(config: GoogleRoutesConfig) {
  const origin = appOrigin(config.origin); const secure = origin.startsWith('https:');
  const authFor = (request: Request) => {
    const jar = readCookies(request); const grant = jar.get(grantCookie(secure)); const session = jar.get(config.sessionCookie);
    return googleAuthForRequest({...config,link:validToken(grant) && validToken(session)
      ? {grantHash:digest(grant),sessionHash:digest(session)}:undefined});
  };
  async function start(request: Request, linking: boolean) {
    if (!sameOriginPost(request,origin)) return new Response('Forbidden',{status:403});
    if (config.readOnly ?? isReadOnly()) return readOnlyResponse();
    const jar = readCookies(request); const browser = jar.get(config.browserCookie);
    if (!validToken(browser)) return redirect('/auth/browser');
    let grant: string | undefined;
    try {
      const attempt = token();
      const throttle = await begin_sign_in(config.store,digest(browser),digest(attempt));
      if (throttle.kind !== 'ok') return redirect(`/sign-in?message=${throttle.kind==='limited'?'limited':'unavailable'}`);
      await consume_sign_in(config.store,digest(browser),digest(attempt));
      const session = jar.get(config.sessionCookie);
      grant = linking ? token() : undefined;
      if (linking && (!validToken(session) || !await beginGoogleLink(config.store,digest(session),digest(grant!))))
        return redirect('/welcome?google=reauth');
      const auth = await googleAuthForRequest({...config,link:grant ? {grantHash:digest(grant),sessionHash:digest(session!)}:undefined});
      let headers = new Headers({origin});
      let bridge: Response | undefined;
      if (linking) {
        bridge = await auth.api.githubBridge({method:'POST',headers,asResponse:true});
        if (!bridge.ok) throw new Error('Bridge unavailable');
        headers = requestWithCookies(new Request(origin),bridge.headers);
        headers.set('origin',origin);
      }
      const body = {provider:'google' as const,callbackURL:origin+fixedDestination,
        errorCallbackURL:origin+fixedDestination+'?error=failed',disableRedirect:true};
      const started = linking ? await auth.api.linkSocialAccount({headers,body,asResponse:true})
        : await auth.api.signInSocial({headers,body,asResponse:true});
      if (!started.ok) throw new Error('Google sign-in unavailable');
      const payload = await started.json() as {url?:unknown};
      if (typeof payload.url !== 'string' || new URL(payload.url).origin !== 'https://accounts.google.com')
        throw new Error('Invalid provider URL');
      const response = redirect(payload.url);
      if (bridge) carryCookies(response.headers,bridge.headers);
      carryCookies(response.headers,started.headers);
      response.headers.append('Set-Cookie',cookie(grantCookie(secure),grant??'',secure,grant?300:0));
      return response;
    } catch {
      if (grant) await cancelGoogleLink(config.store,digest(grant)).catch(()=>{});
      const response = redirect(linking?'/welcome?google=failed':'/sign-in?message=failed');
      clearGoogleCookies(request,response,secure); return response;
    }
  }
  async function callback(request: Request) {
    if (config.readOnly ?? isReadOnly()) return readOnlyResponse();
    const jar = readCookies(request); const grant = jar.get(grantCookie(secure)); const previous = jar.get(config.sessionCookie);
    let failureMessage = 'failed';
    const failure = () => redirect(validToken(grant)?'/welcome?google=failed':`/sign-in?message=${failureMessage}`);
    let response: Response;
    try {
      const auth = await authFor(request);
      const result = await googleCallbackHandler(auth,request);
      const destination = new URL(result.headers.get('location') ?? '/', origin);
      if (!validToken(grant) && destination.origin === origin && destination.pathname === fixedDestination &&
          destination.searchParams.getAll('error').includes('signup_disabled')) failureMessage = 'googlelink';
      if (result.headers.get('location') !== origin+fixedDestination) throw new Error('Google callback failed');
      if (validToken(grant) && validToken(previous)) {
        const linked = await config.store.prepare(`SELECT a.id FROM google_accounts a JOIN google_identity_map m ON m.user_id=a.userId
          JOIN sessions s ON s.github_id=m.github_id WHERE s.session_hash=?1 AND s.auth_provider='github'
          AND a.authorizationHash=?2 AND julianday(s.created_at)>julianday('now','-5 minutes')
          AND (s.github_id=(SELECT instructor_github_id FROM community WHERE singleton=1)
            OR EXISTS(SELECT 1 FROM accounts v WHERE v.github_id=s.github_id AND v.status='approved'))`)
          .bind(digest(previous),digest(grant)).first();
        if (!linked) throw new Error('Link unavailable');
        response=redirect('/welcome?google=linked');
      } else {
        const session = await auth.api.getSession({headers:requestWithCookies(request,result.headers)});
        const next = token();
        if (!session || !await finishGoogleSignIn(config.store,session.user.id,digest(next),session.session.token))
          throw new Error('Google sign-in unavailable');
        if (validToken(previous)) await end_session(config.store,digest(previous));
        response=redirect(config.loginDestination ?? '/welcome');
        response.headers.append('Set-Cookie',cookie(config.sessionCookie,next,secure,86400));
      }
    } catch { response=failure(); }
    if (validToken(grant)) await cancelGoogleLink(config.store,digest(grant)).catch(()=>{});
    clearGoogleCookies(request,response,secure); return response;
  }
  async function signOut(request: Request, response: Response) {
    try {
      if (config.readOnly ?? isReadOnly()) throw new Error("Read only");
      const auth = await authFor(request);
      await auth.api.signOut({headers:request.headers});
      const grant = readCookies(request).get(grantCookie(secure));
      if (validToken(grant)) await cancelGoogleLink(config.store,digest(grant));
    } finally { clearGoogleCookies(request,response,secure); }
  }
  return {start:(request:Request)=>start(request,false),link:(request:Request)=>start(request,true),callback,signOut};
}
