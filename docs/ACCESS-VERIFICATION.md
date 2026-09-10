# Access Verification

[Documentation home](../README.md) · [Issue #14](https://github.com/vibies-club/vibies/issues/14) ·
[Access setup](ACCESS-SETUP.md)

This is the proof record for issue #5. Record the command or human procedure and
the observed result for every acceptance check. Use synthetic identifiers and
Nicknames. Never record a credential, GitHub profile, real name, contact detail,
or private recovery reason.

Local results below were rechecked on 2026-09-10 using synthetic accounts.
Hosted Preview and real GitHub results remain pending until human setup is complete.
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
fixture client. This last result proves the local redirect only; real GitHub
authorization and callback remain pending. The Instructor phone view at 390 by
844 pixels has no horizontal overflow.

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
| `npm test` | PASS: 9 tests | Core access, OAuth failure, identity projection, nickname, and existing demo checks. |
| `npm run test:access` against `vibies_access_test` | PASS: 10 tests, no skips | PostgreSQL 17: nine scenario groups plus their parent test, including a full migration under a non-superuser owner, real concurrent approvals, and sign-in starts. |
| `npm run check:access-web` against `vibies_access_web_test` | PASS: 40 HTTP checks | Production Next.js build, dedicated runtime login, synthetic sessions, direct requests, form-compatible page policy, private OAuth redirects, revocation, expiry, and forced database failures. Now included in `app-check` CI. |
| `npm run typecheck` | PASS | TypeScript completed with no errors. |
| `npm run build` with access configuration absent | PASS | Node.js 24.15.0 and Next.js 16.3.4 Turbopack. Clean temporary copy excluded all environment files; all private routes are dynamic. |
| Links and Mermaid rendering | PASS | 145 local Markdown links resolved, including fragments. Mermaid CLI rendered the domain graph to SVG with installed Chrome. |

## Issue #14 acceptance record

| Check | Procedure | Observed result | Receipt |
| --- | --- | --- | --- |
| **A1: Instructor setup** | On clean staging, designate the verified Instructor before opening sign-in. Sign in as that account, then as a different first visitor. Compare the active Member count before and after. | Local database setup and Instructor exclusion pass. Real designated-account sign-in pending. | Automated commands above; live procedures remain as stated. |
| **A2: Account matching** | In the database proof, sign in twice with one stable identifier, change only its GitHub username, then use a different identifier. Confirm one reused entry, preserved approval, and no inherited approval. | PASS locally: stable ID reuses the account; rename preserves approval; distinct IDs remain unapproved. | Automated commands above; live procedures remain as stated. |
| **A3: Unapproved access** | Complete first real sign-in with an unknown test account. Confirm one unapproved entry, access denied, and sign-out. Use the HTTP fixture to request `/welcome` and a Member action directly with that Session. | Local database and HTTP denial checks pass. First real GitHub sign-in pending. | Automated commands above; live procedures remain as stated. |
| **A4: Administration boundary** | Open `/admin/members` and submit each administration action as Instructor, Member, unapproved, revoked, and signed-out fixtures. Confirm only the Instructor can read account details or change state. Repeat the page check in Preview. | Local database and direct HTTP checks pass for all access states. Hosted Preview pending. | Automated commands above; live procedures remain as stated. |
| **A5: Approval and landing** | Approve an identified unapproved account with a valid agreed Nickname. Sign in as that Member and open `/welcome`. Confirm it shows the Nickname, allows browsing with incomplete onboarding, and does not mark onboarding complete. | Local approval and welcome checks pass; onboarding stays false. Real GitHub and Preview pending. | Automated commands above; live procedures remain as stated. |
| **A6: Capacity** | Run the database proof for seven active Members, an eighth rejection, two competing approvals from a count of six, repeated submissions, and the Instructor exclusion. Confirm only one competing approval succeeds and no duplicate is created. | PASS: seven allowed, competing approvals from six yield one success and one full result; Instructor excluded. | Automated commands above; live procedures remain as stated. |
| **A7: Nicknames** | Run unit and database checks for outer ASCII-space trimming, Unicode code-point length, Unicode letters and decimal digits, rejected other number categories, case-insensitive duplicates, revoked reservations, and no Membership after rejection. Run the staging locale parity check. In Preview, confirm the privacy instruction appears before approval. | Unit/database validation and reservation checks pass. UTF-8 letters, letter numbers, decimal digits, and case-insensitive duplicates checked. Local privacy instruction verified; staging locale and Preview pending. | Automated commands above; live procedures remain as stated. |
| **A8: Identity privacy** | Inspect Member pages and responses for Nicknames only. Confirm only the Instructor page contains GitHub username and stable identifier. Inspect the private table columns and server bundle to confirm no profile name, avatar, email, biography, OAuth token, or secret is stored or sent to the browser. | Local identity projection, private role denial, and nickname-only HTTP responses pass. Live provider and hosted verification pending. Local browser bundles contain no private schema or server configuration markers. | Automated commands above; live procedures remain as stated. |
| **A9: Revocation** | With an active Member Session, cancel revocation and confirm no change. Confirm revocation, then make a protected request and action from the existing browser. Compare active count, Role, ownership, authorship, content states, and onboarding fields before and after. | Local confirmation and next-request denial pass while the session remains valid. Nickname and onboarding are retained. Project/content tables are not implemented in this feature; their live workflows are outside this proof. | Automated commands above; live procedures remain as stated. |
| **A10: Reapproval** | Reapprove the revoked fixture with an available place. Confirm the existing Session regains access and the same Nickname, onboarding value, ownership, and authorship remain. Confirm no new ownership row appears. | PASS for existing access records: full-capacity rejection, same nickname, and completed onboarding retained on reapproval. No ownership or content tables are added or changed. | Automated commands above; live procedures remain as stated. |
| **A11: Dismissal** | Dismiss an unapproved entry and confirm it is removed without access. Sign in again and confirm one entry returns. Attempt dismissal on a revoked Member and confirm the Membership and retained state remain. | PASS: unapproved entry removed, later sign-in recreates it; revoked dismissal rejected. | Automated commands above; live procedures remain as stated. |
| **A12: Session lifetime and sign-out** | Move a synthetic Session to the 24-hour boundary and request a protected page. In Preview, sign out and retry a protected request from that browser. Confirm every signed-in page offers sign-out and approval remains unchanged. | Local absolute expiry, sign-out, and cookie cleanup during database failure pass. Hosted cookie/browser proof pending. | Automated commands above; live procedures remain as stated. |
| **A13: Failure behavior** | Cancel real GitHub sign-in. Exercise invalid, expired, replayed, and provider-error callbacks. Force a Membership lookup failure in the isolated fixture. Confirm each path denies access, offers a safe retry, hides private data and raw details, and does not claim revocation without a lookup. | Local HTTP and unit failure checks pass, including 200-error response, cancellation callback, replay, and lookup failure. Real GitHub cancellation pending. | Automated commands above; live procedures remain as stated. |
| **A14: Sign-in limit** | Start sign-in 11 times within 10 minutes using one fixture browser, including concurrent starts. Confirm the first 10 redirects are allowed, later starts show retry, and repeated successful sign-ins reuse one Access entry. | PASS: ten starts allowed, eleventh denied; concurrent database starts also yield exactly ten successes; expiry permits retry. | Automated commands above; live procedures remain as stated. |
| **A15: Public demo separation** | As a signed-out Preview visitor, open `/` and `/demo`, follow the `/sign-in` link, and request each private route directly. Confirm the demo remains public and provides no path into private content. | Local public demo and private-route denial pass. Hosted Preview pending. | Automated commands above; live procedures remain as stated. |
| **A16: Recovery** | On clean staging, verify a separate replacement outside Vibies and record the reason privately. First try a Member target and confirm rejection. Designate the valid replacement, then retry a protected request from the old Instructor Session. Confirm one Instructor, no old access, unchanged Member count, invalidated affected Sessions, and no self-service transfer path. Restore the intended staging Instructor through the same verified procedure. | Local owner-only replacement, audit, invalidation, and count preservation pass. Trusted-channel staging recovery exercise pending. | Automated commands above; live procedures remain as stated. |

## Merge gate record

| Gate | Observed result | Receipt |
| --- | --- | --- |
| Expected files only | PASS | Diff reviewed: access routes, private SQL, checks, scoped styles, dependencies, CI, and required documentation. |
| Nothing unrelated | PASS | Public demo query and grants remain unchanged; no project or discussion feature added. |
| No secrets or personal data | PASS | Staged diff and browser bundle scanned; only synthetic fixtures and placeholder configuration appear. No environment files read or staged. |
| Matches the approved plan | PASS | Root review reconciled both worker results and all Skeptic findings. |
| Build succeeded | PASS | Production build, typecheck, unit tests, PostgreSQL tests, HTTP checks, links, and Mermaid rendering. |
| Preview satisfies A1 through A16 | BLOCKED: human setup and live verification required | GitHub OAuth, private staging database/runtime login, Instructor designation, and four server configuration values must be supplied by the human owner. Keep the PR draft until the live checklist passes. |
