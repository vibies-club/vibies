import type { PageData } from '../frontend/contracts';
import { gateItemId, parseCourse, type CourseManifest, type GateCheck } from '../lib/course';
import { go, type Env, type Services } from './services';

// ponytail: one manifest per isolate for a minute; a fresh publish shows up within that minute.
const TTL = 60_000;
let cached: { at: number; value: CourseManifest | null } | undefined;

/** The published course, or null when the bucket, the manifest or its shape is missing. Never throws. */
export async function readCourse(env: Env): Promise<CourseManifest | null> {
  if (!env.COURSE) return null;
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  let value: CourseManifest | null = null;
  try {
    const object = await env.COURSE.get('manifest.json');
    if (object && object.size <= 256_000) value = parseCourse(await object.json());
    else await object?.body.cancel();
    if (object && !value) console.error('Course manifest is invalid. The course stays unpublished until it is fixed.');
  } catch {
    console.error('Course manifest could not be read.');
  }
  // Failures are cached too, so a broken manifest or a storage outage costs one read per isolate per minute.
  cached = { at: Date.now(), value };
  return value;
}

function gateCheck(value: any): GateCheck {
  if (!value || !Number.isInteger(value.sessionNo) || value.sessionNo < 1 || value.sessionNo > 30 || !gateItemId(value.itemId) ||
    !['done', 'needs_work'].includes(value.state) || !(value.proofUrl === null || typeof value.proofUrl === 'string') ||
    !(value.note === null || typeof value.note === 'string')) throw new Error('Unavailable');
  return { sessionNo: value.sessionNo, itemId: value.itemId, state: value.state, proofUrl: value.proofUrl, note: value.note };
}

/** Course and gate data for /welcome, /course, /course/:n and /admin/gates. Access and role redirects are already checked by the caller. */
export async function coursePage(path: string, data: PageData, env: Env, s: Services, hash: string | null) {
  if (path !== '/welcome' && path !== '/course' && path !== '/admin/gates' && !path.startsWith('/course/')) return;
  const course = await readCourse(env);
  if (!course) return;
  data.course = course;
  const session = path.startsWith('/course/') ? course.sessions.find(item => item.n === Number(path.slice(8))) : undefined;
  if (session) data.session = session;
  if (path === '/admin/gates') {
    // A failed board read fails the page: the Instructor should never act on a partial grid.
    const v = await s.domainOperation('gates_board', hash);
    if (v.kind !== 'ok' || !Array.isArray(v.members)) throw new Error('Unavailable');
    data.gateBoard = { members: v.members.map((m: any) => {
      if (!m || typeof m.nickname !== 'string' || !Array.isArray(m.checks)) throw new Error('Unavailable');
      return { nickname: m.nickname, checks: m.checks.map(gateCheck) };
    }) };
  } else if (data.access.kind === 'member') {
    // Gate state is extra: without it the pages show the checklist without buttons.
    try {
      const v = await s.domainOperation('gates_mine', hash);
      if (v.kind === 'ok' && Array.isArray(v.mine)) data.gates = { mine: v.mine.map(gateCheck) };
    } catch { delete data.gates; }
  }
}

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Slides and prompts for members and the Instructor, only for files the manifest lists. */
export async function courseFile(request: Request, s: Services, env: Env, path: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  const access = await s.accessState();
  if (access.kind === 'error') return text('The course is unavailable right now. Please try again shortly.', 503);
  if (access.kind === 'signed_out') {
    const response = go('/sign-in?message=expired');
    s.setCookie(response, 'return', encodeURIComponent('/course'), 600);
    return response;
  }
  if (access.kind === 'denied') return text('The course is for approved members.', 403);
  const match = /^\/course-files\/(decks|prompts)\/([a-z0-9-]{1,80}\.(?:html|md))$/.exec(path);
  const course = await readCourse(env);
  const listed = match && course?.sessions.some(session => match[1] === 'decks' ? session.deck === match[2] : session.prompts.some(prompt => prompt.file === match[2]));
  if (!listed || !env.COURSE) return text('Slides are not published yet.', 404);
  const key = `${match[1]}/${match[2]}`;
  const object = request.method === 'HEAD' ? await env.COURSE.head(key) : await env.COURSE.get(key);
  if (!object) return text('Slides are not published yet.', 404);
  return new Response(request.method === 'HEAD' ? null : (object as R2ObjectBody).body, { headers: {
    // Prompts are shown as plain text so a prompt file can never run as a page.
    'Content-Type': match[1] === 'decks' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', Vary: 'Cookie',
  } });
}
