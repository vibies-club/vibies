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

## Static architecture proof

The approved static architecture builds with Vite and prerenders only public home content. Every private read or mutation goes through the request-local Worker services and D1 activation guard. The root validated typecheck, 106 offline tests, 55 D1/Google tests, 9 Worker boundary tests and the retained Next.js build. Native private-page redirect, GitHub login and return to the original project, Google login, sign-out, and persisted milestone completion were verified on the isolated compatibility Worker. Production data and hosting remain unchanged.

The first static version had a 1.982 ms median and 75.429 ms P99 across 16 requests (zero errors), including first-use dynamic authentication module loading. The next version imports authentication code at module startup, preserving request-local provider configuration. Its deployed startup time is 39 ms, below the 1-second startup limit. Live per-request CPU evidence for that version remains pending.

Current compatibility version: `ff748da6-30b0-428f-ab39-0cbe8797cbe3`. Workers Builds production command was updated to `CLOUDFLARE_ENV=production npm run build:cloudflare`; saving the setting completed. No production build or activation was triggered.

The remote D1 read-only query of the synthetic project returned milestone `Verify Cloudflare save and refresh` with `completed = 1`; two rows read, zero rows written. Twenty consecutive authenticated project reloads also succeeded on the optimized static version. All 20 final viewport screenshots were opened and inspected at 390/768/1280/1440px, with zero horizontal overflow. Independent Impeccable design and detector assessments found no major defect; see `static-craft-61.md`.

## Static review and hosted checks

The final fresh review returned `ship` for 3146183..ed50cc2. Its raw output is saved in pr-62-r2.md. It found no blocker or major finding, inspected all 20 screenshots, and independently passed 29 targeted tests. Its two sandbox-blocked workerd checks do not replace the root's successful local workerd evidence. The required app-check, migration-check and links checks all passed for ed50cc2010ff4f5fd9dea9a5813a3ebd2f05a372.

Manual PR preview version e7788d78-a769-492e-a3ef-bd2501355cfb deployed the same frozen head to https://vibies-pr-62.xterminbeta-2b6.workers.dev with separate empty synthetic D1. Home and header Sign in navigation were verified in the browser. No OAuth secrets are bound to that preview. Automatic trusted preview/staging and Instructor gates remain pending.

The optimized static version's 67-request window at 12:21:30–12:24:30 UTC recorded zero errors, CPU P50 1.805 ms and P99 74.858 ms. The 48-request warm window at 12:23:16–12:24:00 UTC recorded zero errors, P50 1.809 ms and P99 17.973 ms. These aggregates do not attribute outliers to a route.

To obtain route-specific evidence, compatibility-only version e06d354c-ff71-4e9d-b31b-56c90f179fbb enabled invocation logs with query-string redaction; no production setting changed. The first 13 invocations showed all outcomes ok: authenticated /api/page reads at 9, 6, 4, 3 and 3 ms; static shell requests at 0–1 ms. Logs were queried using the exact Worker filter, and only sanitized route, CPU, outcome and version fields were returned. Broader OAuth/mutation evidence remains a release gate.

Cloudflare's CPU documentation permits infrequent per-isolate overruns but terminates consistent overruns. Typical timing and zero-error samples do not establish an all-request guarantee. Free remains the only permitted plan.

## Request-local Google schema preflight optimization

Route-specific logs on compatibility version e06d354c-ff71-4e9d-b31b-56c90f179fbb identified successful but over-budget auth requests: sign-out 35 ms, Google initiation 34 ms and callback 70 ms. The application API requests in the same window were 1–4 ms.

Better Auth 1.7.9 performs schema introspection per adapter instance. Since this application intentionally constructs its auth configuration per request to isolate link grants and environments, each OAuth operation repeated SQLite metadata scans. D-027 uses the documented advanced.database.validateSchema=false option and validates the pinned schema explicitly in the required suite. A missing verification table is proven to reject initiation without issuing a session. Authorization hooks, D1 constraints, activation checks and request-local provider configuration remain unchanged.

