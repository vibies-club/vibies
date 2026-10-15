# Encrypted migration rehearsal primitives

The snapshot, export and encryption modules are offline, synthetic-tested primitives. The separately invoked `migration-remote.mjs` transport connects only to an explicitly reviewed Cloudflare account and D1 database. None of these modules reads environment files. A rehearsal is **not authorization to activate a live destination**. Run with Node 24:

```sh
node --test tests/migration-rehearsal.test.mjs
```

## Export contract

`sourceExportSql` produces one read-only repeatable-read transaction with one encrypted result. Supply a freshly generated **OpenPGP** public key, the reviewed source project, destination database ID and environment. Verify the installed pgcrypto extension schema before selecting `cryptoSchema`. The query uses PostgreSQL's Unicode lower-case nickname keys and exports integer identities/versions as decimal strings and timestamps as UTC strings with all six fractional digits. It includes all ten application tables and next sequence values.

The schema hash covers source column identity/type/nullability. It does not replace the separate full schema/index/constraint/function inventory in the migration plan. Compare it with the independently reviewed expected hash. Unknown/missing row fields are rejected, never discarded. A source schema drift therefore requires review, not changing the expected hash to force an import.

PostgreSQL sequence changes are not isolated by repeatable read. Verify the source write barrier before the final export and sequence capture. There is no such barrier implemented in these helpers. Do not claim final cutover consistency from a rehearsal snapshot.

Save the decoded ciphertext through `saveEncryptedBackup` outside the repository. It creates a new file exclusively with mode 0600 and returns only its byte count and SHA-256. Do not save query output containing plaintext. `decryptSnapshot` accepts an externally supplied OpenPGP implementation that decrypts into a Buffer; it scrubs that Buffer after JSON parsing. Parsed JavaScript values necessarily remain in process memory until garbage collection; JavaScript cannot guarantee erasure of copies.

A real synthetic pgcrypto → OpenPGP → local D1 roundtrip is covered by `tests/migration-encryption-postgres.test.mjs`. It creates an isolated database on the existing loopback fixture and an ephemeral mode-0700 GPG home outside the repository. GnuPG 2.5.21 must use an RFC 4880 RSA certification primary key plus a separate RSA encryption subkey: the attempted encryption-only primary key returned `No encryption key found` from pgcrypto. The test runs the generated SQL unmodified, saves ciphertext only, decrypts through stdin/stdout buffers, rejects truncated ciphertext, independently checks the source column schema hash, reconciles all ten tables and checks restored sequence allocation in local D1. The ephemeral database, keyring and GPG agent are cleaned up; the shared fixture database/container are preserved.

`migration-gpg.mjs` runs only an explicitly supplied isolated keyring, suppresses diagnostics, caps output, bounds runtime and wipes temporary stdout chunks. Production private-key custody remains an operator handoff. The reviewed remote transport is documented in [migration-remote.md](migration-remote.md); it keeps private statements in memory and uses a D1 binding. No private snapshot has been read.

To reproduce against the already-running trust-connected synthetic PostgreSQL fixture (this test refuses other ports/databases/password URLs):

```sh
VIBIES_MIGRATION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:60584/vibies_access_test node --test tests/migration-encryption-postgres.test.mjs
```

The environment variable contains only a synthetic loopback connection; the test does not read credential files. Without it, the test is skipped.

## Import contract and boundaries

`prepareSnapshot` requires independently supplied expected environment, source project, destination database and reviewed schema hash. It preserves text identities, Unicode nickname keys, nulls and timestamp text, converts source booleans, and marks every imported session `legacy`. Decimal integer strings avoid JSON precision loss. Next sequence values must exceed imported maxima; milestone positions must be contiguous. The manifest contains counts and canonical SHA-256 hashes, never row values.

`rehearseImport` accepts an injected transport with:

- `identity()`: actual environment, database ID, activation `state: 'disabled'`, and `empty: true`. Verify the database externally and check all private/linking tables; allow only expected schema seed rows. Do not trust caller-supplied labels as proof. The helper does not inspect a real database's identity by itself.
- `batch(statements)`: exactly one atomic transaction of bound SQL/parameters, aborting all statements on any error. The statements replace only the ten application tables and restore `sqlite_sequence`. Do not split across requests or pass through a logging proxy. The surrounding activation/linking tables are deliberately untouched.
- `readTables(names)` and `readSequences(names)`: in-memory readback with exact integers, no row logging. Every table hash/count and sequence must match before success. A readback mismatch can leave imported data present, but must never activate or expose the destination.

Transport calls and errors are redacted at the helper boundary. An actual transport must additionally disable request-body/error logging and verify D1 query/batch limits against the snapshot size. Connection-side errors must never be printed. Identity checks and atomic import must be protected from concurrent writers; destination application access remains disabled throughout. A returned manifest is rehearsal proof, never activation authorization. The code does not change activation state.

## Why no Wrangler stdin invocation

Verified against installed Wrangler **4.151.0**: `node_modules/wrangler/wrangler-dist/cli.js` reads `input2.file ? readFileSync(input2.file) : input2.command` in its D1 execution path. Current [D1 Wrangler docs](https://developers.cloudflare.com/d1/wrangler-commands/#execute) require `--file` or `--command` and document no SQL stdin option. Do not pass private SQL in a command argument or assume `--file -` is stdin. The separately invoked [remote transport](migration-remote.md) uses Wrangler’s remote proxy and a Miniflare D1 binding, keeping bound parameters in memory. Cloudflare's [D1 batch binding](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) documents transaction semantics for prepared statements, but provider limits and actual transport behavior still require a synthetic integration proof.

## Verified locally

The synthetic Node SQLite tests cover all ten tables; exact large IDs/version, quotes/newlines and Unicode; timestamp microseconds; nulls/booleans; legacy sessions; source/destination/schema rejection; hash/count readback; full transaction rollback on a foreign-key failure; sequence gaps; out-of-repository exclusive ciphertext storage; and decryption error redaction/Buffer scrubbing. The eighth test also runs the import and rollback against local D1/workerd with Miniflare 4.20260730.0, using its supported compatibility date 2026-08-06. It verifies exact large-integer readback via SQL CAST, activation remains disabled, sequence allocation and atomic rollback. The separate synthetic PostgreSQL encryption test supplies the pgcrypto/OpenPGP roundtrip proof; neither local test substitutes for remote transport proof.
