**Major — D1 Instructor recovery is missing.** `lib/d1/access.ts:162–164` ends with session deletion; no D1 designation/recovery operation exists in `lib/d1`, `d1`, or `scripts`. `docs/ACCESS-SETUP.md:161–174` still directs the owner to the PostgreSQL-only `vibies_private.designate_instructor` function.

After cutover, a lost or compromised Instructor account cannot be replaced through the supported recovery procedure. Manual updates would bypass the existing atomic safeguards: reject Member promotion, validate nickname uniqueness, invalidate affected sessions, remove an unapproved target entry, and append the private audit record.

**Fix:** implement an operator-only atomic D1 recovery operation, preserve those safeguards, cover it with recovery/authorization parity tests, and update the runbook. This is explicitly required by Gate 3 of `notes/plans/61.md`.

No other confirmed blocker or major finding in the inspected authentication, activation, write-barrier, mutation, or staging paths. Read-only review; no edits, remote requests, or test execution.