Validation after the change: 58 D1/Google tests, 9 Worker boundary tests, typecheck and the static Cloudflare build passed. A focused independent safety check found no blocker; raw output is in schema-preflight-61.md. Only the isolated compatibility Worker was deployed (version 1ed68bc2-fce5-4c9f-834b-47e889c69b0c); live CPU results remain to be recorded.

## Current Free-plan release blocker

Route-specific records for version 1ed68bc2-fce5-4c9f-834b-47e889c69b0c after the schema optimization still exceed the nominal Free allowance: Google callback 147 ms; a later warm Google start 14 ms, sign-out 11 ms, and project action 13 ms. Page API samples were 2–10 ms. Every recorded outcome was ok, but this does not establish reliable Free-plan headroom. No production import, activation, traffic change, paid plan or card step was performed. The draft PR remains available for review; the Free CPU gate is unresolved.

## Bounded auth reuse and final Free-plan evidence

Commit 3c87f1ddd556a317e17f2c2fab24b9df362ba8ce adds a single grant-free Better Auth instance cache, keyed by exact database/store object identities, origin, auth secret and provider credentials. Only those six fields are retained. Any link grant bypasses the cache. Explicit activation checks remain outside and before auth construction. The independent focused check found no blocker; 60 D1/Google tests (including 18 Google cases), 9 Worker boundary tests, typecheck and static build passed. This is an initialization optimization, not a claim of Free-plan suitability.

The cache build was deployed only to compatibility Worker version 166e25ee-a1f7-4935-81d0-17df4da6dbe8. The approved owner account completed Google login twice and reached the private synthetic account page. A Worker-scoped, sanitized telemetry query returned 24 events from 12:37:52.151 through 12:40:03.529 UTC: sign-out 19 ms, Google start 15 ms, callback 114 ms, later start 19 ms, and page API 1–9 ms. Every recorded outcome was ok. The second callback and second sign-out were absent from ingested records; browser success does not supply their CPU measurements. These sparse samples do not establish an improvement over the prior version or reliable Free-plan headroom.

The Free CPU gate remains unresolved after the approved static rewrite and bounded auth optimizations. No production data was imported, no source write barrier or destination activation was performed, no production traffic was switched, and no paid plan or card step was taken. PR #62 remains draft. Instructor approval/merge, trusted automatic preview/staging receipts, metadata-only GitHub App configuration, controlled import/reconciliation, domain choice and production proof remain subsequent gates.

Manual PR preview version 59dd4283-1dc3-480e-a99e-282909fddc39 serves commit 3c87f1d with isolated D1 177f2b16-63d3-4c33-9beb-0216f77c7189 and artifact hash 0af97a24935b6721ad3ffce3fb66a656d8ab606493ebc1827095baa26d97f3c6. The home page and header Sign in link were exercised; the sign-in page displayed the matching source prefix. This is manual preview evidence, not the automatic workflow receipt.

## Minimal auth and minified Worker comparison

The minimal Better Auth entry point and explicitly pinned stock Kysely adapter passed 61 D1/Google tests, including 19 Google cases, 9 Worker boundary tests, typecheck and the static build. A focused independent review found no concrete security or correctness issue; its raw output is in `minimal-auth-61.md`.

Compatibility version `ef041366-d12d-476c-907c-acb38093bfd1` deployed the minimal entry point. The approved owner Google login reached the existing synthetic Migration Tester account. Subsequent Google chooser navigation stalled during repeated checks; these attempts must not be counted as successful callbacks without provider or browser evidence.

Compatibility version `0ae1591c-b911-4d85-a8bf-4720ec825259` additionally enables Vite server minification. Total upload decreased from 1562.69 KiB to 743.41 KiB. This is a build-size result, not a CPU conclusion. Route-specific measurement and repeated live callback proof remain pending. Neither experiment touched production data or traffic.

