# Focused minimal Better Auth review

No concrete security or correctness findings in the scoped diff.

- **Stock adapter parity:** Uses the same `createKyselyAdapter` and `kyselyAdapter` implementation as full Better Auth. SQLite conversions and D1’s `transaction: false` remain intact.
- **Grant isolation:** Only the Kysely connection/dialect is shared. Each auth instance creates a fresh adapter factory, preserving its options and authorization hooks. Link-bearing instances still bypass the shared auth cache.
- **Failure cleanup:** Rejected database preparation removes its matching cache entry. Preparation or `$context` failure removes the matching shared auth promise without deleting a newer replacement.
- **Async call sites:** All production callers await the new promise. Moving callback initialization inside `try` preserves failure redirects and cookie cleanup.
- **Tests:** Added failure/recovery coverage and distinct-adapter assertion address the changed behavior. `git diff --check` passes.

I did not rerun the reported test suite or build. CPU improvement still requires the measured runtime comparison.
