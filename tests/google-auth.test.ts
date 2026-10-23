import assert from "node:assert/strict";
import { digest } from "../lib/access-core.ts";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import { createGoogleAuth, googleAuthForRequest, googleCallbackHandler, GOOGLE_AUTH_PATH } from "../lib/google-auth/better-auth.ts";
import { createGoogleRoutes, grantCookie } from "../lib/google-auth/http.ts";
import { beginGoogleLink, googleLinkGrant, finishGoogleSignIn } from "../lib/google-auth/store.ts";
import type { AccessDatabase, D1Statement, D1Result } from "../lib/d1/access.ts";

const hash = (n: number) => n.toString(16).padStart(64, "0");
class Statement implements D1Statement {
  readonly db: DatabaseSync; readonly sql: string; readonly args: SQLInputValue[];
  constructor(db: DatabaseSync, sql: string, args: SQLInputValue[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args: unknown[]) { return new Statement(this.db, this.sql, args as SQLInputValue[]); }
  execute<T>(): D1Result<T> & { meta: { changes: number; last_row_id: number } } {
    const statement = this.db.prepare(this.sql);
    const results = statement.columns().length ? statement.all(...this.args) as T[] : (statement.run(...this.args), []);
    const meta = this.db.prepare("SELECT changes() changes,last_insert_rowid() last_row_id").get() as { changes: number; last_row_id: number };
    return { success: true, results, meta };
  }
  async all<T>() { return this.execute<T>(); }
  async first<T>() { return this.execute<T>().results[0] ?? null; }
  async run() { return this.execute<Record<string, unknown>>(); }
}
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of ["0001_application.sql", "0003_google.sql"])
    sqlite.exec(readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), "utf8"));
  sqlite.exec(`UPDATE community SET instructor_github_id='1',instructor_nickname='Tutor',instructor_nickname_key='tutor';
    INSERT INTO accounts(internal_id,github_id,github_username,nickname,nickname_key,status) VALUES('member','2','builder','Builder','builder','approved');`);
  for (const [n, id, provider] of [[1,"1","github"],[2,"2","github"],[3,"2","google"],[4,"2","legacy"]])
    sqlite.prepare("INSERT INTO sessions(session_hash,github_id,auth_provider) VALUES(?,?,?)").run(hash(n as number), id as string, provider as string);
  const queries: string[] = [];
  const db = {
    prepare: (sql: string) => { queries.push(sql); return new Statement(sqlite, sql); },
    async exec(sql: string) { sqlite.exec(sql); },
    async batch<T>(statements: D1Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try { const results = statements.map((s) => (s as Statement).execute<T>()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const auth = (link?: { grantHash: string; sessionHash: string }) => createGoogleAuth({ database: db, store: db,
    origin: "https://vibies.test", secret: "synthetic-test-secret-with-at-least-32-characters", clientId: "synthetic-client",
    clientSecret: "synthetic-secret", link });
  return { db, sqlite, auth, queries };
}

test("Google link grants require recent GitHub approval and serialize competing starts", async () => {
  const { db, sqlite } = fixture();
  try {
    assert.equal(await beginGoogleLink(db, hash(3), hash(20)), null);
    assert.equal(await beginGoogleLink(db, hash(4), hash(20)), null);
    const starts = await Promise.all([beginGoogleLink(db, hash(2), hash(20)), beginGoogleLink(db, hash(2), hash(21))]);
    assert.equal(starts.filter(Boolean).length, 1);
    assert.equal(await googleLinkGrant(db, hash(20), hash(1)), null);
    sqlite.exec("UPDATE accounts SET status='revoked'");
    assert.equal(await googleLinkGrant(db, hash(20), hash(2)), null);
    sqlite.exec("UPDATE accounts SET status='approved'; UPDATE sessions SET created_at=datetime('now','-6 minutes')");
    assert.equal(await googleLinkGrant(db, hash(20), hash(2)), null);
  } finally { sqlite.close(); }
});

test("Better Auth pinned D1 adapter strips tokens and profile and atomically consumes one link", async () => {
  const { db, sqlite, auth } = fixture();
  try {
    const userId = (await beginGoogleLink(db, hash(2), hash(20)))!;
    const instance = await auth({ grantHash: hash(20), sessionHash: hash(2) });
    const context = await instance.$context;
    const account = await context.internalAdapter.createAccount({ userId, providerId: "google", accountId: "synthetic-google-sub",
      accessToken: "must-not-persist", refreshToken: "must-not-persist", idToken: "must-not-persist", scope: "email profile", password: "must-not-persist" });
    assert.ok(account);
    const stored = sqlite.prepare("SELECT * FROM google_accounts").get()!;
    for (const field of ["accessToken", "refreshToken", "idToken", "scope", "password", "accessTokenExpiresAt", "refreshTokenExpiresAt"])
      assert.equal(stored[field], null, field);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM google_link_grants").get()!.n, 0);
    assert.equal(await context.internalAdapter.createAccount({ userId, providerId: "google", accountId: "other-sub" }), null);
    const user = sqlite.prepare("SELECT * FROM google_users").get()!;
    assert.equal(user.email, `${userId}@vibies.invalid`); assert.equal(user.name, "Member"); assert.equal(user.image, null);
  } finally { sqlite.close(); }
});

test("Revocation or wrong owner at insertion denies linking even after bridge creation", async () => {
  const { db, sqlite, auth } = fixture();
  try {
    const userId = (await beginGoogleLink(db, hash(2), hash(20)))!;
    const context = await (await auth({ grantHash: hash(20), sessionHash: hash(2) })).$context;
    assert.equal(await context.internalAdapter.createAccount({ userId: hash(99), providerId: "google", accountId: "other-sub" }), null);
    sqlite.exec("UPDATE accounts SET status='revoked'");
    assert.equal(await context.internalAdapter.createAccount({ userId, providerId: "google", accountId: "sub" }), null);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM google_accounts").get()!.n, 0);
  } finally { sqlite.close(); }
});

test("Server-only bridge sets protected short-lived cookie; public management paths are denied", async () => {
  const { db, sqlite, auth } = fixture();
  try {
    await beginGoogleLink(db, hash(2), hash(20));
    const instance = await auth({ grantHash: hash(20), sessionHash: hash(2) });
    const response = await instance.api.githubBridge({ method: "POST", headers: new Headers({ origin: "https://vibies.test", "user-agent": "must-not-persist" }), asResponse: true });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Max-Age=300/i);
    const session = sqlite.prepare("SELECT * FROM google_sessions").get()!;
    assert.equal(session.ipAddress, null); assert.equal(session.userAgent, null);
    for (const path of ["/github-bridge", "/link-social", "/sign-up/email", "/sign-in/social", "/unlink-account", "/update-user", "/change-email", "/get-access-token", "/refresh-token"])
      assert.equal((await googleCallbackHandler(instance, new Request(`https://vibies.test${GOOGLE_AUTH_PATH}${path}`, { method: "POST" }))).status, 404);
    assert.equal((await instance.handler(new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/github-bridge`, { method: "POST" }))).status, 404);
  } finally { sqlite.close(); }
});

test("Google login bridges only linked currently approved identity, once, without account upsert", async () => {
  const { db, sqlite, auth } = fixture();
  try {
    const userId = (await beginGoogleLink(db, hash(2), hash(20)))!;
    const context = await (await auth({ grantHash: hash(20), sessionHash: hash(2) })).$context;
    await context.internalAdapter.createAccount({ userId, providerId: "google", accountId: "sub" });
    const session = await context.internalAdapter.createSession(userId);
    assert.equal(await finishGoogleSignIn(db, userId, hash(30), session.token), true);
    assert.equal(await finishGoogleSignIn(db, userId, hash(31), session.token), false);
    assert.equal(sqlite.prepare("SELECT auth_provider FROM sessions WHERE session_hash=?").get(hash(30))!.auth_provider, "google");
    const revoked = await context.internalAdapter.createSession(userId);
    sqlite.exec("UPDATE accounts SET status='revoked'");
    assert.equal(await finishGoogleSignIn(db, userId, hash(32), revoked.token), false);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM accounts").get()!.n, 1);
  } finally { sqlite.close(); }
});

function mergeCookies(previous: string, response: Response) {
  const cookies = new Map(previous.split('; ').filter(Boolean).map((item) => { const split = item.indexOf('='); return [item.slice(0,split),item.slice(split+1)]; }));
  for (const value of response.headers.getSetCookie()) {
    const item = value.split(';')[0]; const split = item.indexOf('=');
    cookies.set(item.slice(0,split), item.slice(split+1));
  }
  return [...cookies].map(([key,value]) => `${key}=${value}`).join('; ');
}
const syntheticJwt = () => [
  { alg: 'RS256', kid: 'synthetic' },
  { sub: 'synthetic-google-sub', name: 'PRIVATE-PROFILE-NAME', email: 'private-profile@example.com',
    picture: 'https://example.com/private-photo', email_verified: true, aud: 'synthetic-client',
    iss: 'https://accounts.google.com', exp: Math.floor(Date.now()/1000)+300, iat: Math.floor(Date.now()/1000) },
].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')+'.synthetic';

test("Real Better Auth Google callback links, signs in, rejects replay and unlinked identities without retaining profiles", async () => {
  const { db, sqlite, auth } = fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    return Response.json({ access_token: 'PRIVATE-ACCESS-TOKEN', refresh_token: 'PRIVATE-REFRESH-TOKEN',
      id_token: syntheticJwt(), token_type: 'Bearer', expires_in: 3600, scope: 'openid email profile' });
  };
  try {
    const userId = (await beginGoogleLink(db, hash(2), hash(20)))!;
    const instance = await auth({ grantHash: hash(20), sessionHash: hash(2) });
    const bridge = await instance.api.githubBridge({ method: 'POST', asResponse: true });
    let cookie = mergeCookies('', bridge);
    const headers = () => new Headers({ origin: 'https://vibies.test', cookie });
    const start = await instance.api.linkSocialAccount({ headers: headers(), body: { provider: 'google',
      callbackURL: 'https://vibies.test/auth/google/complete', errorCallbackURL: 'https://vibies.test/sign-in', disableRedirect: true }, asResponse: true });
    assert.equal(start.status, 200);
    cookie = mergeCookies(cookie, start);
    const authorizationUrl = new URL((await start.json() as { url: string }).url);
    const callbackUrl = `https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=synthetic-code&state=${authorizationUrl.searchParams.get('state')}`;
    const callback = await googleCallbackHandler(instance, new Request(callbackUrl, { headers: headers() }));
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), 'https://vibies.test/auth/google/complete');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_accounts').get()!.n, 1);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n, 0);
    const replay = await googleCallbackHandler(instance, new Request(callbackUrl, { headers: headers() }));
    assert.match(replay.headers.get('location')!, /error=/);

    // The normal Google login path resolves the existing stable subject and mints a short bridge.
    const loginAuth = await auth();
    const login = await loginAuth.api.signInSocial({ body: { provider: 'google', callbackURL: 'https://vibies.test/auth/google/complete', disableRedirect: true }, asResponse: true });
    cookie = mergeCookies('', login);
    const loginUrl = new URL((await login.json() as { url: string }).url);
    const loggedIn = await googleCallbackHandler(loginAuth, new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=synthetic&state=${loginUrl.searchParams.get('state')}`, { headers: headers() }));
    assert.equal(loggedIn.headers.get('location'), 'https://vibies.test/auth/google/complete');
    const bridgeSession = sqlite.prepare('SELECT * FROM google_sessions').get()!;
    assert.equal(await finishGoogleSignIn(db, userId, hash(90), bridgeSession.token as string), true);
    const dump = ['google_users','google_accounts','google_sessions','google_verifications'].map((table) => JSON.stringify(sqlite.prepare(`SELECT * FROM ${table}`).all())).join('');
    for (const sensitive of ['PRIVATE-', 'private-profile@example.com', 'private-photo']) assert.ok(!dump.includes(sensitive), sensitive);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test("Database guard rejects bypass, expiration and reassignment independently of Better Auth hooks", async () => {
  const { db, sqlite, auth } = fixture();
  try {
    const userId = (await beginGoogleLink(db, hash(2), hash(20)))!;
    const insert = () => sqlite.prepare(`INSERT INTO google_accounts(id,userId,accountId,providerId,authorizationHash,createdAt,updatedAt)
      VALUES('bypass',?,'sub','google',?,datetime('now'),datetime('now'))`).run(userId,hash(20));
    sqlite.exec("UPDATE accounts SET status='revoked'");
    assert.throws(insert, /google_link_forbidden/);
    sqlite.exec("UPDATE accounts SET status='approved'; UPDATE google_link_grants SET expires_at=0");
    assert.throws(insert, /google_link_forbidden/);
    sqlite.exec("DELETE FROM google_link_grants");
    await beginGoogleLink(db, hash(2), hash(21));
    const context = await (await auth({ grantHash: hash(21), sessionHash: hash(2) })).$context;
    await context.internalAdapter.createAccount({ userId, providerId:'google', accountId:'sub' });
    assert.throws(() => sqlite.prepare("UPDATE google_accounts SET accountId='replacement'").run(), /google_link_immutable/);
    assert.equal(await context.internalAdapter.createUser({ name:'PRIVATE-NAME', email:'private@example.com' }, { method:'credential' }), null);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_users').get()!.n, 1);
  } finally { sqlite.close(); }
});

test("Unlinked Google callback cannot sign up or create a Vibies account", async () => {
  const { sqlite, auth } = fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ access_token:'private-token', id_token:syntheticJwt(), token_type:'Bearer', expires_in:3600 });
  try {
    const instance = await auth();
    const start = await instance.api.signInSocial({ body:{provider:'google',callbackURL:'https://vibies.test/auth/google/complete',disableRedirect:true},asResponse:true });
    const url = new URL((await start.json() as { url: string }).url);
    const callback = await googleCallbackHandler(instance, new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=test&state=${url.searchParams.get('state')}`,{headers:{cookie:mergeCookies('',start)}}));
    assert.match(callback.headers.get('location')!, /signup_disabled/);
    for (const table of ['google_users','google_accounts','google_sessions'])
      assert.equal(sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM accounts').get()!.n,1);
  } finally {globalThis.fetch=originalFetch;sqlite.close();}
});

function httpFixture() {
  const data=fixture();
  for (const n of [1,2,3,4]) data.sqlite.prepare('UPDATE sessions SET session_hash=? WHERE session_hash=?').run(digest(hash(n)),hash(n));
  const routes=createGoogleRoutes({database:data.db,store:data.db,origin:'https://vibies.test',
    secret:'synthetic-test-secret-with-at-least-32-characters',clientId:'synthetic-client',clientSecret:'synthetic-secret',
    sessionCookie:'vibies-session',browserCookie:'vibies-browser'});
  const post=(path:string,extra='')=>new Request(`https://vibies.test/auth/google/${path}`,{method:'POST',headers:{
    origin:'https://vibies.test','content-type':'application/x-www-form-urlencoded',cookie:`vibies-browser=${hash(70)}; ${extra}`}});
  return {...data,routes,post};
}

test('Google HTTP routes enforce same-origin POST and reuse the shared browser throttle', async()=>{
  const {sqlite,routes,post}=httpFixture();
  try {
    assert.equal((await routes.start(new Request('https://vibies.test/auth/google/start'))).status,403);
    assert.equal((await routes.link(new Request('https://vibies.test/auth/google/link',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/x-www-form-urlencoded'}}))).status,403);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sign_in_attempts').get()!.n,0);
    for(let i=0;i<10;i++) assert.equal(new URL((await routes.start(post('start'))).headers.get('location')!).origin,'https://accounts.google.com');
    assert.equal((await routes.start(post('start'))).headers.get('location'),'/sign-in?message=limited');
  } finally {sqlite.close();}
});

test('Google HTTP orchestration links and logs in without exposing generic Better Auth APIs', async()=>{
  const {sqlite,routes,post}=httpFixture();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({access_token:'private-token',refresh_token:'private-refresh',id_token:syntheticJwt(),token_type:'Bearer',expires_in:3600});
  try {
    const start=await routes.link(post('link',`vibies-session=${hash(2)}`));
    const authorize=new URL(start.headers.get('location')!);
    assert.equal(authorize.origin,'https://accounts.google.com');
    let jar=mergeCookies(`vibies-session=${hash(2)}; vibies-browser=${hash(70)}`,start);
    const callback=await routes.callback(new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=fixture&state=${authorize.searchParams.get('state')}`,{headers:{cookie:jar}}));
    assert.equal(callback.headers.get('location'),'/welcome?google=linked');
    assert.ok(callback.headers.getSetCookie().some(c=>c.startsWith(`${grantCookie(true)}=;`) && c.includes('Max-Age=0')));
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions').get()!.n,4);
    const login=await routes.start(post('start'));
    const loginUrl=new URL(login.headers.get('location')!);
    jar=mergeCookies(`vibies-browser=${hash(70)}`,login);
    const result=await routes.callback(new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=fixture&state=${loginUrl.searchParams.get('state')}`,{headers:{cookie:jar}}));
    assert.equal(result.headers.get('location'),'/welcome');
    assert.ok(result.headers.getSetCookie().some(c=>c.startsWith('vibies-session=') && c.includes('Max-Age=86400')));
    assert.equal(sqlite.prepare("SELECT count(*) n FROM sessions WHERE auth_provider='google'").get()!.n,2);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n,0);
  } finally {globalThis.fetch=originalFetch;sqlite.close();}
});

test('Google HTTP callback denies revoked membership and sign-out removes pending bridge sessions',async()=>{
  const {sqlite,routes,post}=httpFixture(); const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({access_token:'private-token',id_token:syntheticJwt(),token_type:'Bearer',expires_in:3600});
  try {
    const started=await routes.link(post('link',`vibies-session=${hash(2)}`));
    const url=new URL(started.headers.get('location')!);
    const jar=mergeCookies(`vibies-session=${hash(2)}`,started);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n,1);
    const signedOut=new Response();
    await routes.signOut(new Request('https://vibies.test/auth/sign-out',{headers:{cookie:jar}}),signedOut);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_link_grants').get()!.n,0);
    assert.ok(signedOut.headers.getSetCookie().some(c=>c.startsWith(`${grantCookie(true)}=;`)));
    const retry=await routes.link(post('link',`vibies-session=${hash(2)}`));
    const retryUrl=new URL(retry.headers.get('location')!);
    sqlite.exec("UPDATE accounts SET status='revoked'");
    const denied=await routes.callback(new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=test&state=${retryUrl.searchParams.get('state')}`,{headers:{cookie:mergeCookies(`vibies-session=${hash(2)}`,retry)}}));
    assert.equal(denied.headers.get('location'),'/welcome?google=failed');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_accounts').get()!.n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_link_grants').get()!.n,0);
  } finally {globalThis.fetch=originalFetch;sqlite.close();}
});

test('Google migration applies as separate Wrangler SQL statements with every trigger intact', async () => {
  const { unstable_splitSqlQuery } = await import('wrangler');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../d1/migrations/0001_application.sql', import.meta.url), 'utf8'));
    const migration = readFileSync(new URL('../d1/migrations/0003_google.sql', import.meta.url), 'utf8');
    for (const statement of unstable_splitSqlQuery(migration)) sqlite.exec(statement);
    const triggers = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'google_%' ORDER BY name").all();
    assert.deepEqual(triggers.map(row => row.name), ['google_account_authorize', 'google_account_consume',
      'google_account_immutable', 'google_grant_expiry', 'google_identity_immutable']);
  } finally { sqlite.close(); }
});


test('Unlinked Google HTTP callback explains linking without creating an account', async()=>{
  const {sqlite,routes,post}=httpFixture(); const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({access_token:'private-token',id_token:syntheticJwt(),token_type:'Bearer',expires_in:3600});
  try {
    const start=await routes.start(post('start'));
    const url=new URL(start.headers.get('location')!);
    const result=await routes.callback(new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google?code=fixture&state=${url.searchParams.get('state')}`,{headers:{cookie:mergeCookies(`vibies-browser=${hash(70)}`,start)}}));
    assert.equal(result.headers.get('location'),'/sign-in?message=googlelink');
    for(const table of ['google_users','google_accounts','google_sessions']) assert.equal(sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0);
  } finally {globalThis.fetch=originalFetch;sqlite.close();}
});

test('pinned Google schema passes explicit validation and detects a missing table', async () => {
  const { sqlite, auth } = fixture();
  try {
    const context = await (await auth()).$context;
    assert.equal(typeof context.explicitSchemaCheck, 'function');
    await context.explicitSchemaCheck!();
    sqlite.exec('ALTER TABLE google_verifications RENAME TO missing_google_verifications');
    // Use a fresh check so the earlier successful result cannot mask schema drift.
    const broken = await (await auth()).$context;
    await assert.rejects(async () => { await broken.explicitSchemaCheck!(); }, /google_verifications/);
  } finally { sqlite.close(); }
});

test('request-local Google auth skips schema metadata queries across repeated operations', async () => {
  const { sqlite, routes, post, queries } = httpFixture();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = await routes.start(post('start'));
      assert.equal(new URL(started.headers.get('location')!).origin, 'https://accounts.google.com');
      await routes.signOut(new Request('https://vibies.test/auth/sign-out'), new Response());
    }
    assert.ok(queries.some(sql => /google_verifications/i.test(sql)));
    assert.deepEqual(queries.filter(sql => /sqlite_(?:master|schema)|pragma/i.test(sql)), []);
  } finally { sqlite.close(); }
});

