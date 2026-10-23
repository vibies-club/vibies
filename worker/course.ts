import type { PageData } from '../frontend/contracts';
import { parseCourse, type CourseManifest } from '../lib/course';
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

/** Course data for /welcome, /course and /course/:n. Access is already checked by the caller. */
export async function coursePage(path: string, data: PageData, env: Env) {
  if (path !== '/welcome' && path !== '/course' && !path.startsWith('/course/')) return;
  const course = await readCourse(env);
  if (!course) return;
  data.course = course;
  const session = path.startsWith('/course/') ? course.sessions.find(item => item.n === Number(path.slice(8))) : undefined;
  if (session) data.session = session;
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
