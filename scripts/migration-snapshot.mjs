// Offline migration primitives. No credentials, network, logging, or plaintext files.
import { createHash } from 'node:crypto';

export const columns = Object.freeze({
  _ownership: ['project','feature'],
  community: ['singleton','instructor_github_id','instructor_nickname','instructor_nickname_key'],
  accounts: ['internal_id','github_id','github_username','nickname','nickname_key','status','onboarding_completed'],
  sessions: ['session_hash','github_id','created_at','auth_provider'],
  sign_in_flows: ['state_hash','browser_hash','created_at'],
  sign_in_attempts: ['id','browser_hash','created_at'],
  instructor_audit: ['id','previous_github_id','new_github_id','reason','created_at'],
  personal_projects: ['id','owner_account_id','repository_id','title','summary','demo_url','publication','connection','moderation','last_checked_at','created_at','updated_at','version'],
  project_milestones: ['id','project_id','title','completed','blocked_note','position','created_at','updated_at'],
  demo_projects: ['id','title','summary','created_at'],
});
export const sequenceTables = ['sign_in_attempts','instructor_audit','demo_projects'];
const booleanColumns = new Set(['singleton','onboarding_completed','completed']);
const integerColumns = new Set(['id','version','position']);
const timestampColumns = new Set(['created_at','updated_at','last_checked_at']);
const fail = () => { throw new Error('Migration validation failed'); };
export const canonical = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
export const sha256 = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) fail();
}
function integer(value) {
  if (!(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value))) fail();
  const result = BigInt(value);
  if (result > 9223372036854775807n) fail();
  return result;
}
function normalize(table, row) {
  const sourceColumns = columns[table].filter(column => column !== 'auth_provider');
  exactKeys(row, sourceColumns);
  return Object.fromEntries(columns[table].map(column => {
    let value = column === 'auth_provider' ? 'legacy' : row[column];
    if (booleanColumns.has(column)) {
      if (typeof value !== 'boolean') fail();
      value = Number(value);
    } else if (integerColumns.has(column) && (column !== 'id' || sequenceTables.includes(table))) {
      value = integer(value).toString();
    } else if (timestampColumns.has(column) && value !== null) {
      // Preserve microseconds. Date.toISOString would truncate them.
      if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail();
    } else if (value !== null && typeof value !== 'string') fail();
    return [column, value];
  }));
}
export function prepareSnapshot(snapshot, expected) {
  exactKeys(snapshot, ['format','environment','sourceProject','destinationDatabase','schemaHash','capturedAt','sequences','tables']);
  if (snapshot.format !== 1 || !['production','staging'].includes(snapshot.environment)) fail();
  for (const key of ['environment','sourceProject','destinationDatabase','schemaHash']) {
    if (!expected[key] || snapshot[key] !== expected[key]) fail();
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.schemaHash) || !/^\d{4}-\d\d-\d\dT.*Z$/.test(snapshot.capturedAt) || !Number.isFinite(Date.parse(snapshot.capturedAt))) fail();
  exactKeys(snapshot.tables, Object.keys(columns));
  exactKeys(snapshot.sequences, sequenceTables);
  const tables = Object.fromEntries(Object.keys(columns).map(table => {
    if (!Array.isArray(snapshot.tables[table])) fail();
    return [table, snapshot.tables[table].map(row => normalize(table,row))];
  }));
  const reserved = new Set();
  for (const row of [...tables.community.map(x => ({nickname:x.instructor_nickname,nickname_key:x.instructor_nickname_key})), ...tables.accounts]) {
    if ((row.nickname === null) !== (row.nickname_key === null)) fail();
    if (row.nickname_key !== null) { if (!row.nickname_key || reserved.has(row.nickname_key)) fail(); reserved.add(row.nickname_key); }
  }
  if (tables._ownership.length !== 1 || tables._ownership[0].project !== 'vibies' || tables._ownership[0].feature !== 'issue-5-access' || tables.community.length !== 1) fail();
  for (const project of tables.personal_projects) {
    const positions = tables.project_milestones.filter(row => row.project_id === project.id).map(row => Number(row.position)).sort((a,b) => a-b);
    if (positions.some((position,index) => position !== index + 1)) fail();
  }
  const sequences = Object.fromEntries(sequenceTables.map(table => {
    const next = integer(snapshot.sequences[table]);
    const max = tables[table].reduce((value,row) => BigInt(row.id) > value ? BigInt(row.id) : value, 0n);
    if (next <= max) fail();
    return [table,next.toString()];
  }));
  const manifest = {format:1, environment:snapshot.environment, sourceProject:snapshot.sourceProject, destinationDatabase:snapshot.destinationDatabase, schemaHash:snapshot.schemaHash, capturedAt:snapshot.capturedAt, sequences,
    tables:Object.fromEntries(Object.entries(tables).map(([table,rows]) => [table,{count:rows.length,hash:tableHash(table,rows)}]))};
  return {tables,sequences,manifest};
}
export function tableHash(table,rows) {
  const ordered = rows.map(row => columns[table].map(column => row[column] == null ? null : String(row[column]))).map(canonical).sort();
  return sha256(canonical(ordered));
}
export function importStatements(prepared) {
  const statements = [];
  for (const table of [...Object.keys(columns)].reverse()) statements.push({sql:`DELETE FROM "${table}"`,params:[]});
  for (const [table,rows] of Object.entries(prepared.tables)) {
    const names = columns[table];
    for (const row of rows) statements.push({sql:`INSERT INTO "${table}" (${names.map(x=>`"${x}"`).join(',')}) VALUES (${names.map(()=>'?').join(',')})`,params:names.map(name=>row[name])});
  }
  for (const table of sequenceTables) {
    statements.push({sql:'DELETE FROM sqlite_sequence WHERE name=?',params:[table]});
    statements.push({sql:'INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)',params:[table,(BigInt(prepared.sequences[table])-1n).toString()]});
  }
  return statements;
}
// transport must verify the actual database identity/disabled state, execute ONE
// atomic batch, and read rows in memory. Never log SQL params or provider errors.
// The separately invoked remote transport enforces destination identity and disabled state.
export async function rehearseImport(snapshot, expected, transport) {
  const prepared = prepareSnapshot(snapshot,expected);
  try {
    const identity = await transport.identity();
    if (identity.environment !== expected.environment || identity.databaseId !== expected.destinationDatabase || identity.state !== 'disabled' || identity.empty !== true) fail();
    await transport.batch(importStatements(prepared));
    const actual = await transport.readTables(Object.keys(columns));
    for (const table of Object.keys(columns)) {
      if (!Array.isArray(actual[table]) || actual[table].length !== prepared.manifest.tables[table].count || tableHash(table,actual[table]) !== prepared.manifest.tables[table].hash) fail();
    }
    const sequences = await transport.readSequences(sequenceTables);
    for (const table of sequenceTables) if (BigInt(sequences[table]) !== BigInt(prepared.sequences[table])-1n) fail();
    return prepared.manifest;
  } catch { throw new Error('Migration rehearsal failed; destination must remain disabled'); }
}
