import { validToken } from '../access-core.ts';
import { milestoneDetails, projectDetails, projectId, projectVersion } from '../project-core.ts';
import type { AccessDatabase, D1Result, D1Statement } from './access.ts';

const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const fresh = "julianday(s.created_at) > julianday('now','-24 hours')";
const owner = `EXISTS (SELECT 1 FROM sessions s JOIN accounts a ON a.github_id=s.github_id
  WHERE s.session_hash=?1 AND ${fresh} AND a.status='approved' AND a.internal_id=p.owner_account_id)`;
const member = `SELECT a.internal_id FROM sessions s JOIN accounts a ON a.github_id=s.github_id
  WHERE s.session_hash=?1 AND ${fresh} AND a.status='approved'`;
const instructor = `EXISTS (SELECT 1 FROM sessions s JOIN community c ON c.instructor_github_id=s.github_id
  WHERE s.session_hash=?1 AND c.singleton=1 AND ${fresh})`;
const nextVersion = 'CASE WHEN version=9223372036854775807 THEN NULL ELSE version+1 END';
type Kind = {kind:string};
type Row = Record<string, unknown>;
function rows<T>(result:D1Result<T>):T[] {
  if (!result.success) throw new Error('Project unavailable');
  return result.results;
}
const validVersion = (value:string) => projectVersion(value);
function validDetails(title:string, summary:string, demoUrl:string|null) {
  const value = projectDetails(title,summary,demoUrl ?? '');
  return value !== null && value.title === title && value.summary === summary && value.demoUrl === demoUrl;
}
function validMilestone(title:string, note:string|null) {
  const value = milestoneDetails(title,note);
  return value !== null && value.title === title && value.blockedNote === note;
}
function statements(db:AccessDatabase,args:unknown[]) {
  return (sql:string) => {
    const count = Math.max(0,...Array.from(sql.matchAll(/\?(\d+)/g),match=>Number(match[1])));
    return db.prepare(sql).bind(...args.slice(0,count));
  };
}
async function mutation(db:AccessDatabase, queries:D1Statement[]):Promise<Kind> {
  const result = await db.batch<Kind>(queries);
  result.forEach(rows);
  return rows(result[0])[0];
}
// Evaluate this inside each mutation, including after any asynchronous caller work.
function decision(success:string, tail = "") {
  return `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM personal_projects p WHERE p.id=?2 AND ${owner})
    THEN 'forbidden' WHEN p.version<>CAST(?3 AS INTEGER) THEN 'stale' ${tail}
    ELSE '${success}' END kind FROM (SELECT 1) LEFT JOIN personal_projects p ON p.id=?2`;
}
function bump(decide:string, success:string, assignments = '') {
  return `UPDATE personal_projects SET version=${nextVersion},updated_at=${now}${assignments}
    WHERE id=?2 AND (${decide})='${success}' RETURNING id`;
}

export async function project_actor(db:AccessDatabase,hash:string|null):Promise<Kind & Row> {
  if (!validToken(hash)) return {kind:'forbidden'};
  const row = await db.prepare(`SELECT a.github_id AS githubId,a.github_username AS username
    FROM sessions s JOIN accounts a ON a.github_id=s.github_id
    WHERE s.session_hash=?1 AND ${fresh} AND a.status='approved'`).bind(hash).first<Row>();
  return row ? {kind:'ok',...row} : {kind:'forbidden'};
}
export async function project_operation_context(db:AccessDatabase,hash:string|null,id:string):Promise<Kind & Row> {
  if (!validToken(hash)||!projectId(id)) return {kind:'forbidden'};
  id=id.toLowerCase();
  const row = await db.prepare(`SELECT a.github_id AS githubId,a.github_username AS username,
    p.repository_id AS repositoryId,CAST(p.version AS TEXT) AS version,p.publication,p.connection,p.moderation
    FROM personal_projects p JOIN accounts a ON a.internal_id=p.owner_account_id
    JOIN sessions s ON s.github_id=a.github_id WHERE s.session_hash=?1 AND p.id=?2
    AND ${fresh} AND a.status='approved'`).bind(hash,id).first<Row>();
  return row ? {kind:'ok',...row} : {kind:'forbidden'};
}

