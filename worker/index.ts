import { env as startupEnv } from 'cloudflare:workers';
import { primeGoogleAuth } from './auth-initialization';
import { createServices, privatePath, safeError, type Env } from './services';
import { page } from './page';
import { auth } from './auth';
import { projectAction } from './project-action';
import { memberAction } from './member-action';
// Prepare pure auth metadata once; request-time activation remains in createServices.
await primeGoogleAuth(startupEnv);

export type WorkerEnv=Env & {ASSETS?:{fetch(request:Request):Promise<Response>}};
const methods:Record<string,string>={'/api/page':'GET','/auth/browser':'GET','/auth/start':'POST','/auth/callback':'GET','/auth/sign-out':'POST','/auth/google/start':'POST','/auth/google/link':'POST','/auth/google/provider/callback/google':'GET','/projects/action':'POST','/admin/members/action':'POST'};
async function handle(request:Request,env:WorkerEnv):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(methods[path]&&request.method!==methods[path])return new Response('Method not allowed',{status:405,headers:{Allow:methods[path],'Cache-Control':'no-store'}});
  try{
    if(methods[path]){
      const s=createServices(request,env);
      if(url.origin!==s.origin)return safeError(403);
      if(path==='/api/page')return await page(request,s,env);
      if(path.startsWith('/auth/'))return await auth(request,s,env,path);
      if(path==='/projects/action')return await projectAction(request,s);
      return await memberAction(request,s);
    }
    if(['/','/demo','/sign-in','/access-denied'].includes(path)||privatePath(path)){
      if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
      if(env.ASSETS)return env.ASSETS.fetch(new Request(new URL(path==='/'?'/index.html':'/shell.html',url),request));
    }
    return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  }catch{return safeError();}
}
export default {async fetch(request:Request,env:WorkerEnv,_ctx:unknown):Promise<Response>{
  const result=await handle(request,env);
  const response=new Response(result.body,result);
  response.headers.set('X-Frame-Options','DENY');
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy',new URL(request.url).pathname.startsWith('/auth/')?'no-referrer':'same-origin');
  return response;
}};
