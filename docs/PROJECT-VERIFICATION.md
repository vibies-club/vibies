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
follows as P16. The first-stage local and live receipts, including P1/P15, were
committed in `49747ba` before Edit/Delete code. Edit/Delete now have local receipts
below. Instructor Hide/Restore was built last and now has local receipts. The
PR remains draft. The final review raised the owner decision below before the
hosted moderation check.

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
| GitHub App | PASS: authenticated App metadata reports only Metadata read and no events; settings show no webhook or user authorization during installation | Registration check. Member installation evidence follows below. |
| Preview configuration | PASS: ten configuration entries target Preview and only `feature/personal-projects-17` | Metadata check confirms branch scope. Separate OAuth callback and application origin use the fixed Preview URL; public demo configuration points to the isolated database. |
| Instructor sign-in | PASS: real GitHub OAuth returned to the Preview and displayed Guide | Hosted browser journey. |
| Member approval | PASS: Guide approved Builder and Scout through membership management; the page showed two of seven places filled and no unapproved accounts | Hosted Instructor actions. Member access evidence follows below. |
| Instructor Community read | PASS: `/projects` displayed an empty Community list | No published project existed for the three-person read proof. |
| Signed-out app boundary | PASS: after application sign-out, `/projects` and a synthetic direct project URL both redirected to `/sign-in?message=expired` | Browser retained Vercel access but had no Vibies session. This does not prove denial of a real published project's details. |
| Public demo | PASS: `/demo` displayed the fixed fictional sample while signed out of Vibies | Hosted browser read from isolated demo setup. |
| Temporary setup cleanup | PASS: local helper stopped and its temporary credential files were removed | Live credentials remain in the scoped Preview configuration. |
| Vercel protection | At setup, sharing listed only team members and unauthenticated requests redirected to Vercel SSO | The Vercel redirect is not application-denial proof. Subsequent participant access is recorded below. |

## Live journey receipts

The user supplied four screenshots on 2026-09-10 at about 20:04 UTC and confirmed
that image 1 came from Scout's signed-in session. The user also confirmed that
the private repository contains only test data, with no real user or customer
data. The record calls it **Project A**. Its repository name, chosen demo URL,
and raw screenshots are omitted to keep this record limited to Nicknames and
synthetic examples.