export async function connect_project(db:AccessDatabase,hash:string|null,repository:string,title:string,summary:string,demoUrl:string|null=null):Promise<Kind & {id?:string;version?:string}> {
  if (!validToken(hash)||!/^[1-9][0-9]{0,15}$/.test(repository)||!validDetails(title,summary,demoUrl)) return {kind:'invalid'};
  const id = crypto.randomUUID();
  const args=[hash,repository,title,summary,demoUrl,id];
  const stmt=statements(db,args);
  const decide=`SELECT CASE WHEN NOT EXISTS (${member}) THEN 'forbidden'
    WHEN p.id IS NOT NULL THEN CASE WHEN p.owner_account_id=(${member}) THEN 'existing' ELSE 'conflict' END
    WHEN (SELECT count(*) FROM personal_projects WHERE owner_account_id=(${member}))>=3 THEN 'full'
    ELSE 'created' END kind,p.id,CAST(p.version AS TEXT) version
    FROM (SELECT 1) LEFT JOIN personal_projects p ON p.repository_id=?2`;
  const result=await db.batch<Kind & {id:string|null;version:string|null}>([
    stmt(decide),stmt(`INSERT INTO personal_projects(id,owner_account_id,repository_id,title,summary,demo_url,last_checked_at)
      SELECT ?6,(${member}),?2,?3,?4,?5,${now} WHERE (SELECT kind FROM (${decide}))='created' RETURNING id`),
  ]);
  result.forEach(rows);
  const before=rows(result[0])[0];
  if(before.kind==='created') return {kind:'created',id,version:'1'};
  if(before.kind==='existing') return {kind:'existing',id:before.id!,version:before.version!};
  return {kind:before.kind};
}

export async function publish_project(db:AccessDatabase,hash:string|null,id:string,version:string):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!validVersion(version)) return {kind:'invalid'};
  id=id.toLowerCase();
  const stmt=statements(db,[hash,id,version]);
  const decide=decision('published',"WHEN p.connection<>'Connected' OR p.publication='Archived' THEN 'invalid' WHEN p.publication='Published' THEN 'already_published'");
  return mutation(db,[stmt(decide),stmt(bump(decide,'published',",publication='Published'")),
    stmt(`UPDATE accounts SET onboarding_completed=1 WHERE internal_id=(SELECT owner_account_id FROM personal_projects WHERE id=?2)
      AND changes()=1 RETURNING internal_id`)]);
}
export async function record_project_connection(db:AccessDatabase,hash:string|null,id:string,version:string,connected:boolean):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!validVersion(version)||typeof connected!=='boolean') return {kind:'invalid'};
  id=id.toLowerCase();
  const success=connected?'connected':'disconnected';
  const stmt=statements(db,[hash,id,version]);
  const decide=decision(success);
  return mutation(db,[stmt(decide),stmt(bump(decide,success,`,connection='${connected?'Connected':'Disconnected'}'${connected?`,last_checked_at=${now}`:''}`))]);
}
export async function edit_project(db:AccessDatabase,hash:string|null,id:string,version:string,title:string,summary:string,demoUrl:string|null=null):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!validVersion(version)||!validDetails(title,summary,demoUrl)) return {kind:'invalid'};
  id=id.toLowerCase();
  const stmt=statements(db,[hash,id,version,title,summary,demoUrl]);
  const decide=decision('edited');
  return mutation(db,[stmt(decide),stmt(bump(decide,'edited',',title=?4,summary=?5,demo_url=?6'))]);
}
export async function delete_project(db:AccessDatabase,hash:string|null,id:string,version:string):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!validVersion(version)) return {kind:'invalid'};
  id=id.toLowerCase();
  const stmt=statements(db,[hash,id,version]);
  const decide=decision('deleted');
  return mutation(db,[stmt(decide),stmt(`DELETE FROM personal_projects WHERE id=?2 AND (${decide})='deleted' RETURNING id`)]);
}
export async function moderate_project(db:AccessDatabase,hash:string|null,id:string,version:string,hidden:boolean):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!validVersion(version)||typeof hidden!=='boolean') return {kind:'invalid'};
  id=id.toLowerCase();
  const success=hidden?'hidden':'restored';
  const stmt=statements(db,[hash,id,version]);
  const available="(p.moderation='Hidden' OR (p.publication='Published' AND p.connection='Connected' AND p.moderation='Visible'))";
  const decide=`SELECT CASE WHEN NOT (${instructor}) OR p.id IS NULL OR NOT ${available} THEN 'forbidden'
    WHEN p.version<>CAST(?3 AS INTEGER) THEN 'stale' ELSE '${success}' END kind
    FROM (SELECT 1) LEFT JOIN personal_projects p ON p.id=?2`;
  // The source leaves updated_at unchanged for moderation and no-op moderation preserves version.
  return mutation(db,[stmt(decide),stmt(`UPDATE personal_projects SET moderation='${hidden?'Hidden':'Visible'}',version=${nextVersion}
    WHERE id=?2 AND moderation<>'${hidden?'Hidden':'Visible'}' AND (${decide})='${success}' RETURNING id`)]);
}