The scoped telemetry queries subsequently returned 24 minimal-entry events (13:02:21.874–13:03:54.133 UTC), including successful Google callbacks at 50 and 60 ms, and 17 minified-entry events (13:04:30.519–13:06:50.103 UTC), including a successful callback at 138 ms. The minified sample also includes a 16 ms page API request and a 3 ms canceled request. This does not resolve Free-plan suitability. The minified browser flow reached the linked synthetic account and its saved project; a remote read-only D1 query confirmed the existing milestone was completed.

Regression checks for commit fbc01f0 passed: 106 offline, 61 D1/Google, 9 Worker boundary, 17 migration tests, typecheck, and static Cloudflare build. Actual Vite bundle local profiling showed warm full-route median wall times of 2.39 ms start, 6.53 ms callback, and 1.55 ms sign-out; first start/callback were 16.78/18.94 ms. These local synthetic measurements cannot replace remote CPU proof.

## Startup metadata preparation experiment

The startup candidate prepares only a grant-free Better Auth context from imported Cloudflare bindings. A workerd test proves zero SQL and network calls, exact-cache reuse, and safe skip behavior for missing configuration or telemetry overrides. The focused review is saved verbatim in `auth-startup-61.md`. Ten Worker/startup tests, 19 Google tests, typecheck, and the static build passed. Compatibility-only version `d99050b9-ad81-4163-a538-468d5b01d65c` deployed successfully with 61 ms reported Worker startup time. Live route measurements remain pending; no production state changed.

A scoped read for startup version d99050b9 returned a successful Google callback at 43 ms (13:09:31.861 UTC), sign-out at 9 ms, and the public shell at 0 ms. The owner reached the synthetic account in the browser. Startup preparation therefore does not clear the Free auth CPU gate. The owner has been offered the proposed Durable Object flow-coordination design in `notes/plans/61-free-auth.md`; no new resource is authorized or created yet.


## Approved per-browser Durable Object coordinator

The owner approved the Free-plan Durable Object option. The fresh plan review and focused security review are recorded in `plan-61-free-auth.md` and `coordinator-security-61.md`. The initial logout recovery finding was fixed: incoming and newly issued session hashes plus linking-grant hashes are durably recorded before external cleanup. Duplicate callbacks and interrupted exchanges fail closed; D1 remains the authority.

Validation: 109 offline tests, 22 Worker/coordinator tests, 61 D1/Google tests, 17 migration tests, typecheck, retained Next.js build and static Cloudflare build passed. Worker types include the per-environment coordinator. Startup priming was removed.

The dashboard confirms Workers Free is the current $0 plan and lists SQLite Durable Objects in its included allowance. Compatibility version `e11068fa-eeac-4db4-b743-9b7946bbebe7` deployed successfully with SQLite namespace `bf17c688362f41f883dbf0cd804febe1`, owned only by `vibies-compatibility`. No production namespace, import or activation was performed.

Live home-to-sign-in navigation, sign-out and Google login reached the isolated Migration Tester account. A synthetic milestone was marked incomplete and remained incomplete after refresh; remote `wrangler d1 execute --remote` returned its title and completed=0, with one row read and zero rows written. The screenshot is `/private/tmp/vibies-coordinator-saved-refresh.png`; it is a local proof artifact, not an application asset.

Exact-version telemetry for 13:27:49.108–13:28:34.169 UTC contained 17 events. The forwarding Worker used 1 ms for each sign-out, Google start and callback. Adjacent coordinator RPC events used 10, 27 and 43 ms respectively, within the Durable Object 30-second CPU allowance; associating RPC events to these route names is an inference from adjacent timestamps. Other Worker requests used 0–7 ms. One superseded page read was canceled at 2 ms; remaining events were ok. These finite samples support the architecture and do not guarantee every future request's timing.
