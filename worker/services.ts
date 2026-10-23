import { appOrigin, digest, readAccess, sameOriginPost, validToken } from '../lib/access-core';
import * as access from '../lib/d1/access';
import * as projects from '../lib/d1/projects';
import { readOnlyOperations } from '../lib/read-only';
import { repositoryId, projectVersion } from '../lib/project-core';
import { verifyRepository } from '../lib/project-github';
import { readCookies, cookie } from '../lib/google-auth/cookies';
import type { ProjectContext } from '../lib/projects';
import type { GoogleCoordinator } from './google-coordinator';
export interface Env {
  GOOGLE_COORDINATOR?: DurableObjectNamespace<GoogleCoordinator>;
  DB: access.AccessDatabase;
  VIBIES_APP_ORIGIN: string;
  VIBIES_ENVIRONMENT: string;
  VIBIES_READ_ONLY?: string;
  VIBIES_STAGING?: string;
  VIBIES_STAGING_SHA?: string;
  VIBIES_GITHUB_CLIENT_ID?: string;
  VIBIES_GITHUB_CLIENT_SECRET?: string;
  VIBIES_GITHUB_APP_ID?: string;
  VIBIES_GITHUB_APP_PRIVATE_KEY?: string;
  VIBIES_GITHUB_APP_SLUG?: string;
  VIBIES_GOOGLE_CLIENT_ID?: string;
  VIBIES_GOOGLE_CLIENT_SECRET?: string;
  VIBIES_GOOGLE_AUTH_SECRET?: string;
}
export function go(location: string) { return new Response(null,{status:303,headers:{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}}); }
export function safeError(status=503) { return new Response('We could not complete this action. Please go back and try again.',{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}}); }
export function createServices(request:Request, env:Env) {
  const origin=appOrigin(env.VIBIES_APP_ORIGIN), secure=origin.startsWith('https:');
  const readOnly=env.VIBIES_READ_ONLY==='1', jar=readCookies(request);
  const name=(value:string)=>`${secure?'__Host-':''}vibies-${value}`;
  const sessionHash=async()=> { const v=jar.get(name('session')); return validToken(v)?digest(v):null; };
  const database=async()=> {
    if (!env.DB || !env.VIBIES_ENVIRONMENT) throw new Error('Unavailable');
    const row=await env.DB.prepare('SELECT state, environment_id FROM deployment_activation WHERE singleton=1').first<{state:string;environment_id:string}>();
    if(row?.state!=='active'||row.environment_id!==env.VIBIES_ENVIRONMENT) throw new Error('Unavailable');
    return env.DB;
  };
  const domainOperation=async(name:string,...args:any[]):Promise<any>=> {
    if(readOnly && !(readOnlyOperations as readonly string[]).includes(name)) throw new Error('Read only');
    const db=await database();
    if(name==='access_state') return access.access_state(db,args[0],readOnly);
    const fn=({...access,...projects} as Record<string,unknown>)[name];
    if(typeof fn!=='function') throw new Error('Unavailable');
    return fn(db,...args);
  };
  const accessState=async()=> {try { await database(); return readAccess(await domainOperation('access_state',await sessionHash())); }catch{return {kind:'error' as const};} };
  const projectActor=async(hash:string,id?:string):Promise<{githubId:string;username:string}|ProjectContext|null>=> {
    const v=await domainOperation(id?'project_operation_context':'project_actor',hash,...(id?[id]:[]));
    if(v?.kind==='forbidden')return null;
    if(v?.kind!=='ok'||!repositoryId(v.githubId)||typeof v.username!=='string'||!/^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(v.username))throw new Error('Unavailable');
    const actor={githubId:v.githubId,username:v.username};
    if(!id)return actor;
    if(!repositoryId(v.repositoryId)||!projectVersion(v.version)||!['Draft','Published','Archived'].includes(v.publication)||!['Connected','Disconnected'].includes(v.connection))throw new Error('Unavailable');
    return {...actor,repositoryId:v.repositoryId,version:v.version,publication:v.publication,connection:v.connection};
  };
  const verifyProject=async(actor:{githubId:string;username:string},id?:string)=>env.VIBIES_GITHUB_APP_ID&&env.VIBIES_GITHUB_APP_PRIVATE_KEY?verifyRepository({appId:env.VIBIES_GITHUB_APP_ID,privateKey:env.VIBIES_GITHUB_APP_PRIVATE_KEY},actor,id):{kind:'unknown' as const};
  const setCookie=(response:Response,key:string,value:string,age:number)=>response.headers.append('Set-Cookie',cookie(name(key),value,secure,age));
  return {origin,secure,readOnly,jar,name,sessionHash,database,domainOperation,accessState,projectActor,verifyProject,setCookie,allowedPost:(r:Request)=>sameOriginPost(r,origin),googleEnabled:!!(env.VIBIES_GOOGLE_CLIENT_ID&&env.VIBIES_GOOGLE_CLIENT_SECRET&&env.VIBIES_GOOGLE_AUTH_SECRET)};
}
export type Services=ReturnType<typeof createServices>;
export function privatePath(path:string|null):string|null {return path&&(['/welcome','/wiki','/admin/members','/projects','/projects/connect'].includes(path)||/^\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path))?path:null;}
