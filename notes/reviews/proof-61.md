# Issue 61: verification record

Date: 2026-10-15. Work remains unmerged; no production cutover or private-data import has occurred.

- Typecheck passed.
- Retained Next.js production build passed.
- D1 and Google authentication suites: 55 passed, including operator-only Instructor recovery.
- Offline suites: 106 passed, including eight preview security tests.
- Migration suites: 17 passed.
- Retained Next.js production server against disposable loopback PostgreSQL: 171 HTTP checks passed, including authorization, approval capacity, session expiry, project ownership, moderation, stale writes and roadmap behavior.
- Cloudflare compatibility Worker deployed as version 36036d13-37d3-4174-8137-3001578690e1.
- Live Google authorization with owner permission returned the expected unlinked-account recovery message. No community account or session was created by the initial boundary test. The subsequent linked-login proof is recorded below.
- Separate remote D1 rehearsal passed atomic late-constraint rollback, exact signed 64-bit integer preservation, and reconciliation of all ten source tables. Only synthetic data was used. Its activation remains disabled and it is not bound to a Worker.
- Home and sign-in screenshots inspected at 390, 768, 1280 and 1440 px. See notes/shots/61/README.md.

## Remaining release gates

Authenticated Workers Free CPU evidence; isolated PR preview and trusted staging receipts; final independent PR review, required CI and Member approval; Instructor merge to deploy source write barrier; final encrypted source snapshot, reconciliation and explicit destination activation; domain choice and final browser proof. Current source hosting and data remain unchanged.

Production source catalog fingerprints match the repository-derived local schema; see source-schema-61.md.

Staging source catalog fingerprints also match. Live GitHub sign-in and unapproved-account denial passed after replacing unsupported Workers redirect mode with manual rejection.

## Live isolated authentication and persistence

- GitHub OAuth completes and initially denies unapproved community access.
- An explicitly approved isolated account links Google through a recent GitHub session.
- Sign-out leaves zero application sessions and zero Google sessions, retaining one identity link.
- Subsequent Google sign-in returns to the same account: one account, one Google-authenticated application session, one mapping to the existing identity.
- Provider token and real profile retention checks both return zero rows.
- A synthetic owned project's milestone was saved through the Google session and survived a full browser refresh. Remote D1 returned the same title and incomplete state.
- Production data was not imported. The synthetic project's repository reference does not prove live GitHub repository verification; that requires the existing metadata-only GitHub App configuration.

Latest clean compatibility Worker version: `36036d13-37d3-4174-8137-3001578690e1`.

## Observed Free runtime metrics

The one-hour dashboard/API observation covering the isolated browser tests reported 207 requests, zero errors, 8.15 ms median CPU and 136.707 ms P99 CPU. This is evidence that these requests completed on the current Free account, not proof that every flow remains below the 10 ms Free CPU allowance. Cold-path and sustained authenticated workloads still need assessment before release.

## Disabled production preparation

Created a separate production D1 database within the Free quota and applied migrations 0001 through 0004. A remote query returned `disabled`, no environment identity, zero accounts and zero projects. Built with `CLOUDFLARE_ENV=production`; generated config binds only that database. Deployed Worker version `4dd8d745-6b98-45ee-9a27-6a912ccf6f15`, with no OAuth or metadata credentials configured. This is preparation, not a production cutover.
