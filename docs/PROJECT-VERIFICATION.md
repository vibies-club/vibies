# Issue #17 proof record

[Documentation home](../README.md) · [Setup and exact commands](PROJECT-SETUP.md) ·
[Accepted decision](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access)

## Approved order

The [interview plan](https://github.com/vibies-club/vibies/issues/17#issuecomment-5622731491),
[Skeptic pass and Owner answers](https://github.com/vibies-club/vibies/issues/17#issuecomment-5622944893),
and [amendment](https://github.com/vibies-club/vibies/issues/17#issuecomment-5623003691)
define this work. The outdated issue body was replaced with links to them before
application code. Commit `e424566` records D-015 before the first-stage build.

Finding 10 requires Connect, Publish, and Community read proof first, including
live P1/P15. Edit and Delete follow as P10 to P12. Instructor Hide and Restore
follows as P16. This branch currently contains the first stage only. The isolated
Preview and GitHub App are configured. Member access through Vercel and live
P1/P15 are still pending. The PR remains draft. Synthetic provider results do
not satisfy live installation or hosted Preview proof.

The [owner clarifications](https://github.com/vibies-club/vibies/issues/17#issuecomment-5623179154)
were answered on 2026-09-10. The owner chose an opaque internal account UUID for
project ownership and limited Instructor reads to available projects plus
Hidden targets. Implementation has resumed with those rules. These answers are
recorded in D-015.

## Hosted setup receipts

These checks ran on 2026-09-10 against application commit
`1bbcaa2ac6f264d79f717196aa0ae2c020415d54`. The user approved a one-run exception
for scoped credential setup using owner-only temporary files. This exception
does not change the repository's general secret-handling rule. No credentials,
account identifiers, or private repository links are included in this record.

- [Preview](https://vibies-git-feature-personal-projects-17-beta-momo.vercel.app)
- [GitHub App installation](https://github.com/apps/vibies-projects-preview-17/installations/new)
- [Ready deployment](https://vercel.com/beta-momo/vibies/Dn7pfgugHyt9ZPR3uWo2fPaQdbUn)
- [Passing app CI](https://github.com/vibies-club/vibies/actions/runs/34513459711/job/102992996816)
  and [passing documentation CI](https://github.com/vibies-club/vibies/actions/runs/34513459650/job/102992996665)

| Check | Observed result | Scope |
| --- | --- | --- |
| Isolated database | PASS: a new data-less branch reached healthy status; private schema and runtime role were initially absent | `personal-projects-review-17`, separate from the main database. |
| SQL and runtime boundary | PASS: `supabase/access.sql` applied twice; runtime is NOLOGIN/NOINHERIT; no direct private table grants; exactly 14 runtime functions; Instructor designation denied to runtime | Setup queries against the isolated branch. A dedicated login returned signed-out access state and direct account SELECT failed with SQLSTATE 42501. |
| TLS | PASS: database connection verified with the Supabase CA | Certificate verification stayed enabled. |
| GitHub App | PASS: authenticated App metadata reports only Metadata read and no events; settings show no webhook or user authorization during installation | Public App registration exists. A Member installation has not run. |
| Preview configuration | PASS: ten configuration entries target Preview and only `feature/personal-projects-17` | Metadata check confirms branch scope. Separate OAuth callback and application origin use the fixed Preview URL; public demo configuration points to the isolated database. |
| Instructor sign-in | PASS: real GitHub OAuth returned to the Preview and displayed Guide | Hosted browser journey. |
| Member approval | PASS: Guide approved Builder and Scout through membership management; the page showed two of seven places filled and no unapproved accounts | Hosted Instructor actions. Member sign-ins remain pending. |
| Instructor Community read | PASS: `/projects` displayed an empty Community list | No published project existed for the three-person read proof. |
| Signed-out app boundary | PASS: after application sign-out, `/projects` and a synthetic direct project URL both redirected to `/sign-in?message=expired` | Browser retained Vercel access but had no Vibies session. This does not prove denial of a real published project's details. |
| Public demo | PASS: `/demo` displayed the fixed fictional sample while signed out of Vibies | Hosted browser read from isolated demo setup. |
| Temporary setup cleanup | PASS: local helper stopped and its temporary credential files were removed | Live credentials remain in the scoped Preview configuration. |
| Vercel participant access | PENDING: sharing lists only team members; unauthenticated requests redirect to Vercel SSO | Builder and Scout must obtain Preview access. The Vercel redirect is not application-denial proof. |

The remaining live work is the owning Member's selected private installation,
Connect and Publish, the second Member and Instructor reads, and access loss
and restoration. Follow the [live procedure](PROJECT-SETUP.md#live-p1-and-p15-procedure).
Setup receipts do not complete P1 or P15.

## Local receipts

Commands run with Node.js 24.15.0 and a new disposable PostgreSQL 17 container.
Fixtures use only synthetic accounts, Nicknames, and repository metadata.
The accepted build and server receipts below come from a clean source snapshot
at `/private/tmp/vibies-17-check`, with no environment files copied. An earlier
working-checkout run caused Next.js to load environment files and is excluded
from these receipts. The clean test server uses an in-memory synthetic key.

| Command or check | Observed result | Scope |
| --- | --- | --- |
| `npm test` | PASS: 24 tests, zero skipped | Offline access, demo, project validation, and GitHub provider fakes. |
| `npm run typecheck` | PASS | Application and test TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.3.4 production build from the clean snapshot. |
| `npm run test:access` | PASS: 10 tests, zero skipped | Existing isolated access regression proof. |
| `npm run test:projects` | PASS: 22 tests, zero skipped | 14 offline tests plus 8 database tests, including the parent test. |
| Database commands without fixtures | PASS: both exit 1 with setup messages, zero skipped | `test:access` and `test:projects` cannot report absent database proof as success. |
| `npm run check:access-web` | PASS: 98 assertions, exit 0 | Clean built server, synthetic provider, dedicated runtime login, loopback fixture database. |
| Local Markdown links | PASS: 178 links and fragments in 23 documents | Repository paths and heading fragments. |
| Browser JavaScript scan | PASS: 9 built JavaScript files, zero private server markers | Clean production snapshot; checked App/database configuration names, private SQL identifiers, and synthetic provider markers. |
| Changed Mermaid graph | PASS, exit 0 | DOMAIN graph rendered to SVG with installed Mermaid CLI 11.17.0 and Chrome. No dependency added. |

## Acceptance rows

| Row | Evidence and remaining work | Status |
| --- | --- | --- |
| P1 | [HTTP proof](../scripts/check-projects-web.mjs) passes the synthetic picker, Draft review, Publish, onboarding, second Member and Instructor reads. Real selected installation and hosted Preview require the [live procedure](PROJECT-SETUP.md#live-p1-and-p15-procedure). | Local PASS; live pending |
| P2 | [Database tests](../tests/projects-database.test.ts) and HTTP proof pass signed-out, unapproved, revoked, expired, Instructor owner-action, wrong-owner, and cross-origin denial. | Local PASS |
| P3 | [Provider tests](../tests/project-github.test.ts) pass public, organization, wrong-owner, missing, suspended, All repositories, renamed/mismatched account, later pages, unrelated installations, and incomplete or malformed scans. HTTP checks confirm ineligible results create no project. | Local PASS |
| P4 | Database and HTTP checks pass duplicate connection, unchanged details, competing last-place requests, and capacity enforcement. The database counts all retained rows. | Local PASS |
| P5 | Database checks pass atomic publication/onboarding, trigger-injected failure rollback, and concurrent/repeated publication. HTTP checks pass repeated publication with no stored changes. | Local PASS |
| P6 | Database and HTTP checks pass Hidden publication and unavailable direct reads. Instructor reads pass for available projects and Hidden targets; Visible Draft, Archived, and Disconnected targets stay unavailable. | Local PASS |
| P7 | Database and HTTP checks pass invalid ownership, missing IDs, Archived, Disconnected, and submitted Class-kind attempts. The schema stores Personal Projects only. | Local PASS |
| P8 | Provider and HTTP checks pass Unknown no-change results, confirmed loss saving Disconnected, and direct requests with untrusted browser verification fields. | Local PASS |
| P9 | Database and HTTP checks pass explicit loss detection, same-repository restoration, retained publication/moderation, and unavailable Hidden/Archived states. | Local PASS |
| P10 | Edit is not built. Initial Connect form validation has unit coverage, including maximum Unicode fields, but this does not prove Edit. | Waiting for first-stage live receipts |
| P11 | Delete is not built. No deletion claim is made. | Waiting for first-stage live receipts |
| P12 | Row versions guard first-stage connection writes. The full Delete/Edit/revocation race row requires the next stage. | Waiting for the next stage |
| P13 | Database tests pass UUID backfill and stability, runtime/anonymous grant denial, and private shared projection. HTTP responses and stored rows contain no synthetic provider identity/token markers. The clean browser bundle scan passes. | Local PASS |
| P14 | Typecheck, 24 offline tests, 10 access tests, 22 project tests, 98 HTTP assertions, clean build, 178 local links, and Mermaid render pass. The public demo remains available. | Local PASS |
| P15 | Hosted setup, Instructor sign-in, Member approval, signed-out routing, and demo checks pass above. The real Member installation and complete three-person journey have not run. | Pending participant access and live proof |
| P16 | Instructor Hide and Restore actions are not built. They follow Edit/Delete under the approved order. | Waiting for the final stage |

## Merge gate

The first-stage diff contains the expected project UI, server checks, private
SQL, tests, CI, and approved documentation changes. Review found no unrelated
files or dependency changes. A scan of all 30 changed files found no environment
files, static private keys, live-token patterns, or database passwords. The
first stage matches the approved plan and both owner clarifications. The clean
build passes. Live Preview acceptance is pending, so the gate is incomplete.
No row is complete because a check was skipped. A Member review and all remaining
proof are required before the Instructor merges.
