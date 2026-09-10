# Access Verification

[Documentation home](../README.md) · [Issue #14](https://github.com/vibies-club/vibies/issues/14) ·
[Access setup](ACCESS-SETUP.md)

This is the proof record for issue #5. Record the command or human procedure and
the observed result for every acceptance check. Use synthetic identifiers and
Nicknames. Never record a credential, GitHub profile, real name, contact detail,
or private recovery reason.

Local results below were rechecked on 2026-09-10 using synthetic accounts.
Hosted staging is configured. Real Instructor sign-in and cancellation pass.
The complete separate-account Member and trusted recovery receipts remain pending.
Change a pending entry only after its procedure completes and attach a privacy-safe receipt in the PR. A hidden control is insufficient proof;
direct protected requests and actions must also be denied.

## Skeptic findings

The required Skeptic pass found eight risks. The approved plan has a resolution
for each risk. Verification is still required.

| Risk found | Required resolution | Proof target |
| --- | --- | --- |
| OAuth cancellation, token errors, CSRF, code interception, or callback replay could create access. | Use a one-use database OAuth state bound to the browser and PKCE verifier. Expire it after 10 minutes and consume it atomically. Treat GitHub HTTP 200 responses with an `error` as failure. Request no scope and project only validated `id` and `login` from the transient profile response. | Callback unit checks, replay web check, and real GitHub cancellation. |
| Repeated clicks and concurrent starts could exceed the browser limit. | Store only a random browser-cookie hash. Count the rolling 10-minute window atomically before redirect, allow 10 starts, reject later starts, and clean expired rows during use. | Database race check and 11-start web check. |
| A rolling token or stolen database value could outlive the required Session. | Put a random opaque value in an HttpOnly, Secure, SameSite=Lax host cookie. Store only its hash, enforce 24 hours from creation on every request and action, rotate it at sign-in, and delete it at sign-out. | Hash inspection, expiry web check, sign-out check, and Preview cookie inspection. |
| Concurrent approvals or Nickname checks could create eight active Members or duplicates. | Lock the singleton Community row and save capacity, status, and case-insensitive Nickname uniqueness in one transaction. Make repeated actions idempotent. | Database capacity, concurrency, and duplicate checks. |
| Dismissal or recovery could erase retained Membership or create a second Instructor. | Permit dismissal only for unapproved entries. Keep recovery owner-only, lock the singleton, reject Member targets, invalidate affected Sessions, preserve the Member count, and write the reason privately. | Database state checks and the clean-staging recovery exercise. |
| Database or configuration failure could reveal data or grant access. | Deny access on every lookup failure, return a safe retry, keep `/demo` on its own anonymous client, and never print configuration. | Forced lookup failure, missing-configuration build, and public demo check. |
| A browser or public Data API role could reach private access records. | Keep records and functions in `vibies_private`. Give the `vibies_runtime` `NOLOGIN` role function execution only. Keep schema, tables, recovery, owner credentials, and service-role keys away from the browser. | Catalog grants, direct-role denial, bundle inspection, and direct administration requests. |
| Unit tests alone could miss route, race, expiry, revocation, and real-provider behavior. | Combine core unit checks, database checks, local HTTP fixtures, and human real GitHub, Preview, and recovery procedures. | Commands below and A1 through A16 receipts. |

No product blocker remained after these resolutions were added to the plan.

### Browser form regression found during PR completion

The native Instructor approval form returned HTTP 403 even though all 38 original
HTTP checks passed. The global `no-referrer` policy caused browser form POSTs to
send a null Origin. The HTTP fixture supplied its own Origin and missed this
failure. See the [browser policy reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header).

Pages now use `same-origin`, which preserves the Origin needed by the form guard
and sends no referrer to other origins. The `/auth/*` header rule retains
`no-referrer` for OAuth redirects; Next.js applies configured headers after the
route response, so the route helper alone cannot override the page policy.
The guard still rejects null and foreign origins. The HTTP proof checks the page
policy, and the unit proof explicitly rejects a null Origin.

Browser receipt: the same synthetic approval form now saves `Learner` and returns
to `/admin/members?message=ok`. Native sign-out returns to
`/sign-in?message=signedout`. The native sign-in form reaches GitHub with the
fixture client. This local result proves the redirect only. The real GitHub callback also
passed during the hosted staging procedure below. The Instructor phone view at 390 by
844 pixels has no horizontal overflow.

## Status-message regression found during Member review

On 2026-09-10, the original PR head `db8274d` was built in a clean temporary
copy that excluded environment files. The local server used only the isolated
`vibies_access_web_test` database and synthetic browser and Instructor Sessions.
Manual-redirect HTTP requests reproduced the review finding on both `/sign-in`
and `/admin/members`:

| Message query value | Original build | Fixed build |
| --- | --- | --- |
| `__proto__`, `constructor`, `toString` | HTTP 500 on both pages | HTTP 200 on both pages, no status message |
| `unknown` | HTTP 200, no status message | HTTP 200, no status message |
| `failed` on sign-in; `ok` on administration | HTTP 200 with the expected status message | HTTP 200 with the expected status message |

Both pages now use `Object.hasOwn` before rendering a URL-selected message.
`npm run check:access-web` checks all ten requests above and requires HTTP 200
with either the expected status text or no status element. Redirects cannot pass
these checks. The full fixed-build run passed all 50 HTTP checks. Typecheck,
10 unit tests, 10 PostgreSQL tests without skips, and the production build also
passed. The original code was not changed during reproduction.

## Session 10 alignment

The Session 10 slides were checked on 2026-09-10. This PR demonstrates identity,
permission checks, denied direct requests, and the six-check merge gate. Use the
following corrections when teaching this PR from that deck:

| Slide topic | Implemented behavior in this PR |
| --- | --- |
| GitHub sign-in through Supabase Auth and `@supabase/ssr` | Direct GitHub OAuth with PKCE. The server checks an opaque Session through the private database API. See [D-014](DECISIONS.md#d-014-use-direct-github-oauth-and-a-private-database-api). |
| `auth.users.id`, `public.members`, and a self-created Nickname | A stable GitHub account ID identifies an unapproved entry. The Instructor approves access with a Member-agreed Nickname. See [people and access](DOMAIN.md#people-and-access). |
| Public `projects` table and visitor-readable saved project pages | The only public data is the synthetic `public.demo_projects` row. See [Demo data model](DATA-MODEL.md). Product publishing and ownership are outside the approved scope of [issue #5](https://github.com/vibies-club/vibies/issues/5). |
| Ownership RLS rejects another Member's project insert | This PR proves access permissions through function-only database grants, Instructor-only actions, capacity checks, and immediate revocation. It has no project insert route or ownership policy. |

The slides' complete publishing journey cannot be demonstrated with this PR.
For this access walkthrough, use sign-in, unapproved denial, Instructor approval,
Member welcome, revocation, and sign-out. Keep Preview proof before merge and
Production proof after the reviewed merge.

## Automated receipts

Run these checks as described in [Access setup](ACCESS-SETUP.md). Record the pass
count or build result, with no environment values.

| Check | Observed result | Receipt |
| --- | --- | --- |
| `npm test` | PASS: 10 tests | Core access, OAuth failure, identity projection, nickname, and existing demo checks. |
| `npm run test:access` against `vibies_access_test` | PASS: 10 tests, no skips | PostgreSQL 17: nine scenario groups plus their parent test, including a full migration under a non-superuser owner, real concurrent approvals, and sign-in starts. |
| `npm run check:access-web` against `vibies_access_web_test` | PASS: 50 HTTP checks | Production Next.js build, dedicated runtime login, synthetic sessions, direct requests, form-compatible page policy, private OAuth redirects, inherited message-key regression, revocation, expiry, and forced database failures. Now included in `app-check` CI. |
| `npm run typecheck` | PASS | TypeScript completed with no errors. |
| `npm run build` with access configuration absent | PASS | Node.js 24.15.0 and Next.js 16.3.4 Turbopack. Clean temporary copy excluded all environment files; all private routes are dynamic. |
| Links and Mermaid rendering | PASS | 145 local Markdown links resolved, including fragments. Mermaid CLI rendered the domain graph to SVG with installed Chrome. |

## Hosted staging receipts

### Member check and review follow-up on 2026-09-10

The owner reported that live testing was complete. A read-only query of
`vibies_private.accounts`, `community`, and `sessions` confirmed one approved
Member with incomplete onboarding, one designated Instructor, and one unexpired
Session for each. The Member Session was created at 11:32 UTC and the Instructor
Session at 11:29 UTC. No account identifiers or Session values are included here.

This confirms current database state. It does not show the earlier unknown-account
denial, the Member welcome page, or the Instructor replacement and restoration
procedure. The [Member review](https://github.com/vibies-club/vibies/pull/16#issuecomment-5618348112)
correctly identified this evidence gap. The PR's completed Preview checkbox was
premature. A1, A3, A5, and A16 need dated procedures and observed results before
the Preview gate can pass. The results below remain pending where indicated.

### Live recovery rejection check on 2026-09-10

At 12:32 UTC, the live Preview showed the intended Instructor's welcome page
and Member administration with one active Member. A read-only staging count
showed one Instructor, one approved Member, no unapproved accounts, no completed
onboarding records, and one Instructor audit entry.

The database owner interface called `designate_instructor` with the existing
approved Member selected from `accounts`, inside an explicit transaction with
rollback. PostgreSQL returned `P0001: An existing Member cannot be designated as
Instructor`. An explicit rollback and count query at 12:33 UTC showed the same
five counts. Reloading administration with the existing Instructor Session still
showed one active Member and allowed Instructor access.

This proves the live Member-target rejection part of A16. A separate verified
non-Member account is still required for replacement, old-Instructor denial,
and restoration. A1 and A3 need a real first-time account; A5 needs the approved
Member's own browser welcome-page result. None of those pending procedures is
replaced by this rejection check.

### Earlier hosted checks

Checked on 2026-09-10 at the fixed
[PR Preview](https://vibies-git-feature-sign-in-access-5-beta-momo.vercel.app/sign-in).
Vercel authentication still protects this Preview. The HTTP checks used existing
Preview access without changing that protection.

- The approved clean Supabase branch is `access-review-5`. The access SQL,
  including the locale correction, succeeded twice. Catalog checks found no
  public or runtime table grants, exactly seven runtime function grants, and no
  runtime Instructor-designation right.
- The dedicated server login connects with certificate and hostname verification.
  It can call the access API and cannot read private tables or designate an
  Instructor. All five access settings are scoped to Preview and
  `feature/sign-in-access-5`; the database URL and OAuth secret use secret storage.
- Real GitHub authorization displayed public-data-only access. Cancellation
  returned to sign-in. Successful authorization and repeat sign-in reached the
  Instructor welcome page. Administration showed zero active Members. Native
  sign-out returned to `message=signedout`; a direct welcome request then required
  sign-in again.
- All 34 hosted HTTP checks passed with temporary synthetic accounts and Sessions:
  public demo, private route and action denial, Instructor privacy instruction,
  approval with `BuilderⅣ`, nickname-only welcome, revocation confirmation,
  next-request denial, reapproval, retained onboarding, 24-hour expiry, sign-out,
  invalid callback, and the 11-request sign-in limit. The synthetic accounts,
  Sessions, OAuth flows, and attempt records were removed afterwards.
- Hosted nickname parity passed for ASCII, accented letters, Persian decimal
  digits, Roman and other letter numbers, rejected fractions and superscripts,
  and rejected combining marks. The deployed browser script scan found no private
  schema, database configuration, OAuth secret, or certificate markers.

Two hosted-only defects were corrected. Supabase required its public root CA,
which is now accepted without disabling TLS verification. Its default ICU locale
also classified nicknames differently from the local database. Validation and
case-insensitive uniqueness now use PostgreSQL's `unicode` collation explicitly;
the regex adds the Unicode letter-number ranges. The migration rebuilds the
nickname index inside its transaction. See
[PostgreSQL collation support](https://www.postgresql.org/docs/17/collation.html).

A synthetic account does not prove a second verified GitHub account's browser
flow. A real Member now has an approved entry and an unexpired Session, as recorded
above. Dated receipts for unknown-account denial, the Member welcome page, and
trusted replacement recovery remain required before merge. Review can continue
on this configured Preview. No claim below treats those procedures as passed.

## Issue #14 acceptance record

| Check | Procedure | Observed result | Receipt |
| --- | --- | --- | --- |
| **A1: Instructor setup** | On clean staging, designate the verified Instructor before opening sign-in. Sign in as that account, then as a different first visitor. Compare the active Member count before and after. | Hosted setup, real designated-Instructor sign-in, repeat sign-in, and zero Member count pass. A separate first visitor remains pending. | Automated commands above; live procedures remain as stated. |
| **A2: Account matching** | In the database proof, sign in twice with one stable identifier, change only its GitHub username, then use a different identifier. Confirm one reused entry, preserved approval, and no inherited approval. | PASS locally: stable ID reuses the account; rename preserves approval; distinct IDs remain unapproved. | Automated commands above; live procedures remain as stated. |
| **A3: Unapproved access** | Complete first real sign-in with an unknown test account. Confirm one unapproved entry, access denied, and sign-out. Use the HTTP fixture to request `/welcome` and a Member action directly with that Session. | Local and hosted synthetic denial checks pass. First real sign-in with an unknown GitHub account pending. | Automated commands above; live procedures remain as stated. |
| **A4: Administration boundary** | Open `/admin/members` and submit each administration action as Instructor, Member, unapproved, revoked, and signed-out fixtures. Confirm only the Instructor can read account details or change state. Repeat the page check in Preview. | PASS: local and hosted direct HTTP checks cover all access states. The real Instructor can open administration. | Automated commands above; live procedures remain as stated. |
| **A5: Approval and landing** | Approve an identified unapproved account with a valid agreed Nickname. Sign in as that Member and open `/welcome`. Confirm it shows the Nickname, allows browsing with incomplete onboarding, and does not mark onboarding complete. | Local and hosted synthetic approval and welcome pass; onboarding stays false. The read-only live check confirms one approved Member with an unexpired Session and onboarding false; the real welcome-page receipt remains pending. | Automated commands above; live procedures remain as stated. |
| **A6: Capacity** | Run the database proof for seven active Members, an eighth rejection, two competing approvals from a count of six, repeated submissions, and the Instructor exclusion. Confirm only one competing approval succeeds and no duplicate is created. | PASS: seven allowed, competing approvals from six yield one success and one full result; Instructor excluded. | Automated commands above; live procedures remain as stated. |
| **A7: Nicknames** | Run unit and database checks for outer ASCII-space trimming, Unicode code-point length, Unicode letters and decimal digits, rejected other number categories, case-insensitive duplicates, revoked reservations, and no Membership after rejection. Run the staging locale parity check. In Preview, confirm the privacy instruction appears before approval. | PASS: unit, database, hosted locale parity, Unicode approval, and Preview privacy instruction. Validation and uniqueness use an explicit collation. | Automated commands above; live procedures remain as stated. |
| **A8: Identity privacy** | Inspect Member pages and responses for Nicknames only. Confirm only the Instructor page contains GitHub username and stable identifier. Inspect the private table columns and server bundle to confirm no profile name, avatar, email, biography, OAuth token, or secret is stored or sent to the browser. | PASS for implemented storage and responses: real GitHub requests public data only; role denial, hosted nickname-only responses, and local/hosted browser bundle scans pass. | Automated commands above; live procedures remain as stated. |
| **A9: Revocation** | With an active Member Session, cancel revocation and confirm no change. Confirm revocation, then make a protected request and action from the existing browser. Compare active count, Role, ownership, authorship, content states, and onboarding fields before and after. | Local and hosted confirmation and next-request denial pass while the session remains valid. Nickname and onboarding are retained. Project/content tables are not implemented in this feature; their live workflows are outside this proof. | Automated commands above; live procedures remain as stated. |
| **A10: Reapproval** | Reapprove the revoked fixture with an available place. Confirm the existing Session regains access and the same Nickname, onboarding value, ownership, and authorship remain. Confirm no new ownership row appears. | PASS for existing access records: full-capacity rejection, same nickname, and completed onboarding retained on reapproval. No ownership or content tables are added or changed. | Automated commands above; live procedures remain as stated. |
| **A11: Dismissal** | Dismiss an unapproved entry and confirm it is removed without access. Sign in again and confirm one entry returns. Attempt dismissal on a revoked Member and confirm the Membership and retained state remain. | PASS: unapproved entry removed, later sign-in recreates it; revoked dismissal rejected. | Automated commands above; live procedures remain as stated. |
| **A12: Session lifetime and sign-out** | Move a synthetic Session to the 24-hour boundary and request a protected page. In Preview, sign out and retry a protected request from that browser. Confirm every signed-in page offers sign-out and approval remains unchanged. | PASS: local failure cleanup, hosted absolute expiry, hosted sign-out cookie deletion and session invalidation, and real browser sign-out with direct welcome denial. | Automated commands above; live procedures remain as stated. |
| **A13: Failure behavior** | Cancel real GitHub sign-in. Exercise invalid, expired, replayed, and provider-error callbacks. Force a Membership lookup failure in the isolated fixture. Confirm each path denies access, offers a safe retry, hides private data and raw details, and does not claim revocation without a lookup. | PASS: local callback, provider-error, replay, and lookup-failure checks; hosted invalid callback and real GitHub cancellation. | Automated commands above; live procedures remain as stated. |
| **A14: Sign-in limit** | Start sign-in 11 times within 10 minutes using one fixture browser, including concurrent starts. Confirm the first 10 redirects are allowed, later starts show retry, and repeated successful sign-ins reuse one Access entry. | PASS: ten starts allowed, eleventh denied; concurrent database starts also yield exactly ten successes; expiry permits retry. | Automated commands above; live procedures remain as stated. |
| **A15: Public demo separation** | As a signed-out Preview visitor, open `/` and `/demo`, follow the `/sign-in` link, and request each private route directly. Confirm the demo remains public and provides no path into private content. | PASS: local and hosted public demo and private-route denial. Hosted HTTP checks passed through unchanged Vercel Preview protection. | Automated commands above; live procedures remain as stated. |
| **A16: Recovery** | On clean staging, verify a separate replacement outside Vibies and record the reason privately. First try a Member target and confirm rejection. Designate the valid replacement, then retry a protected request from the old Instructor Session. Confirm one Instructor, no old access, unchanged Member count, invalidated affected Sessions, and no self-service transfer path. Restore the intended staging Instructor through the same verified procedure. | Local owner-only replacement, audit, invalidation, and count preservation pass. Hosted runtime recovery denial and the live Member-target rejection check above pass. Trusted-channel recovery with a separate verified participant remains pending. | Automated commands above; live procedures remain as stated. |

## Merge gate record

| Gate | Observed result | Receipt |
| --- | --- | --- |
| Expected files only | PASS | Diff reviewed: access routes, private SQL, checks, scoped styles, dependencies, CI, and required documentation. |
| Nothing unrelated | PASS | Public demo query and grants remain unchanged; no project or discussion feature added. |
| No secrets or personal data | PASS | Staged diff and browser bundle scanned; only synthetic fixtures and placeholder configuration appear. No environment files or credentials staged. Configuration was handled privately under the owner's one-run authorization. |
| Matches the approved plan | PASS | Root review reconciled both worker results and all Skeptic findings. |
| Build succeeded | PASS | Production build, typecheck, unit tests, PostgreSQL tests, HTTP checks, links, and Mermaid rendering. |
| Preview satisfies A1 through A16 | PARTIAL: ready for review, merge blocked | Setup, real Instructor OAuth, and 34 hosted synthetic checks pass. The Member review found missing dated receipts for A1, A3, A5, and A16. Current Member database state is confirmed, but the Preview gate stays pending until those procedures are recorded and the Member reviews the update. |