export async function add_project_milestone(db:AccessDatabase,hash:string|null,id:string,version:string,title:string,note:string|null=null):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!validVersion(version)||!validMilestone(title,note)) return {kind:'invalid'};
  id=id.toLowerCase();
  const stmt=statements(db,[hash,id,version,title,note,crypto.randomUUID()]);
  const decide=decision('added',"WHEN (SELECT count(*) FROM project_milestones WHERE project_id=?2)>=20 THEN 'full'");
  return mutation(db,[stmt(decide),stmt(bump(decide,'added')),
    stmt(`INSERT INTO project_milestones(id,project_id,title,blocked_note,position)
      SELECT ?6,?2,?4,?5,(SELECT count(*)+1 FROM project_milestones WHERE project_id=?2) WHERE changes()=1 RETURNING id`)]);
}
export async function edit_project_milestone(db:AccessDatabase,hash:string|null,id:string,milestoneId:string|null,version:string,title:string,note:string|null=null):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!projectId(milestoneId)||!validVersion(version)||!validMilestone(title,note)) return {kind:'invalid'};
  id=id.toLowerCase(); milestoneId=milestoneId.toLowerCase();
  const stmt=statements(db,[hash,id,version,milestoneId,title,note]);
  const decide=decision('edited',`WHEN NOT EXISTS (SELECT 1 FROM project_milestones WHERE project_id=?2 AND id=?4 AND (completed=0 OR ?6 IS NULL)) THEN 'invalid'
    WHEN EXISTS (SELECT 1 FROM project_milestones WHERE id=?4 AND title=?5 AND blocked_note IS ?6) THEN 'unchanged'`);
  return mutation(db,[stmt(decide),stmt(bump(decide,'edited')),
    stmt(`UPDATE project_milestones SET title=?5,blocked_note=?6,updated_at=${now} WHERE project_id=?2 AND id=?4 AND changes()=1 RETURNING id`)]);
}
export async function set_project_milestone_completion(db:AccessDatabase,hash:string|null,id:string,milestoneId:string|null,version:string,completed:boolean):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!projectId(milestoneId)||!validVersion(version)||typeof completed!=='boolean') return {kind:'invalid'};
  id=id.toLowerCase(); milestoneId=milestoneId.toLowerCase();
  const success=completed?'completed':'reopened';
  const stmt=statements(db,[hash,id,version,milestoneId,completed?1:0]);
  const decide=decision(success,`WHEN NOT EXISTS (SELECT 1 FROM project_milestones WHERE project_id=?2 AND id=?4) THEN 'invalid'
    WHEN EXISTS (SELECT 1 FROM project_milestones WHERE id=?4 AND completed=?5) THEN 'unchanged'`);
  return mutation(db,[stmt(decide),stmt(bump(decide,success)),
    stmt(`UPDATE project_milestones SET completed=?5,blocked_note=CASE WHEN ?5=1 THEN NULL ELSE blocked_note END,updated_at=${now}
      WHERE project_id=?2 AND id=?4 AND changes()=1 RETURNING id`)]);
}

