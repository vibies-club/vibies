// Explicitly invoked transport only: importing this module does not connect or read configuration.
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { columns, sequenceTables } from './migration-snapshot.mjs';

const googleTables = ['google_users', 'google_identity_map', 'google_sessions', 'google_link_grants', 'google_accounts', 'google_verifications'];
const emptyTables = [...Object.keys(columns), ...googleTables];
const failure = () => new Error('Remote migration failed; destination must remain disabled');
const defaults = {
  loadWrangler: () => import('wrangler'),
  // Remote proxy protocols must match the runtime bundled with Wrangler.
  loadMiniflare: async () => createRequire(createRequire(import.meta.url).resolve('wrangler'))('miniflare'),
};
function validateTarget(target) {
  if (!target || !/^[a-f0-9]{32}$/i.test(target.accountId) ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(target.databaseId) ||
      !['production', 'staging'].includes(target.environment)) throw failure();
}
function condition() {
  return `(SELECT COUNT(*) FROM deployment_identity) = 1
    AND EXISTS (SELECT 1 FROM deployment_identity WHERE singleton=1 AND account_id=? AND database_id=? AND environment_id=?)
    AND (SELECT COUNT(*) FROM deployment_activation) = 1
    AND EXISTS (SELECT 1 FROM deployment_activation WHERE singleton=1 AND state='disabled')
    ${emptyTables.map(table => `AND NOT EXISTS (SELECT 1 FROM "${table}")`).join('\n    ')}`;
}

export async function createRemoteMigrationTransport(target, dependencies = defaults) {
  validateTarget(target);
  // Wrangler reads these at module initialization. Keep them disabled for this process.
  process.env.WRANGLER_WRITE_LOGS = 'false';
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_LOG = 'none';
  const reviewed = Object.freeze({...target});
  let remote;
  let miniflare;
  let closed = false;
  async function dispose() {
    if (closed) return;
    closed = true;
    const results = await Promise.allSettled([
      Promise.resolve().then(() => miniflare?.dispose()),
      Promise.resolve().then(() => remote?.session?.dispose()),
    ]);
    if (results.some(result => result.status === 'rejected')) throw failure();
  }
  try {
    const { maybeStartOrUpdateRemoteProxySession } = await dependencies.loadWrangler();
    const { Miniflare, Log, LogLevel, convertV4MiniflareOptions = options => options } = await dependencies.loadMiniflare();
    // Inline bindings avoid Wrangler config and .env/.dev.vars discovery entirely.
    remote = await maybeStartOrUpdateRemoteProxySession({
      name: 'vibies-migration', account_id: reviewed.accountId,
      bindings: {DB: {type: 'd1', database_id: reviewed.databaseId, remote: true}},
    });
    if (!remote?.session?.remoteProxyConnectionString) throw failure();
    miniflare = new Miniflare(convertV4MiniflareOptions({
      modules: true, script: 'export default {};', compatibilityDate: '2026-08-06',
      d1Databases: {DB: {id: reviewed.databaseId, remoteProxyConnectionString: remote.session.remoteProxyConnectionString}},
      d1Persist: false, log: new Log(LogLevel.NONE),
    }));
    const binding = await miniflare.getD1Database('DB');
    const database = binding.withSession('first-primary');
    return guardedTransport(reviewed, database, () => closed, dispose);
  } catch {
    try { await dispose(); } catch { /* Keep provider errors and identifiers private. */ }
    throw failure();
  }
}


