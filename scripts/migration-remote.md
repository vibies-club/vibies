# Guarded remote D1 migration transport

`migration-remote.mjs` supplies two explicitly invoked transports for
[`rehearseImport`](migration-snapshot.mjs). Importing it does not contact
Cloudflare or discover application configuration. Neither transport activates
a destination or reads application credential files. Wrangler manages its own
existing authenticated session internally.

Use **`createHttpMigrationTransport` in this environment**. A synthetic remote
rehearsal passed with it on 2026-10-15. The proxy alternative,
`createRemoteMigrationTransport`, reaches startup after its D1 binding and
runtime fixes, but its first remote read stalls in this environment, including
without D1 sessions. Its remote read/write path remains unproven here.

## Destination preparation

Supply the independently reviewed Cloudflare account ID, D1 database UUID and
`staging` or `production` environment. Apply all D1 migrations first and provision
the immutable `deployment_identity` record through a separately reviewed step.
Do not derive the stored identity from unverified import labels.

Explicitly clear only the expected initial public demo, community and ownership
seed rows while the destination is disabled. The transport itself requires all
ten application tables and all six Google/link tables empty. An existing import
cannot be silently replaced. Do not clear unexpected data to make an import pass.

```js
import { createHttpMigrationTransport } from './migration-remote.mjs';
import { rehearseImport } from './migration-snapshot.mjs';

const transport = await createHttpMigrationTransport({
  accountId: reviewedAccountId,
  databaseId: expected.destinationDatabase,
  environment: expected.environment,
});
try {
  const manifest = await rehearseImport(decryptedSnapshot, expected, transport);
  // Retain only reviewed counts/hashes. Never print source rows.
} finally {
  await transport.dispose();
}
```

## HTTP transport and privacy boundary

The HTTP transport uses **Wrangler 4.151.0's pinned experimental command-handler
API**: `experimental_getWranglerCommands` selects the `d1 execute` handler,
which sends the query through Wrangler's authenticated HTTPS D1 endpoint.
The handler receives an explicit in-memory configuration. It does not invoke the
CLI parser or load `.env`, `.dev.vars`, or a Wrangler configuration file.
A Wrangler upgrade requires rerunning the command-boundary and remote proofs.

Each request runs in a separate Node process with a fixed script path and flag.
SQL, target metadata and results pass through OS pipes in memory. SQL and bound
values never enter process arguments or plaintext files. The parent captures
all child stdout/stderr; the child also captures Wrangler output before loading
it. Only parsed results return to the parent, and provider failures become one
fixed error without a cause. File logging and metrics are disabled. Run outside
request-recording/debugger instrumentation. JavaScript cannot guarantee erasure
of parsed strings, although temporary byte buffers are wiped.

The HTTPS command API has no parameter argument, so the adapter encodes strings
as UTF-8 hex text literals and validates positional parameter counts. It sends
the entire guarded import as one multi-statement query. Do not split it. A late
foreign-key failure was verified to roll back the earlier insert in the actual
isolated remote database before this transport was accepted. The synthetic
import then reconciled ten table counts/hashes and an integer above JavaScript's
safe range. Seven of those remote fixture tables were empty; the offline HTTP
suite separately covers a fixture with rows in every source table.

Each child has a 45-second timeout and bounded input/output. A timeout or lost
response leaves the outcome uncertain. Keep the destination disabled and
reconcile it before another attempt. Disposal stops outstanding children.

## Shared guard and reconciliation

Both transports use the same adapter. `identity()` checks the stored identity,
one disabled activation record, and empty application/linking tables. `batch()`
repeats those predicates inside the atomic query using a random ordinary table
with a `CHECK` constraint. A failed predicate aborts before import writes; a
later constraint failure rolls back the batch and guard table. The guard table
is dropped on success. Neither stored identity nor activation is changed.

Readback casts integer IDs, positions, versions and sequence values to text
before JSON serialization. Only whitelisted application tables and sequences
can be read. Count/hash and sequence reconciliation must all pass.

Shared admission limits are 100 bound values and 100,000 UTF-8 SQL bytes per
statement, 1 MiB serialized input statements, and 1,000 input statements. The
HTTP path additionally caps its expanded SQL at 4 MiB and result output at
16 MiB. These conservative limits are not provider entitlement claims.
Larger snapshots require a separately reviewed atomic strategy.

## Proxy alternative and stdin limitation

The proxy transport uses inline `maybeStartOrUpdateRemoteProxySession` bindings.
The SDK requires `database_id` for D1 here. It loads Miniflare from Wrangler's own
dependency scope (5.20261012.0-beta), with `convertV4MiniflareOptions`, rather than
the project's older top-level Miniflare. Local workerd tests pass; the remote
request stall described above still prevents using it for this migration.

`wrangler d1 execute --file /dev/stdin` is not a safe substitute. Wrangler first
opens/reads the file to inspect its signature, reopens it for MD5, then stats and
reopens it for upload with `Content-Length` set from the file size. An OS pipe
cannot rewind for those reads and reports size zero. Do not pass private SQL
through `--command`, save it as plaintext, or assume a stdin file path works.

## Verification and limits of the evidence

```sh
node --test tests/migration-remote.test.mjs tests/migration-rehearsal.test.mjs tests/d1-schema.test.mjs
```

The offline suites exercise identity mismatches, disabled/empty checks,
concurrent-writer rejection, late-error rollback, exact integers, hostile text,
all-ten-table reconciliation, closed transports, and redacted failures.
Remote synthetic success does not prove production migration, a source write
barrier, production quota eligibility, activation, or live traffic cutover.
No private source data was copied for this proof.

References: [D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/),
[D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[remote bindings](https://developers.cloudflare.com/workers/local-development/#remote-bindings).
