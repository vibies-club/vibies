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

## Workers Builds and isolated PR preview, 2026-10-15

The owner authorized the Cloudflare GitHub app for only `vibies-club/vibies`. Workers Builds is connected to `main`, Node 24, `CLOUDFLARE_ENV=production npm run build:vinext`, and the generated production Wrangler configuration. Native branch previews are disabled in favor of the separately isolated trusted Actions workflow. The first automatic production build remains untested until the migration reaches main.

A manual bootstrap of PR #62 deployed frozen head `12e719d6af6bd50fa01a84cad02e507c623c2bed` to https://vibies-pr-62.xterminbeta-2b6.workers.dev, with its own synthetic D1 and no OAuth secrets. Worker version `13f87f17-8d27-49af-9bfd-1ba2c91b1b5e` uses the corrected native static asset routing. The browser rendered the home page with images and styling, reported no console errors, and its Sign in link opened `/sign-in`. The trusted `/staging.json` marker and control-plane binding were verified. This is manual preview evidence, not proof of the unbootstrapped automatic workflow or Instructor Preview PR/Clear gates.

The asset-routing regression now has assertions in both staging and PR preview tests: 55 tests passed on Node 24.15.0. The first formal PR review returned `ship`; release gates remain open.

## Further Free CPU measurements

The compatibility-only lazy-import build is version `d24dcfbf-37a2-4c0e-9dc7-1973198291e4`. A controlled `/welcome` reload window at 12:07:35–12:07:48 UTC still showed 114–165 ms samples. A later 20-reload window at 12:10:29–12:10:41 UTC produced sampled successful invocations around 11.46–24.03 ms, with no errors. GraphQL values are microseconds, converted once to milliseconds. These exceed the nominal 10 ms Free HTTP allowance and do not establish reliable Free-plan suitability.

A separate local workerd CPU profile rendered the synthetic member for 100 successful warm requests. Local wall P50 was 9.86 ms and P99 13.47 ms, not remote CPU. The profile implicates framework SSR/stream handling; Google auth was absent and D1 contributed under 1% of sampled time. The remote/local discrepancy and cold-versus-warm behavior remain under investigation. No paid plan has been enabled and no production activation or source-data copy has occurred.

## Hosted CI repair

The first PR head passed migration-check and links. app-check failed because the standalone encrypted-export rehearsal created canonical schemas before the disposable PostgreSQL service had Supabase API roles. The fixture now explicitly creates missing `anon` and `authenticated` NOLOGIN roles. GPG execution retains fixed absolute paths, selecting `/usr/bin` on Linux and Homebrew on macOS. Nine encryption/rehearsal tests passed, and a separate fresh PostgreSQL 17 cluster verified role bootstrap and canonical schema creation. Linux execution remains for the next hosted CI run.