test('Google initiation fails closed when its verification schema is missing', async () => {
  const { sqlite, routes, post } = httpFixture();
  try {
    sqlite.exec('ALTER TABLE google_verifications RENAME TO missing_google_verifications');
    const response = await routes.start(post('start'));
    assert.equal(response.headers.get('location'), '/sign-in?message=failed');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n, 0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions').get()!.n, 4);
    assert.ok(!response.headers.getSetCookie().some(value => /^vibies-session=[^;]/.test(value)));
  } finally { sqlite.close(); }
});

test('grant-free auth cache matches every configuration field and never caches grants', async () => {
  const first = fixture(); const second = fixture();
  const config = { database: first.db, store: first.db, origin: 'https://vibies.test',
    secret: 'synthetic-test-secret-with-at-least-32-characters', clientId: 'synthetic-client', clientSecret: 'synthetic-secret' };
  try {
    for (const changed of [
      { database: second.db }, { store: second.db }, { origin: 'https://other.test' },
      { secret: 'different-synthetic-secret-with-at-least-32-characters' },
      { clientId: 'different-client' }, { clientSecret: 'different-secret' },
    ]) {
      const original = googleAuthForRequest(config);
      assert.equal(googleAuthForRequest({ ...config }), original);
      const different = googleAuthForRequest({ ...config, ...changed });
      assert.notEqual(different, original);
      await (await different).$context;
    }
    const original = googleAuthForRequest(config);
    const linked = { ...config, link: { grantHash: hash(20), sessionHash: hash(2) } };
    const a = googleAuthForRequest(linked); const b = googleAuthForRequest(linked);
    assert.notEqual(a, b);
    assert.notEqual(a, original);
    assert.equal(googleAuthForRequest(config), original);
    // A caller changing its object later cannot turn a cached instance into a grant-bearing one.
    const mutable: typeof linked | typeof config = { ...config };
    const snapshotted = googleAuthForRequest(mutable);
    Object.assign(mutable, { link: linked.link, origin: 'https://changed.test' });
    await assert.rejects(async () => (await snapshotted).api.githubBridge({ method: 'POST', headers: new Headers() }));
    assert.equal((await (await snapshotted).$context).baseURL, 'https://vibies.test/auth/google/provider');
    const [contextA, contextB] = await Promise.all([a, b].map(async instance => (await instance).$context));
    assert.notEqual(contextA.adapter, contextB.adapter);
  } finally { first.sqlite.close(); second.sqlite.close(); }
});