type MilestoneRow={id:string;project_id:string;title:string;completed:number;blocked_note:string|null;position:number;created_at:string;updated_at:string};
async function reorder(db:AccessDatabase,hash:string,id:string,milestoneId:string,version:string,direction:'up'|'down'|null):Promise<Kind> {
  // The snapshot is only material for the batch; expected-version/current-owner checks
  // inside its first write are the authority. A concurrent mutation makes it stale.
  const snapshot=rows(await db.prepare(`SELECT m.* FROM project_milestones m JOIN personal_projects p ON p.id=m.project_id
    WHERE p.id=?2 AND p.version=CAST(?3 AS INTEGER) ORDER BY m.position`).bind(hash,id,version).all<MilestoneRow>());
  const source=snapshot.find(row=>row.id===milestoneId);
  const index=source?snapshot.indexOf(source):-1;
  const target=direction==='up'?index-1:index+1;
  const success=direction?'moved':'deleted';
  const stmt=statements(db,[hash,id,version,milestoneId]);
  const decide=decision(success,`WHEN NOT EXISTS (SELECT 1 FROM project_milestones WHERE project_id=?2 AND id=?4) THEN 'invalid'
    ${direction?`WHEN NOT EXISTS (SELECT 1 FROM project_milestones WHERE project_id=?2 AND position=(SELECT position${direction==='up'?'-1':'+1'} FROM project_milestones WHERE id=?4)) THEN 'unchanged'`:''}`);
  if(source && (!direction || (target>=0 && target<snapshot.length))) {
    if(direction) [snapshot[index],snapshot[target]]=[snapshot[target],snapshot[index]];
    else snapshot.splice(index,1);
  }
  const queries=[stmt(decide),stmt(bump(decide,success)),
    stmt('DELETE FROM project_milestones WHERE project_id=?2 AND changes()=1 RETURNING id')];
  // A successful parent update always deletes at least the target row; each insert
  // keeps changes()=1. If the guard fails, every subsequent statement stays at zero.
  snapshot.forEach((row,index)=> {
    const changed=direction ? row.id===milestoneId || row.position!==index+1 : row.position!==index+1;
    queries.push(db.prepare(`INSERT INTO project_milestones(id,project_id,title,completed,blocked_note,position,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,${changed?now:'?'} WHERE changes()>0`).bind(row.id,row.project_id,row.title,row.completed,row.blocked_note,index+1,row.created_at,...(changed?[]:[row.updated_at])));
  });
  return mutation(db,queries);
}
export async function move_project_milestone(db:AccessDatabase,hash:string|null,id:string,milestoneId:string|null,version:string,direction:string):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!projectId(milestoneId)||!validVersion(version)||!['up','down'].includes(direction)) return {kind:'invalid'};
  id=id.toLowerCase(); milestoneId=milestoneId.toLowerCase();
  return reorder(db,hash,id,milestoneId,version,direction as 'up'|'down');
}
export async function delete_project_milestone(db:AccessDatabase,hash:string|null,id:string,milestoneId:string|null,version:string):Promise<Kind> {
  if(!validToken(hash)||!projectId(id)||!projectId(milestoneId)||!validVersion(version)) return {kind:'invalid'};
  id=id.toLowerCase(); milestoneId=milestoneId.toLowerCase();
  return reorder(db,hash,id,milestoneId,version,null);
}