The checks used the fixed Preview for commit
`0f821f21a2b83388a0182bc2d77d96ece4345c2d`, with its
[successful deployment](https://vercel.com/beta-momo/vibies/B7UHu4FJxxPemrVyTB6d3GDD5n9t).
The application code is unchanged from `1bbcaa2`. Agent browser checks ran
between 20:05 and 20:08 UTC.

At about 20:23 UTC, the user supplied the loss-check screenshot and confirmed
the Builder and Scout journeys and the intended GitHub App. The agent checked
Guide's list and the original project URL at about 20:24 UTC. These follow-up
checks used the [deployment of documentation commit `45b9353`](https://vercel.com/beta-momo/vibies/EKc8d3SqPGykrst5z1u2NyzNbW2T),
with the same application code.

At about 20:32 UTC, the user confirmed the requested restoration checks for
Builder and Scout. At about 20:33 UTC, the agent confirmed that Guide could read
Project A in the list and at its original direct URL, with the same shared
details. This used the [deployment of documentation commit `8ee4e72`](https://vercel.com/beta-momo/vibies/9gjLiZA6Q1Cc428GXbMeXeMkcS7a),
still with the same application code. These receipts complete the first-stage
gate before Edit/Delete implementation.

| Check | Observed result | Receipt |
| --- | --- | --- |
| Member Preview access | PASS: Builder and Scout reached authenticated Member pages | User report and screenshots of owner and non-owner views. |
| Eligible private repository | PASS: the refreshed picker offered Project A's private repository | User screenshot 3; screenshot 4 shows the App setup and refresh controls. |
| Publication and onboarding | PASS: Builder's project showed Published, Connected, Visible, and Onboarding complete | User screenshot 2 also reports a successful connection check at 20:01:17 UTC. |
| Scout Community list | PASS: Project A appeared with Builder's Nickname and the chosen shared details | User screenshot 1; the user confirmed Scout was signed in. |
| Scout direct project read | PASS, human-confirmed: the user confirmed the requested Member journey, including opening the shared project | User confirmation at about 20:23 UTC. The agent did not control Scout's browser. |
| Instructor reads | PASS: Guide read Project A in the Community list and opened its direct page; both showed the same chosen shared details and Builder's Nickname | Agent browser observation. No owner controls appeared. |
| Signed-out private reads | PASS: after application sign-out, both Project A's actual direct URL and `/projects` redirected to `/sign-in?message=expired`; no project details appeared | Agent browser observation with Vercel access retained. Guide then signed in again. |
| Selected-access loss | PASS: Builder's Check connection returned lost and showed Published, Disconnected, Visible, and Onboarding complete; the last successful check remained 20:01:17 UTC | User loss-check screenshot for the same Project A URL. Scout's loss check was human-confirmed. Guide's list omitted Project A and its direct page showed Project unavailable in the agent browser. |
| Same-project restoration | PASS: after selected access was restored, Builder confirmed Published, Connected, Visible, and completed onboarding on the existing project; Scout confirmed it returned and opened | Human confirmation of both requested checks. The agent independently confirmed Guide's list and original direct URL, with unchanged shared details. |

The [live procedure](PROJECT-SETUP.md#live-p1-and-p15-procedure) is complete.
P1, P9, and P15 now have live receipts. Edit/Delete local proof follows below.
Instructor Hide/Restore local proof follows below.

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
| `npm run test:projects` | PASS: 26 tests, zero skipped | 14 offline tests plus 12 database tests, including the parent test. |
| Database commands without fixtures | PASS: both exit 1 with setup messages, zero skipped | `test:access` and `test:projects` cannot report absent database proof as success. |
| `npm run check:access-web` | PASS: 134 assertions, exit 0 | Clean built server, synthetic provider, dedicated runtime login, loopback fixture database. |
| Local Markdown links | PASS: 176 links and fragments in 23 documents | Repository paths and heading fragments, rechecked after the final moderation receipt update. |
| Browser JavaScript scan | PASS: 9 built JavaScript files, zero private server markers | Clean production snapshot; checked App/database configuration names, private SQL identifiers, and synthetic provider markers. |
| Changed Mermaid graph | PASS, exit 0 | DOMAIN graph rendered to SVG with installed Mermaid CLI 11.17.0 and Chrome. No dependency added. |

## Edit/Delete milestone

On 2026-09-10, after the first-stage gate commit `49747ba`, the clean production
build, 24 offline tests, 25 project tests, 10 access tests, and 122 HTTP assertions
passed with zero skipped tests. P10 to P12 have runnable local receipts. The HTTP
provider delay uses a bounded advisory lock in the isolated test harness; it is
never enabled in the Preview. An initial confirmation-text assertion failed
because React adds invisible HTML comments between text nodes. The assertion
was corrected and the entire HTTP proof passed from fresh fixtures. No failed
or skipped check counts as proof.

The Edit/Delete changes use native forms, the existing protected action route,
and two private functions. The route and database both check current owner
authorization. The React review found no new client components or hooks. Live
Edit/Delete confirmation is pending; the required real GitHub gate is already
complete above.

The isolated Preview received the two exact tested function definitions with
only their execution grants, in one transaction. This narrow migration ran
twice. Read-only verification showed both retained project rows unchanged,
16 runtime functions, zero direct private table grants, NOLOGIN/NOINHERIT, and
no runtime Instructor-designation privilege. Automatic approval review rejected
a full schema rerun because its scope was broader; that command did not run.
The full idempotent SQL is proven locally by the database tests.

## Instructor moderation milestone

Instructor Hide/Restore was built after the Edit/Delete receipt commit
`4b70d9e`. It uses one protected function, the same POST route, and native project
page controls. Only moderation and the concurrency version change. The
Instructor can act on available projects and Hidden targets; restoring a Hidden
Draft, Archived, or Disconnected project does not make it available.

The clean production build and typecheck pass. Offline tests pass 24/24, project
tests 26/26, access tests 10/10, and built-server HTTP checks 134/134. No tests
were skipped. The first fixture preparation found a PL/pgSQL CASE-expression
syntax error; the same-state condition was corrected and fresh database and HTTP
fixtures then passed. The browser scan still covers nine JavaScript files with
zero private server markers. The isolated Preview received only the tested
moderation function and its specific execution grants. That migration ran twice;
both project rows stayed unchanged, the runtime allowlist contains 17 functions,
and direct table access and Instructor designation remain denied. Hosted browser
moderation proof remains pending.

Final review identified that an old Instructor Restore form can restore content
edited since the page was opened. D-015 requires version checks at protected
writes, but the current moderation function has no expected-version argument.
The [owner question](https://github.com/vibies-club/vibies/issues/17#issuecomment-5625343850)
asks whether Hide/Restore must match the version displayed to the Instructor.
The live moderation check is paused for that answer. The other review finding,
a missing route-level Instructor check, was corrected with the existing
`accessState()` helper. Both the route and SQL now verify the current Instructor.
A clean build and a fresh 134-check HTTP run pass after that fix. The reviewer
confirmed the route fix. The version decision is the remaining review finding.

## Acceptance rows

| Row | Evidence and remaining work | Status |
| --- | --- | --- |
| P1 | [HTTP proof](../scripts/check-projects-web.mjs) passes the synthetic journey. Live receipts above show eligible private selection, publication and onboarding, Scout's list with a human-confirmed direct read, and Guide's list and direct page. | Local and live PASS |
| P2 | [Database tests](../tests/projects-database.test.ts) and HTTP proof pass signed-out, unapproved, revoked, expired, Instructor owner-action, wrong-owner, and cross-origin denial. | Local PASS |
| P3 | [Provider tests](../tests/project-github.test.ts) pass public, organization, wrong-owner, missing, suspended, All repositories, renamed/mismatched account, later pages, unrelated installations, and incomplete or malformed scans. HTTP checks confirm ineligible results create no project. | Local PASS |
| P4 | Database and HTTP checks pass duplicate connection, unchanged details, competing last-place requests, and capacity enforcement. The database counts all retained rows. | Local PASS |
| P5 | Database checks pass atomic publication/onboarding, trigger-injected failure rollback, and concurrent/repeated publication. HTTP checks pass repeated publication with no stored changes. | Local PASS |
| P6 | Database and HTTP checks pass Hidden publication and unavailable direct reads. Instructor reads pass for available projects and Hidden targets; Visible Draft, Archived, and Disconnected targets stay unavailable. | Local PASS |
| P7 | Database and HTTP checks pass invalid ownership, missing IDs, Archived, Disconnected, and submitted Class-kind attempts. The schema stores Personal Projects only. | Local PASS |
| P8 | Provider and HTTP checks pass Unknown no-change results, confirmed loss saving Disconnected, and direct requests with untrusted browser verification fields. | Local PASS |
| P9 | Database and HTTP checks pass explicit loss detection, same-repository restoration, retained publication/moderation, and unavailable Hidden/Archived states. Live selected-access loss and same-project restoration pass above. | Local and live PASS |
| P10 | Database tests pass owner Edit in every retained state with only details, update time, and concurrency version changed. HTTP proof passes Draft/Published edits, maximum Unicode fields and 32,768-byte forms, overflow/control/URL/cross-origin rejection, escaping, link removal, and a server-fetch tripwire for demo destinations. | Local PASS |
| P11 | Database and HTTP proof pass title/warning/Cancel/Confirm controls, no write without confirmation, physical owned deletion, capacity recovery, safe retries/concurrent deletion, new ID on reconnect, and retained onboarding after deletion/revocation/reapproval. GitHub is not called for Edit or Delete. | Local PASS |
| P12 | Database proof covers old contexts after Edit/Delete/newer checks and owner writes ordered against revocation. HTTP proof holds a real Check request in the synthetic provider, completes Edit or Delete, then releases the response and verifies it cannot overwrite the edit or recreate the deleted project. | Local PASS |
| P13 | Database tests pass UUID backfill and stability, runtime/anonymous grant denial, and private shared projection. HTTP responses and stored rows contain no synthetic provider identity/token markers. The clean browser bundle scan passes. | Local PASS |
| P14 | Typecheck, 24 offline tests, 10 access tests, 26 project tests, 134 HTTP assertions, clean build, 176 local links, and Mermaid render pass. The public demo remains available. | Local PASS |
| P15 | Real Member access, eligible private selection, publication, onboarding, Community reads, signed-out denial, selected-access loss, and same-project restoration pass above. | Live PASS |
| P16 | Database and HTTP proof pass Instructor-only Hide/Restore, generic unauthorized and cross-origin denial, reachable Hidden targets, unchanged details/timestamps/publication/connection/onboarding, same-state no-ops, and late owner-check rejection. Restored Draft, Archived, and Disconnected fixtures remain unavailable. | Local checks pass; final review findings open |

## Merge gate

The first-stage diff contains the expected project UI, server checks, private
SQL, tests, CI, and approved documentation changes. Review found no unrelated
files or dependency changes. A scan of all 30 changed files found no environment
files, static private keys, live-token patterns, or database passwords. The
first stage matches the approved plan and both owner clarifications. The clean
build passes. First-stage live Preview acceptance passes. Edit/Delete local proof passes.
Local checks pass, but the final moderation review findings and hosted check
remain open. The merge gate is incomplete.
No row is complete because a check was skipped. A Member review and all remaining
proof are required before the Instructor merges.
