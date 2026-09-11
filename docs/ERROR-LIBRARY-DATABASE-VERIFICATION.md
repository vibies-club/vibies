# Error Library database verification

[Documentation home](../README.md) ·
[Parent issue #27](https://github.com/vibies-club/vibies/issues/27) ·
[Database issue #31](https://github.com/vibies-club/vibies/issues/31) ·
[Owner amendment](https://github.com/vibies-club/vibies/issues/31#issuecomment-5630366081) ·
[Database deployment](DATABASE-DEPLOYMENT.md)

This record covers the database-only delivery for issue #31. It records local
schema, function, privacy, migration, and regression proof. It makes no claim
that Error Library pages, forms, HTTP routes, or a live browser journey exist.
Those features belong to the later app issue.

All test content uses synthetic numeric identifiers and the Nicknames
`FirstGuide`, `Guide`, `Builder`, `Reader`, `Paused`, `Sleeper`, `Former`, and
`Synthetic`.
No environment file, credential, real identity, or Production row was read or
written for this proof.

The current schema source is [access.sql](../supabase/access.sql). Its issue #31
deployment snapshot is
[20260911065302_access.sql](../supabase/migrations/20260911065302_access.sql).

## Contract amendment

The owner amendment adds three validated list scopes and one private reaction
state:

- `visible` returns normal Community results.
- `mine` derives the author from the current Session and returns that author's
  Visible and Hidden entries.
- `hidden` returns Hidden entries to the current Instructor only.
- Direct reads return `helpfulByMe` for the requesting actor only.
- Opaque entry IDs and the `updated_at` plus entry ID cursor are routing
  metadata. Actor identifiers remain private.

The database tests cover the amendment's Skeptic boundaries. A Member's
`hidden` scope is forbidden. `mine` has no caller-supplied actor identifier.
Visibility is applied before search segment selection. Lists return entry IDs
and the stable cursor. Direct reads calculate `helpfulByMe` for the current
actor without returning reaction identity.

## Local receipts

Checks used Node.js 24.15.0. Database commands used the disposable PostgreSQL
17 loopback fixture named `vibies_access_test`. The fixture URL stayed in the
command process and is omitted from this record.

| Check | Status | Receipt |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript completed with no errors after the final privacy regression update. |
| `npm test` | PASS | 24 tests passed with zero failures and zero skips. |
| `npm run build` | PASS | The current Next.js production build completed on Node.js 24.15.0. This is a build receipt only. It is not a live Error Library page receipt. |
| `npm run test:access` | PASS | 10 tests passed with zero skips after the additive Error Library schema was applied. |
| `npm run test:projects` | PASS | 26 tests passed with zero skips after the additive Error Library schema was applied. |
| `npm run test:errors` | PASS | 9 tests passed with zero skips: the parent test and eight database scenario groups. The final run includes the independent privacy review regressions. |
| `npm run test:errors` without `VIBIES_TEST_DATABASE_URL` | EXPECTED FAILURE | Exit code 1, one explicit fixture failure, and zero skipped tests. Missing database proof cannot report success. |
| `npm run check:access-web` | PASS | The built-server access and project regression passed 140 HTTP checks against isolated loopback fixtures with the synthetic provider hook. The first server start omitted the test-origin setting and the fixture guard refused it. The corrected process-only setup passed without an application change. This is existing-app compatibility proof. It is not Error Library route proof. |
| `node --test tests/migrations.test.mjs` | PASS | The migration fixture passed 1 of 1 tests. |
| `npm run check:migrations -- --base a5fabc1893ae34e17653301d2167dd600e18b8b9` | PASS | The history and snapshot guard accepted all four migration files, including `20260911065302`. The three existing migrations are unchanged. |
| `npm run check:database-migrations` | PASS | Supabase CLI 2.109.1 and PostgreSQL 17.6 applied all four migrations through `20260911065302`. Blank apply, no-op, legacy upgrade, main-shape adoption, failure rollback, corrected retry, and final reset passed. |
| `git diff --check` for the Error Library test files | PASS | No whitespace error was reported. |

The native local migration proof found 24 runtime function grants and zero
runtime table grants. Existing synthetic fields stayed equal in JSON comparisons
during the legacy and current-main upgrades. The legacy upgrade adds the Member
account UUID and Instructor actor UUID. The current-main upgrade adds only the
Instructor actor UUID. A repeat apply retained Error Library entries and Helpful
reactions. The deliberate failed migration returned SQLSTATE `22012` and left no
table or migration-history row. The corrected retry recorded one version. The
final reset returned the disposable database to the clean four-migration chain.

## Database test groups

The exact groups in
[errors-database.test.ts](../tests/errors-database.test.ts) are:

| Test group | Proven behavior |
| --- | --- |
| `schema access is private and Instructor actor replacement keeps attribution` | Private tables and helpers stay unavailable to runtime and public roles. Runtime has the seven new Error Library API calls. Same-account designation keeps the Instructor actor. Replacement rotates it, keeps old attribution and reactions, denies inherited author rights, and permits current Instructor moderation. |
| `only current approved actors can use the Error Library` | Approved Members, onboarding Members, and the Instructor can create, list, and read. Signed-out, expired, unapproved, revoked, and Former Member Sessions receive safe denial. The Instructor can edit and delete an entry that the Instructor authored. |
| `field validation, normalization, privacy categories, and duplicate text are atomic` | All six fields enforce Unicode code-point limits and controls. ASCII outer spaces and line endings normalize as specified. Literal markup characters stay plain text. Exact duplicate text can coexist. Privacy confirmation is required. Safe public HTTPS documentation URLs pass. Unsafe requests return only a stable category and write no partial entry or edit. |
| `visible search is literal across all fields with stable 21-row pagination` | Blank and nonblank search, Unicode case folding, all six search fields, `%`, `_`, and `\` literals, empty results, 160-code-point segments, deterministic equal-time order, and the 20 plus 1 keyset cursor pass. |
| `mine and Instructor hidden scopes protect direct reads and moderation notes` | `mine` includes the current author's Visible and Hidden entries. Instructor `hidden` search works. Member `hidden` access fails. Other direct Hidden reads and reactions return safe missing results. Hide and Restore require the current version. Notes validate and remain private. Hidden author edits keep state and active notes. |
| `Helpful reactions are private, idempotent, concurrent, and access-aware` | Add and Remove are idempotent. Concurrent adds keep one actor row. Counts do not change entry order, version, or update time. Hide and Restore retain reactions. Revocation removes a reaction from the active count while retaining its row. Reapproval restores the count and `helpfulByMe`. |
| `author edit and delete protect ownership, versions, retained rows, and cascade cleanup` | All written fields edit together. Wrong-owner, Instructor rewrite, stale, repeated, revoked, and competing requests preserve the correct row. Confirmation is required. One competing Delete wins, later requests fail safely, and deletion cascades to reactions. |
| `database constraints and function responses keep identity private` | Table state, time, version, text, and privacy checks reject direct invalid writes. Required indexes exist. List and read responses exclude GitHub identity, Session hashes, actor UUIDs, and reaction identity. |

The privacy matrix includes all accepted stable categories and the later
independent review cases:

- standard and encrypted private-key headers;
- recognized token forms;
- email addresses and secret-bearing environment assignments;
- password-bearing database URLs;
- Unix and Windows home paths, including paths after `=`;
- URL credentials and literal or percent-escaped sensitive query names;
- local hosts, private IPv4 ranges, integer, hexadecimal, octal, shortened, and
  trailing-dot IPv4 forms;
- expanded and compressed IPv6 loopback forms;
- IPv4-mapped IPv6 loopback, private, link-local, and zero addresses;
- percent-encoded local hosts and malformed numeric or bracketed IP authorities;
  and
- non-HTTPS URLs.

Synthetic documentation IPv4 and IPv6 URLs, an encoded HTTPS path, and an
encoded nonsensitive query value pass. The database performs no URL fetch.

## Issue #31 acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| **AC1: Instructor actor identity** | LOCAL PASS | `schema access is private and Instructor actor replacement keeps attribution` proves stable same-account identity, rotation on replacement, retained attribution, denied inherited edit and delete, and current Instructor moderation. |
| **AC2: Entry and reaction constraints** | LOCAL PASS | The schema and identity group, Helpful group, lifecycle group, and database constraints group prove entry fields, moderation notes, times, positive versions, unique reactions, and deletion cascade. |
| **AC3: Text and privacy enforcement** | LOCAL PASS | `field validation, normalization, privacy categories, and duplicate text are atomic` proves confirmation, normalization, Unicode limits, controls, literal plain text, safe HTTPS, and every automatic privacy category on Create and Edit. The Hidden-scope group proves moderation-note validation and privacy checks. |
| **AC4: Safe and atomic privacy failures** | LOCAL PASS | Every privacy result contains only `kind` and `category`. Tests assert that the submitted probe is absent and that failed Create, Edit, and moderation requests leave stored rows unchanged. |
| **AC5: Access states** | LOCAL PASS | `only current approved actors can use the Error Library` covers Instructor, approved Member, onboarding Member, signed-out, expired, unapproved, revoked, and Former Member Sessions across reads and writes. |
| **AC6: Browse, search, and pagination** | LOCAL PASS | The visible-search group proves recent and blank reads, literal case-insensitive search over all six fields, safe 160-code-point segments, empty results, exact equal-time ordering, and 21-row keyset pagination. |
| **AC7: Visible and Hidden reads** | LOCAL PASS | The Hidden-scope group proves normal Visible reads, author and Instructor Hidden reads with active notes, safe missing results for another Member, and private `mine` and `hidden` lists. |
| **AC8: Author Edit and Delete** | LOCAL PASS | The Hidden-scope and lifecycle groups prove access, ownership, expected version, all-field edit, retained Hidden state and notes, confirmation, stale and repeated calls, competing requests, revocation, physical deletion, and reaction cleanup. |
| **AC9: Instructor moderation** | LOCAL PASS | The Hidden-scope group proves Instructor-only Hide and Restore, note validation, expected versions, concurrent and stale forms, same-state no-ops, cleared notes on Restore, and unchanged entry text during moderation. |
| **AC10: Helpful lifecycle** | LOCAL PASS | The Helpful group proves idempotent and concurrent Add and Remove, active-only counts, private `helpfulByMe`, unchanged entry version, time and order, retained reactions through moderation, revocation exclusion, and reapproval restoration. |
| **AC11: Response and grant privacy** | LOCAL PASS | The schema and response-privacy groups prove no direct private table rights for runtime, public, anonymous, or authenticated roles. Runtime receives only the seven new Error Library API functions. Responses exclude GitHub identity, actor identity, reaction identity, and Session hashes. |
| **AC12: Required database matrix** | LOCAL PASS | The eight named scenario groups collectively cover the required roles, replacement, privacy, limits, metacharacters, all fields, 21-row cursor, ownership, competing requests, Hidden access, reactions, revocation, reapproval, cascade, and retained rows. |
| **AC13: Migration and regression proof** | PRE-MERGE PASS | The snapshot fixture, four-file history guard, native local four-migration chain, blank and no-op apply, legacy and main-shape adoption, retained rows, 24 grants, rollback, corrected retry, typecheck, offline tests, existing access and project database tests, 140 built-server HTTP checks, and build pass locally. Hosted CI, documentation links, and native Supabase Preview also passed at implementation commit `7253f8f`, as recorded below. |
| **AC14: Database-only PR boundary** | PASS | Root review found 11 expected paths: SQL, snapshot, database tests and their CI commands, migration checks, this proof, and the setup guide correction for the already approved 24-function API. The guide also links this proof and names the third database test command. No app page, route, browser component, dependency, credential, real identity, or Production data is added. The diff and whitespace checks pass. |
| **AC15: Reviewed merge and Production** | PENDING | Production deployment and migration-history proof can start only after Member review and the Instructor's merge. No local or Preview receipt can satisfy this criterion. |

## Hosted receipts and remaining checks

Pending rows must stay pending until the named check completes. A skipped or
cancelled check is not proof.

| Check | Status | Receipt to add |
| --- | --- | --- |
| Existing built-server HTTP regression | PASS | 140 access and project HTTP checks passed with loopback databases and the synthetic provider hook. The database-only PR has no Error Library HTTP route or browser journey. |
| GitHub `app-check` | PASS at `7253f8f` | [CI run](https://github.com/vibies-club/vibies/actions/runs/34572544259/job/103177606145): 24 offline, 10 access, 26 project, and 9 Error Library tests; zero skips; typecheck, build, and 140 HTTP checks passed. |
| GitHub `migration-check` | PASS at `7253f8f` | [CI run](https://github.com/vibies-club/vibies/actions/runs/34572544251/job/103177606258): immutable snapshots, full native migration proof, and disposable database cleanup passed. |
| GitHub documentation check | PASS at `7253f8f` | [CI run](https://github.com/vibies-club/vibies/actions/runs/34572544173/job/103177606045): 279 links considered, 207 successful, zero errors. External links excluded by the offline policy are not live proof. This change adds no Mermaid diagram. |
| Vercel build | PASS at `7253f8f` | [Ready Preview deployment](https://vercel.com/beta-momo/vibies/Aja9yRJNqacSQ5DvRbd68VCgwnLY). This proves existing-app deployment compatibility, not Error Library browser behavior. |
| Native Supabase Preview migration | PASS at `7253f8f` | The [native Preview check](https://supabase.com/dashboard/project/asoanwhbfhuwpgqbztpc) passed. Its migration page shows exactly `20260910065142`, `20260910220000`, `20260910220001`, and `20260911065302`. A read-only SQL Editor catalog check returned 24 runtime functions, zero runtime table grants, NOLOGIN/NOINHERIT, no anonymous or authenticated private schema access, both Error Library tables present, and the unchanged anonymous demo read-only boundary. Row-retention evidence comes from the local and CI upgrade fixtures above. |
| Member review and merge gate | PENDING | Add the approving review, exact reviewed commit, expected-file review, unrelated-change review, privacy scan, all required checks, and merge record. |
| Production migration | PENDING AFTER MERGE | Add the main deployment result, exact history through `20260911065302`, retained row checks, runtime grants, and date. Keep all account and Session values private. |

The implementation receipts above are dated 2026-09-11 UTC. Final review must
also check the latest PR head after documentation updates. The database child
remains incomplete while review, merge, and Production receipts are pending. The later app child remains blocked until the reviewed database merge
and Production migration pass.