function guardedTransport(reviewed, database, isClosed, dispose) {
  const identityParams = [reviewed.accountId, reviewed.databaseId, reviewed.environment];
  async function safely(operation) {
    if (isClosed()) throw failure();
    try { return await operation(); } catch { throw failure(); }
  }
  return {
    identity: () => safely(async () => {
      const valid = await database.prepare(`SELECT CASE WHEN ${condition()} THEN 1 ELSE 0 END AS ok`).bind(...identityParams).first('ok');
      if (valid !== 1) throw failure();
      return {environment: reviewed.environment, databaseId: reviewed.databaseId, state: 'disabled', empty: true};
    }),
    batch: statements => safely(async () => {
      if (!Array.isArray(statements) || !statements.length) throw failure();
      // Conservative admission limits; never split a migration into multiple requests.
      let bytes = 0;
      for (const statement of statements) {
        if (!statement || typeof statement.sql !== 'string' || !Array.isArray(statement.params) ||
            statement.params.length > 100 || Buffer.byteLength(statement.sql) > 100000 ||
            statement.params.some(value => value !== null && typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value)))) throw failure();
        bytes += Buffer.byteLength(JSON.stringify(statement));
      }
      if (bytes > 1024 * 1024 || statements.length > 1000) throw failure();
      const guard = `_migration_guard_${randomBytes(16).toString('hex')}`;
      const guarded = [
        {sql: `CREATE TABLE "${guard}" (ok INTEGER NOT NULL CHECK(ok=1))`, params: []},
        {sql: `INSERT INTO "${guard}" (ok) SELECT CASE WHEN ${condition()} THEN 1 ELSE 0 END`, params: identityParams},
        ...statements,
        {sql: `DROP TABLE "${guard}"`, params: []},
      ];
      const results = await database.batch(guarded.map(({sql, params}) => database.prepare(sql).bind(...params)));
      if (results.length !== guarded.length || results.some(result => result.success !== true)) throw failure();
    }),
    readTables: names => safely(async () => {
      if (!Array.isArray(names) || names.some(name => !Object.hasOwn(columns, name))) throw failure();
      const entries = [];
      for (const table of names) {
        const projection = columns[table].map(column => {
          const integer = column === 'version' || column === 'position' || (column === 'id' && sequenceTables.includes(table));
          return integer ? `CAST("${column}" AS TEXT) AS "${column}"` : `"${column}"`;
        }).join(',');
        const result = await database.prepare(`SELECT ${projection} FROM "${table}"`).all();
        if (result.success !== true || !Array.isArray(result.results)) throw failure();
        entries.push([table, result.results]);
      }
      return Object.fromEntries(entries);
    }),
    readSequences: names => safely(async () => {
      if (!Array.isArray(names) || names.some(name => !sequenceTables.includes(name))) throw failure();
      const entries = [];
      for (const table of names) {
        const sequence = await database.prepare('SELECT CAST(seq AS TEXT) AS seq FROM sqlite_sequence WHERE name=?').bind(table).first('seq');
        if (typeof sequence !== 'string' || !/^\d+$/.test(sequence)) throw failure();
        entries.push([table, sequence]);
      }
      return Object.fromEntries(entries);
    }),
    dispose,
  };
}

// The HTTP fallback uses Wrangler's managed authentication inside a separate
// process. SQL and result rows travel only through pipes, never argv or files.
export async function createHttpMigrationTransport(target, dependencies = {spawn}) {
  validateTarget(target);
  const reviewed = Object.freeze({...target});
  let closed = false;
  const children = new Set();
  async function dispose() {
    closed = true;
    for (const child of children) child.kill('SIGKILL');
  }
  async function query(sql) {
    if (closed || children.size || Buffer.byteLength(sql) > 4 * 1024 * 1024) throw failure();
    return new Promise((resolve, reject) => {
      let child;
      const chunks = [];
      let size = 0;
      let settled = false;
      let timer;
      const finish = (error, results) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        children.delete(child);
        for (const chunk of chunks) chunk.fill(0);
        if (error) reject(failure()); else resolve(results);
      };
      try {
        child = dependencies.spawn(process.execPath, [fileURLToPath(import.meta.url), '--http-query-child'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'log', NO_COLOR: '1', CI: '1'},
        });
        children.add(child);
        timer = setTimeout(() => {child.kill('SIGKILL'); finish(true);}, 45000);
        child.stdout.on('data', chunk => {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) {chunk.fill(0); child.kill('SIGKILL'); finish(true);}
          else if (settled) chunk.fill(0);
          else chunks.push(chunk);
        });
        child.stderr.on('data', chunk => chunk.fill(0));
        child.stdin.on('error', () => {child.kill('SIGKILL'); finish(true);});
        child.on('error', () => finish(true));
        child.on('close', code => {
          if (settled) return;
          let bytes;
          try {
            bytes = Buffer.concat(chunks);
            const response = JSON.parse(bytes.toString('utf8'));
            if (code !== 0 || response.ok !== true || !Array.isArray(response.results) || response.results.some(row => row.success !== true)) throw failure();
            finish(false, response.results);
          } catch {finish(true);} finally {bytes?.fill(0);}
        });
        child.stdin.end(JSON.stringify({target: reviewed, sql}));
      } catch {child?.kill('SIGKILL'); finish(true);}
    });
  }
  const database = {
    prepare(sql) {
      const bound = params => ({
        sql, params,
        bind: (...values) => bound(values),
        all: async () => {
          const results = await query(bindSql(sql, params));
          if (results.length !== 1) throw failure();
          return results[0];
        },
        first: async column => {
          const results = await query(bindSql(sql, params));
          if (results.length !== 1) throw failure();
          const row = results[0].results?.[0] ?? null;
          return column ? row?.[column] ?? null : row;
        },
      });
      return bound([]);
    },
    batch: statements => query(statements.map(({sql,params}) => bindSql(sql,params)).join(';\n')),
  };
  return guardedTransport(reviewed, database, () => closed, dispose);
}