const progress=`(SELECT CASE WHEN count(*)=0 THEN NULL ELSE CAST(round(sum(m.completed)*100.0/count(*)) AS INTEGER) END FROM project_milestones m WHERE m.project_id=p.id)`;
const common=`'id',p.id,'title',p.title,'summary',p.summary,'demoUrl',p.demo_url,'nickname',a.nickname,'isOwner',json(CASE WHEN p.owner_account_id=(${member}) THEN 'true' ELSE 'false' END)`;
const states="'publication',p.publication,'connection',p.connection,'moderation',p.moderation,'version',CAST(p.version AS TEXT),'lastCheckedAt',p.last_checked_at";
const visible="p.publication='Published' AND p.connection='Connected' AND p.moderation='Visible'";
export async function projects(db:AccessDatabase,hash:string|null):Promise<Kind & {mine?:Row[];community?:Row[]}> {
  if(!validToken(hash)) return {kind:'forbidden'};
  const result=await db.prepare(`SELECT
    (SELECT json_group_array(json(item)) FROM (SELECT json_object(${common},${states}) item FROM personal_projects p
      JOIN accounts a ON a.internal_id=p.owner_account_id WHERE p.owner_account_id=(${member}) ORDER BY p.created_at,p.id)) mine,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object(${common},'progressPercentage',${progress}) item FROM personal_projects p
      JOIN accounts a ON a.internal_id=p.owner_account_id WHERE ${visible} ORDER BY p.created_at,p.id)) community
    WHERE EXISTS (${member}) OR ${instructor}`).bind(hash).first<{mine:string;community:string}>();
  return result?{kind:'ok',mine:JSON.parse(result.mine) as Row[],community:JSON.parse(result.community) as Row[]}:{kind:'forbidden'};
}
export async function project(db:AccessDatabase,hash:string|null,id:string):Promise<Kind & {project?:Row}> {
  if(!validToken(hash)) return {kind:'forbidden'};
  if(!projectId(id)) return {kind:'missing'};
  id=id.toLowerCase();
  const roadmap=`json_object('milestones',json((SELECT json_group_array(json_object('id',m.id,'title',m.title,'completed',json(CASE WHEN m.completed=1 THEN 'true' ELSE 'false' END),'blockedNote',m.blocked_note)) FROM (SELECT * FROM project_milestones WHERE project_id=p.id ORDER BY position) m)),
    'totalCount',(SELECT count(*) FROM project_milestones WHERE project_id=p.id),'completedCount',(SELECT coalesce(sum(completed),0) FROM project_milestones WHERE project_id=p.id),'percentage',${progress})`;
  const row=await db.prepare(`SELECT CASE WHEN EXISTS (${member}) OR ${instructor} THEN 1 ELSE 0 END authorized,
    (SELECT CASE WHEN ${owner} OR (${instructor} AND p.moderation='Hidden')
      THEN json_object(${common},'roadmapAvailable',json('true'),'roadmap',json(${roadmap}),${states})
      WHEN ${instructor} THEN json_object(${common},'roadmapAvailable',json('true'),'roadmap',json(${roadmap}),'version',CAST(p.version AS TEXT))
      ELSE json_object(${common},'roadmapAvailable',json('true'),'roadmap',json(${roadmap})) END
      FROM personal_projects p JOIN accounts a ON a.internal_id=p.owner_account_id
      WHERE p.id=?2 AND (${owner} OR (${visible}) OR (${instructor} AND p.moderation='Hidden'))) details`)
      .bind(hash,id).first<{authorized:number;details:string|null}>();
  if(!row?.authorized) return {kind:'forbidden'};
  return row.details?{kind:'ok',project:JSON.parse(row.details) as Row}:{kind:'missing'};
}
