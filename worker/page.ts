import type { PageData } from '../frontend/contracts';
import { validToken } from '../lib/access-core';
import { demoState } from '../lib/demo';
import { readProject } from '../lib/project-read';
import { projectId } from '../lib/project-core';
import { wikiEntries } from '../lib/wiki';
import { privatePath, type Services, type Env } from './services';
import { coursePage } from './course';
export async function page(request:Request,s:Services,env:Env) {
  const url=new URL(request.url),path=url.searchParams.get('path');
  const valid=path&&(['/','/demo','/errors','/sign-in','/access-denied'].includes(path)||privatePath(path));
  if(!valid||[...url.searchParams.keys()].some(k=>!['path','message','google','refresh','status','returnTo'].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)||[...url.searchParams.values()].some(v=>v.length>512))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const fetchSite=request.headers.get('sec-fetch-site');
  if((request.headers.has('origin')&&request.headers.get('origin')!==s.origin)||fetchSite==='cross-site')return new Response('Forbidden',{status:403,headers:{'Cache-Control':'no-store'}});
  const data:PageData={kind:'ok',access:await s.accessState(),googleEnabled:s.googleEnabled,readOnly:s.readOnly};
  if(env.VIBIES_STAGING==='true'&&env.VIBIES_ENVIRONMENT==='staging'&&/^[a-f0-9]{40}$/i.test(env.VIBIES_STAGING_SHA??''))data.staging={sha:env.VIBIES_STAGING_SHA!};
  try {
    if(data.access.kind==='error')throw new Error('Unavailable');
    if(path==='/sign-in') {
      if(!validToken(s.jar.get(s.name('browser'))))data.redirect='/auth/browser';
      else if(data.access.kind==='member'||data.access.kind==='instructor')data.redirect='/welcome';
      else if(data.access.kind==='denied')data.redirect='/access-denied';
    }
    if(path==='/access-denied') {
      if(data.access.kind==='signed_out')data.redirect='/sign-in?message=expired';
      else if(data.access.kind==='member'||data.access.kind==='instructor')data.redirect='/welcome';
    }
    if(privatePath(path)) {
      if(data.access.kind==='signed_out') {data.redirect='/sign-in?message=expired';}
      else if(data.access.kind==='denied')data.redirect='/access-denied';
      else if((path==='/admin/members'||path==='/admin/gates')&&data.access.kind!=='instructor')data.redirect='/welcome';
      else if(path==='/projects/connect'&&data.access.kind==='instructor')data.redirect='/projects';
    }
    if(!data.redirect){
      const hash=await s.sessionHash();
      if(path==='/wiki')data.wiki=wikiEntries;
      await coursePage(path,data,env,s,hash);
      if(path==='/demo')data.demo=demoState(await(await s.database()).prepare('SELECT id,title,summary FROM demo_projects WHERE id=1').first(),null);
      if(path==='/welcome'&&s.googleEnabled&&hash){
        const row=await(await s.database()).prepare(`SELECT EXISTS(SELECT 1 FROM google_identity_map m JOIN google_accounts g ON g.userId=m.user_id WHERE m.github_id=s.github_id) linked,(s.auth_provider='github' AND julianday(s.created_at)>julianday('now','-5 minutes')) canLink FROM sessions s WHERE s.session_hash=? AND julianday(s.created_at)>julianday('now','-24 hours')`).bind(hash).first<{linked:number;canLink:number}>();
        if(row)data.linking={linked:row.linked===1,canLink:row.canLink===1};
      }
      const readMembers=async()=>{
        const v=await s.domainOperation('members',hash);
        if(v.kind!=='ok'||!Number.isInteger(v.activeCount)||v.activeCount<0||v.activeCount>8||!Array.isArray(v.accounts)||!v.accounts.every((a:any)=>a&&typeof a.githubId==='string'&&/^[1-9]\d{0,19}$/.test(a.githubId)&&typeof a.username==='string'&&(a.nickname===null||typeof a.nickname==='string')&&['unapproved','approved','revoked'].includes(a.status)))throw new Error('Unavailable');
        return {activeCount:v.activeCount,accounts:v.accounts.map((a:any)=>({githubId:a.githubId,username:a.username,nickname:a.nickname,status:a.status}))};
      };
      const readProjects=async()=>{
        const v=await s.domainOperation('projects',hash);if(v.kind!=='ok'||!Array.isArray(v.mine)||!Array.isArray(v.community))throw new Error('Unavailable');
        return {mine:v.mine.map(readProject),community:v.community.map(readProject)};
      };
      if(path==='/admin/members')data.members=await readMembers();
      if(path==='/projects')data.projects=await readProjects();
      if(path==='/welcome'){
        // Home extras reuse existing reads. A failed read only leaves its card in a fallback state.
        if(data.access.kind==='instructor')try{data.members=await readMembers();}catch{}
        try{data.projects=await readProjects();}catch{}
        // The first product's roadmap only comes with the single-project read.
        const first=data.projects?.mine[0];
        if(first)try{const p=await s.domainOperation('project',hash,first.id);if(p.kind==='ok')data.project={kind:'ok',project:readProject(p.project)};}catch{}
      }
      if(path.startsWith('/projects/')&&projectId(path.slice(10))){
        const v=await s.domainOperation('project',hash,path.slice(10));
        if(v.kind==='missing')data.project={kind:'missing'};
        else if(v.kind==='ok')data.project={kind:'ok',project:readProject(v.project)};
        else throw new Error('Unavailable');
      }
      if(path==='/projects/connect'){
        const slug=env.VIBIES_GITHUB_APP_SLUG;
        data.connect={install:slug&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)?`https://github.com/apps/${slug}/installations/new`:null,repositories:[]};
        if(url.searchParams.get('refresh')==='yes'){
          const actor=hash?await s.projectActor(hash):null;
          if(!actor)data.connect.status='error';else {const v=await s.verifyProject(actor);if(v.kind==='verified')data.connect.repositories=v.repositories??[];else data.connect.status=v.kind;}
        }
      }
    }
  }catch { data.kind='error';delete data.members;delete data.projects;delete data.project;delete data.linking;delete data.connect;delete data.demo;delete data.course;delete data.session;delete data.gates;delete data.gateBoard; }
  const response=Response.json(data,{status:data.kind==='error'?503:data.redirect?.startsWith('/sign-in')?401:data.redirect==='/access-denied'?403:200,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
  if(data.redirect?.startsWith('/sign-in')&&privatePath(path))s.setCookie(response,'return',encodeURIComponent(path!),600);
  const returnTo=privatePath(url.searchParams.get('returnTo'));
  if(path==='/sign-in'&&returnTo)s.setCookie(response,'return',encodeURIComponent(returnTo),600);
  return response;
}