// Encode text as UTF-8 hex literals so quotes, semicolons, question marks and
// newlines cannot change the SQL program. Integer strings retain SQLite affinity.
function bindSql(sql, params) {
  let index = 0;
  let quote = null;
  let comment = null;
  let result = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (comment === 'line') {result += char; if (char === '\n') comment = null; continue;}
    if (comment === 'block') {result += char; if (char === '*' && next === '/') {result += next; i++; comment = null;} continue;}
    if (quote) {
      result += char;
      if (char === quote) {if (next === quote) {result += next; i++;} else quote = null;}
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {quote = char; result += char; continue;}
    if (char === '-' && next === '-') {comment = 'line'; result += char + next; i++; continue;}
    if (char === '/' && next === '*') {comment = 'block'; result += char + next; i++; continue;}
    if (char !== '?') {result += char; continue;}
    if (index >= params.length || /[0-9]/.test(next ?? '')) throw failure();
    const value = params[index++];
    if (value === null) result += 'NULL';
    else if (typeof value === 'number' && Number.isSafeInteger(value)) result += String(value);
    else if (typeof value === 'string') result += `CAST(X'${Buffer.from(value,'utf8').toString('hex')}' AS TEXT)`;
    else throw failure();
  }
  if (index !== params.length || quote || comment === 'block') throw failure();
  return result;
}

async function runHttpQueryChild() {
  const send = process.stdout.write.bind(process.stdout);
  const chunks = [];
  let size = 0;
  let failed = false;
  // Capture before loading Wrangler. No provider diagnostics or row values reach
  // a terminal, even when a handler fails after it has produced partial output.
  process.stdout.write = (chunk, encoding, callback) => {
    const bytes = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8');
    size += bytes.length;
    if (size > 16 * 1024 * 1024) {failed = true; bytes.fill(0);} else chunks.push(bytes);
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };
  process.stderr.write = (_chunk, encoding, callback) => {
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };
  let input;
  let output;
  try {
    const inputChunks = [];
    let inputSize = 0;
    for await (const chunk of process.stdin) {
      inputSize += chunk.length;
      if (inputSize > 5 * 1024 * 1024) throw failure();
      inputChunks.push(chunk);
    }
    input = Buffer.concat(inputChunks);
    for (const chunk of inputChunks) chunk.fill(0);
    const {target, sql} = JSON.parse(input.toString('utf8'));
    validateTarget(target);
    if (typeof sql !== 'string') throw failure();
    process.env.WRANGLER_WRITE_LOGS = 'false';
    process.env.WRANGLER_SEND_METRICS = 'false';
    process.env.WRANGLER_LOG = 'log';
    process.env.CI = '1';
    const wrangler = await import('wrangler');
    const handler = wrangler.experimental_getWranglerCommands().registry.subtree.get('d1').subtree.get('execute').definition.handler;
    const config = {...wrangler.unstable_defaultWranglerConfig, account_id: target.accountId, send_metrics: false,
      d1_databases: [{binding: 'DB', database_name: 'migration-target', database_id: target.databaseId}]};
    await handler({database: 'DB', command: sql, remote: true, local: false, yes: true, json: true, preview: false}, {config});
    if (failed) throw failure();
    output = Buffer.concat(chunks);
    const results = JSON.parse(output.toString('utf8'));
    send(JSON.stringify({ok: true, results}));
  } catch {send(JSON.stringify({ok: false})); process.exitCode = 1;}
  finally {input?.fill(0); output?.fill(0); for (const chunk of chunks) chunk.fill(0);}
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--http-query-child') {
  await runHttpQueryChild();
}
