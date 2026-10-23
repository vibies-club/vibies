// This module generates read-only SQL and writes ciphertext only. It never runs SQL.
import { realpath, open } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { columns, sequenceTables, sha256 } from './migration-snapshot.mjs';
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const tablePath = table => `${table === 'demo_projects' ? 'public' : 'vibies_private'}."${table}"`;

export function sourceExportSql({environment,sourceProject,destinationDatabase,publicKey,cryptoSchema='extensions'}) {
  if (!['production','staging'].includes(environment) || !/^[a-z0-9]+$/.test(sourceProject) || !/^[a-z0-9-]+$/.test(destinationDatabase) || !/^[a-z_]+$/.test(cryptoSchema) || !publicKey.includes('BEGIN PGP PUBLIC KEY BLOCK')) throw new Error('Invalid export configuration');
  const tablePairs = Object.entries(columns).map(([table,names]) => {
    const values = names.filter(name => name !== 'auth_provider').flatMap(name => {
      let expression = `t."${name}"`;
      if (name === 'nickname_key') expression = 'lower(t.nickname collate pg_catalog."unicode")';
      else if (name === 'instructor_nickname_key') expression = 'lower(t.instructor_nickname collate pg_catalog."unicode")';
      else if (['created_at','updated_at','last_checked_at'].includes(name)) expression = `to_char(t."${name}" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
      else if (name === 'version' || name === 'position' || (name === 'id' && sequenceTables.includes(table))) expression += '::text';
      return [literal(name), expression];
    });
    return `${literal(table)}, (select coalesce(jsonb_agg(jsonb_build_object(${values.join(', ')})), '[]'::jsonb) from ${tablePath(table)} t)`;
  });
  const sequences = sequenceTables.map(table => `${literal(table)}, (select (case when is_called then last_value + 1 else last_value end)::text from ${tablePath(table).replace(/"([^\"]+)"$/, '"$1_id_seq"')})`);
  // Sequence counters are nontransactional PostgreSQL state. They must be captured
  // while the source write barrier is verified; repeatable read alone is insufficient.
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL timezone = 'UTC';
WITH schema_manifest AS (
 SELECT encode(${cryptoSchema}.digest(convert_to(string_agg(table_schema || '.' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, E'\\n' ORDER BY table_schema,table_name,ordinal_position), 'UTF8'), 'sha256'), 'hex') AS hash
 FROM information_schema.columns
 WHERE (table_schema='vibies_private' AND table_name IN (${Object.keys(columns).filter(x=>x!=='demo_projects').map(literal).join(',')})) OR (table_schema='public' AND table_name='demo_projects')
), snapshot AS (
 SELECT jsonb_build_object('format',1,'environment',${literal(environment)},'sourceProject',${literal(sourceProject)},'destinationDatabase',${literal(destinationDatabase)},'schemaHash',schema_manifest.hash,'capturedAt',to_char(transaction_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sequences',jsonb_build_object(${sequences.join(',')}),'tables',jsonb_build_object(${tablePairs.join(',')})) AS payload FROM schema_manifest
)
SELECT encode(${cryptoSchema}.pgp_pub_encrypt(payload::text, ${cryptoSchema}.dearmor(${literal(publicKey)}), 'cipher-algo=aes256,compress-algo=1'), 'base64') AS encrypted_snapshot FROM snapshot;
COMMIT;\n`;
}

export async function saveEncryptedBackup({ciphertext,path,repositoryRoot}) {
  if (!Buffer.isBuffer(ciphertext) || !ciphertext.length) throw new Error('Invalid encrypted backup');
  const repo = await realpath(repositoryRoot);
  const parent = await realpath(dirname(resolve(path)));
  const relation = relative(repo,parent);
  if (!relation || (!relation.startsWith('..' + '/') && relation !== '..' && !isAbsolute(relation))) throw new Error('Encrypted backups must be outside the repository');
  // Exclusive creation rejects symlink targets and accidental replacement.
  const handle = await open(resolve(parent,resolve(path).split('/').at(-1)), 'wx', 0o600);
  try { await handle.writeFile(ciphertext); await handle.sync(); } finally { await handle.close(); }
  return {bytes:ciphertext.length,sha256:sha256(ciphertext)};
}

// OpenPGP decryption is injected and must return bytes in memory. Node crypto does
// not implement pgcrypto's OpenPGP format. Never substitute RSA for OpenPGP here.
export async function decryptSnapshot(ciphertext, decryptInMemory) {
  let plaintext;
  try {
    plaintext = await decryptInMemory(ciphertext);
    if (!Buffer.isBuffer(plaintext)) throw new Error();
    return JSON.parse(plaintext.toString('utf8'));
  } catch { throw new Error('Snapshot decryption failed'); }
  finally { plaintext?.fill(0); }
}
