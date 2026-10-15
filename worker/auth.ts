import { authorizationURL, digest, exchangeGitHub, token, validToken } from '../lib/access-core';
import { clearGoogleCookies } from '../lib/google-auth/cookies';
import { readOnlyResponse } from '../lib/read-only';
import { go, privatePath, safeError, type Env, type Services } from './services';
import type { GoogleAuthConfig } from '../lib/google-auth/better-auth';
import { createGoogleRoutes } from '../lib/google-auth/http';
export async function auth(request:Request,s:Services,env:Env,path:string) {
  const config=()=> {if(!env.VIBIES_GITHUB_CLIENT_ID||!env.VIBIES_GITHUB_CLIENT_SECRET)throw new Error('Unavailable');return {origin:s.origin,clientId:env.VIBIES_GITHUB_CLIENT_ID,clientSecret:env.VIBIES_GITHUB_CLIENT_SECRET};};
  const destination=()=> {try{return privatePath(decodeURIComponent(s.jar.get(s.name('return'))??''))??'/welcome';}catch{return '/welcome';}};
  const google=async()=>{
    if(!s.googleEnabled)throw new Error('Unavailable');
    const db=await s.database();
    return createGoogleRoutes({store:db,database:db as unknown as GoogleAuthConfig['database'],origin:s.origin,clientId:env.VIBIES_GOOGLE_CLIENT_ID!,clientSecret:env.VIBIES_GOOGLE_CLIENT_SECRET!,secret:env.VIBIES_GOOGLE_AUTH_SECRET!,sessionCookie:s.name('session'),browserCookie:s.name('browser'),readOnly:s.readOnly,loginDestination:destination()});
  };
  if(path==='/auth/browser') {
    const response=go('/sign-in');
    if(!validToken(s.jar.get(s.name('browser'))))s.setCookie(response,'browser',token(),86400);
    const back=privatePath(new URL(request.url).searchParams.get('returnTo'));if(back)s.setCookie(response,'return',encodeURIComponent(back),600);
    return response;
  }
  if(request.method==='POST'&&!s.allowedPost(request))return safeError(403);
  if(path==='/auth/sign-out') {
    const response=go('/');
    try {if(!s.readOnly){await s.domainOperation('end_session',await s.sessionHash());if(s.googleEnabled)await(await google()).signOut(request,response);}}catch{}
    finally {s.setCookie(response,'session','',0);s.setCookie(response,'oauth','',0);s.setCookie(response,'return','',0);clearGoogleCookies(request,response,s.secure);}
    return response;
  }
  if(s.readOnly)return readOnlyResponse();
  if(path.startsWith('/auth/google/')) {
    try{
      const routes=await google();
      const result=await(path==='/auth/google/start'?routes.start(request):path==='/auth/google/link'?routes.link(request):routes.callback(request));
      if(path.endsWith('/callback/google')&&result.headers.get('location')===destination())s.setCookie(result,'return','',0);
      return result;
    }catch{return go('/sign-in?message=unavailable');}
  }
  if(path==='/auth/start') {
    const browser=s.jar.get(s.name('browser'));if(!validToken(browser))return go('/auth/browser');
    try {const state=token(),verifier=token();const result=await s.domainOperation('begin_sign_in',digest(browser),digest(state));
      if(result.kind!=='ok')return go(`/sign-in?message=${result.kind==='limited'?'limited':'unavailable'}`);
      const response=go(authorizationURL(config(),state,verifier).toString());s.setCookie(response,'oauth',`${state}.${verifier}`,600);return response;
    }catch{return go('/sign-in?message=unavailable');}
  }
  const params=new URL(request.url).searchParams,state=params.get('state'),browser=s.jar.get(s.name('browser')),oauth=s.jar.get(s.name('oauth'))?.split('.');
  const done=(path:string)=>{const response=go(path);s.setCookie(response,'oauth','',0);return response;};
  if(!validToken(state)||!validToken(browser)||oauth?.length!==2||oauth[0]!==state||!validToken(oauth[1]))return done('/sign-in?message=failed');
  try {
    if(!await s.domainOperation('consume_sign_in',digest(browser),digest(state)))return done('/sign-in?message=failed');
    if(params.get('error')==='access_denied')return done('/sign-in');
    const code=params.get('code');if(params.has('error')||!code||code.length>1024)return done('/sign-in?message=failed');
    const account=await exchangeGitHub(config(),code,oauth[1]);const session=token();
    await s.domainOperation('finish_sign_in',account.githubId,account.username,digest(session),await s.sessionHash());
    const response=done(destination());s.setCookie(response,'session',session,86400);s.setCookie(response,'return','',0);return response;
  }catch{return done('/sign-in?message=failed');}
}
