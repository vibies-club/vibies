import { DurableObject } from 'cloudflare:workers';
import { digest, validToken } from '../lib/access-core';
import { createGoogleRoutes } from '../lib/google-auth/http';
import type { GoogleAuthConfig } from '../lib/google-auth/better-auth';
import { cancelGoogleLink } from '../lib/google-auth/store';
import { clearGoogleCookies, grantCookie } from '../lib/google-auth/cookies';
import { readOnlyResponse } from '../lib/read-only';
import { createServices, go, privatePath, safeError, type Env, type Services } from './services';

type Attempt = { phase: 'pending' | 'processing' | 'terminal'; state_hash: string | null;
  expires_at: number; grant_hash: string | null };
const callbackPath = '/auth/google/provider/callback/google';
const methods: Record<string, string> = { '/auth/google/start': 'POST', '/auth/google/link': 'POST',
  [callbackPath]: 'GET', '/auth/sign-out': 'POST' };

/** One browser's OAuth lifecycle. D1 remains the authority for identities and sessions. */
export class GoogleCoordinator extends DurableObject<Env> {
  #queue: Promise<void> = Promise.resolve();
  #ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#ready = ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS oauth_attempt (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        phase TEXT NOT NULL CHECK(phase IN ('pending','processing','terminal')),
        state_hash TEXT, expires_at INTEGER NOT NULL, grant_hash TEXT
      );
      INSERT OR IGNORE INTO oauth_attempt VALUES(1,'terminal',NULL,0,NULL);
      CREATE TABLE IF NOT EXISTS grant_cancellations (grant_hash TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS issued_sessions (
        session_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, revoke INTEGER NOT NULL
      )`);
    });
  }

  async handle(request: Request): Promise<Response> {
    // RPC is private, but repeat every boundary check before joining the queue.
    const url = new URL(request.url);
    const method = methods[url.pathname];
    if (!method) return safeError(404);
    if (request.method !== method) return new Response('Method not allowed', { status: 405, headers: { Allow: method } });
    const services = createServices(request, this.env);
    if (url.origin !== services.origin || (method === 'POST' && !services.allowedPost(request))) return safeError(403);
    const browser = services.jar.get(services.name('browser'));
    if (!validToken(browser) || !this.env.GOOGLE_COORDINATOR ||
      !this.ctx.id.equals(this.env.GOOGLE_COORDINATOR.idFromName(digest(browser)))) return safeError(403);
    const result = this.#queue.then(async () => {
      await this.#ready;
      return this.#handle(request, services);
    });
    this.#queue = result.then(() => {}, () => {});
    return result;
  }

  #attempt(): Attempt {
    return this.ctx.storage.sql.exec<Attempt>('SELECT phase,state_hash,expires_at,grant_hash FROM oauth_attempt WHERE singleton=1').one();
  }

  #terminal() {
    this.ctx.storage.sql.exec("UPDATE oauth_attempt SET phase='terminal' WHERE singleton=1");
  }

  #failure(request: Request, services: Services) {
    const response = go(validToken(services.jar.get(grantCookie(services.secure))) ? '/welcome?google=failed' : '/sign-in?message=failed');
    clearGoogleCookies(request, response, services.secure);
    return response;
  }

  async #cleanup(services: Services) {
    const db = await services.database();
    for (const row of this.ctx.storage.sql.exec<{ grant_hash: string }>('SELECT grant_hash FROM grant_cancellations').toArray()) {
      await cancelGoogleLink(db, row.grant_hash);
      this.ctx.storage.sql.exec('DELETE FROM grant_cancellations WHERE grant_hash=?', row.grant_hash);
      this.ctx.storage.sql.exec('UPDATE oauth_attempt SET grant_hash=NULL WHERE singleton=1 AND grant_hash=?', row.grant_hash);
    }
    for (const row of this.ctx.storage.sql.exec<{ session_hash: string }>('SELECT session_hash FROM issued_sessions WHERE revoke=1').toArray()) {
      await services.domainOperation('end_session', row.session_hash);
      this.ctx.storage.sql.exec('DELETE FROM issued_sessions WHERE session_hash=?', row.session_hash);
    }
    this.ctx.storage.sql.exec('DELETE FROM issued_sessions WHERE expires_at<=?', Date.now());
  }

  async #handle(request: Request, services: Services): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/auth/sign-out') return this.#signOut(request, services);
    if (services.readOnly) return readOnlyResponse();
    if (!services.googleEnabled) return go('/sign-in?message=unavailable');
    let candidateSession: string | undefined;
    try {
      const db = await services.database();
      const attempt = this.#attempt();
      // A crashed exchange is ambiguous: clean up and require a fresh start.
      if (attempt.phase === 'processing' || (attempt.phase === 'pending' && attempt.expires_at <= Date.now())) this.#terminal();
      if (this.#attempt().phase === 'terminal') await this.#cleanup(services);
      let destination = '/welcome';
      try { destination = privatePath(decodeURIComponent(services.jar.get(services.name('return')) ?? '')) ?? '/welcome'; } catch {}
      const routes = createGoogleRoutes({ store: db, database: db as GoogleAuthConfig['database'], origin: services.origin,
        clientId: this.env.VIBIES_GOOGLE_CLIENT_ID!, clientSecret: this.env.VIBIES_GOOGLE_CLIENT_SECRET!,
        secret: this.env.VIBIES_GOOGLE_AUTH_SECRET!, sessionCookie: services.name('session'), browserCookie: services.name('browser'),
        readOnly: services.readOnly, loginDestination: destination,
        recordGrantHash: async hash => {
          this.ctx.storage.sql.exec('UPDATE oauth_attempt SET grant_hash=? WHERE singleton=1', hash);
          this.ctx.storage.sql.exec('INSERT OR IGNORE INTO grant_cancellations VALUES(?)', hash);
          await this.ctx.storage.sync();
        },
        recordSessionHash: async hash => {
          candidateSession = hash;
          this.ctx.storage.sql.exec('INSERT INTO issued_sessions VALUES(?,?,1)', hash, Date.now() + 86_400_000);
          await this.ctx.storage.sync();
        },
      });
      if (path !== callbackPath) {
        if (this.#attempt().phase === 'pending') return go('/sign-in?message=limited');
        this.ctx.storage.sql.exec("UPDATE oauth_attempt SET phase='processing',state_hash=NULL,expires_at=? WHERE singleton=1", Date.now() + 300_000);
        await this.ctx.storage.sync();
        const result = await (path === '/auth/google/link' ? routes.link(request) : routes.start(request));
        const target = new URL(result.headers.get('location') ?? '/', services.origin);
        const state = target.searchParams.get('state');
        if (target.origin !== 'https://accounts.google.com' || !state || state.length > 512) {
          this.#terminal();
          await this.#cleanup(services);
          return result;
        }
        this.ctx.storage.sql.exec("UPDATE oauth_attempt SET phase='pending',state_hash=? WHERE singleton=1", digest(state));
        return result;
      }
      const states = new URL(request.url).searchParams.getAll('state');
      const current = this.#attempt();
      if (current.phase !== 'pending' || states.length !== 1 || !states[0] || states[0].length > 512 ||
        digest(states[0]) !== current.state_hash || current.expires_at <= Date.now()) return this.#failure(request, services);
      this.ctx.storage.sql.exec("UPDATE oauth_attempt SET phase='processing' WHERE singleton=1");
      await this.ctx.storage.sync();
      const result = await routes.callback(request);
      // Only a returned Vibies session cookie confirms the candidate was issued.
      if (candidateSession && result.headers.getSetCookie().some(value => value.startsWith(`${services.name('session')}=`) && !value.startsWith(`${services.name('session')}=;`)))
        this.ctx.storage.sql.exec('UPDATE issued_sessions SET revoke=0 WHERE session_hash=?', candidateSession);
      this.#terminal();
      await this.#cleanup(services);
      if (result.headers.get('location') === destination) services.setCookie(result, 'return', '', 0);
      return result;
    } catch {
      this.#terminal();
      if (candidateSession) this.ctx.storage.sql.exec('UPDATE issued_sessions SET revoke=1 WHERE session_hash=?', candidateSession);
      // Recovery metadata is retained if D1 is unavailable. No exchange retries.
      await this.#cleanup(services).catch(() => {});
      return this.#failure(request, services);
    }
  }

  async #signOut(request: Request, services: Services): Promise<Response> {
    const response = go('/');
    try {
      if (!services.readOnly) {
        this.#terminal();
        this.ctx.storage.sql.exec('UPDATE issued_sessions SET revoke=1');
        const session = services.jar.get(services.name('session'));
        if (validToken(session)) this.ctx.storage.sql.exec(`INSERT INTO issued_sessions VALUES(?,?,1)
          ON CONFLICT(session_hash) DO UPDATE SET revoke=1,expires_at=MAX(expires_at,excluded.expires_at)`, digest(session), Date.now() + 86_400_000);
        const grant = services.jar.get(grantCookie(services.secure));
        if (validToken(grant)) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO grant_cancellations VALUES(?)', digest(grant));
        await this.ctx.storage.sync();
        await this.#cleanup(services);

      }
    } catch {} finally {
      services.setCookie(response, 'session', '', 0);
      services.setCookie(response, 'oauth', '', 0);
      services.setCookie(response, 'return', '', 0);
      clearGoogleCookies(request, response, services.secure);
    }
    return response;
  }
}