test('shared grant-free auth isolates concurrent cookies, databases and link authorization', async () => {
  const first = fixture(); const second = fixture();
  const config = { database: first.db, store: first.db, origin: 'https://vibies.test',
    secret: 'synthetic-test-secret-with-at-least-32-characters', clientId: 'synthetic-client', clientSecret: 'synthetic-secret' };
  try {
    const ownerA = await beginGoogleLink(first.db, hash(1), hash(20));
    const ownerB = await beginGoogleLink(first.db, hash(2), hash(21));
    const bridge = async (grantHash: string, sessionHash: string) => (await googleAuthForRequest({ ...config,
      link: { grantHash, sessionHash } })).api.githubBridge({ method: 'POST', headers: new Headers(), asResponse: true });
    const [bridgeA, bridgeB] = await Promise.all([bridge(hash(20), hash(1)), bridge(hash(21), hash(2))]);
    const headersA = new Headers({ cookie: mergeCookies('', bridgeA) });
    const headersB = new Headers({ cookie: mergeCookies('', bridgeB) });
    const shared = await googleAuthForRequest(config);
    const other = await googleAuthForRequest({ ...config, database: second.db, store: second.db });
    const [sessionA, sessionB, anonymous, otherEnvironment] = await Promise.all([
      shared.api.getSession({ headers: headersA }), shared.api.getSession({ headers: headersB }),
      shared.api.getSession({ headers: new Headers() }), other.api.getSession({ headers: headersA }),
    ]);
    assert.equal(sessionA?.user.id, ownerA);
    assert.equal(sessionB?.user.id, ownerB);
    assert.notEqual(sessionA?.session.token, sessionB?.session.token);
    assert.equal(anonymous, null); assert.equal(otherEnvironment, null);
    await Promise.all([headersA, headersB].map(headers => assert.rejects(() =>
      shared.api.githubBridge({ method: 'POST', headers }))));
    assert.equal((await shared.$context).session, null);
    assert.equal((await shared.$context).newSession, null);
    assert.equal(second.sqlite.prepare('SELECT count(*) n FROM google_sessions').get()!.n, 0);
  } finally { first.sqlite.close(); second.sqlite.close(); }
});


test('failed database preparation clears caches and callback still clears OAuth cookies', async () => {
  const { db, sqlite } = fixture();
  const database = {} as typeof db;
  const config = { database, store: db, origin: 'https://vibies.test',
    secret: 'synthetic-test-secret-with-at-least-32-characters', clientId: 'synthetic-client', clientSecret: 'synthetic-secret' };
  try {
    const failed = googleAuthForRequest(config);
    await assert.rejects(failed, /Google auth database unavailable/);
    const routes = createGoogleRoutes({ ...config, sessionCookie: 'vibies-session', browserCookie: 'vibies-browser' });
    const callback = await routes.callback(new Request(`https://vibies.test${GOOGLE_AUTH_PATH}/callback/google`, {
      headers: { cookie: '__Secure-vibies-google.oauth_state=stale' },
    }));
    assert.equal(callback.headers.get('location'), '/sign-in?message=failed');
    assert.ok(callback.headers.getSetCookie().some(value => value.includes('Max-Age=0')));
    Object.assign(database, db);
    const recovered = googleAuthForRequest(config);
    assert.notEqual(recovered, failed);
    assert.equal((await (await recovered).$context).adapter.id, 'kysely');
  } finally { sqlite.close(); }
});
