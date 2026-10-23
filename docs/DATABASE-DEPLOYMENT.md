# Database migrations and deployment

[Documentation home](../README.md) · [Issue #29](https://github.com/vibies-club/vibies/issues/29) ·
[Issue #37](https://github.com/vibies-club/vibies/issues/37) ·
[Access setup](ACCESS-SETUP.md)

## Rollout status on 2026-10-15

Issue #61 implements the Cloudflare Workers/D1 replacement locally. Instructor
merge, hosted Preview PR and Clear proof, source-data reconciliation, production
activation, and live traffic cutover remain separate pending gates. No statement
below about historical Supabase/Vercel deployment proves Cloudflare is live.
Retain the source deployment, immutable migration history, and rollback access
until cutover is independently verified.

## What a merge deploys on the retained source stack

The [Supabase GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
applies new files in [supabase/migrations](../supabase/migrations) after a reviewed
merge to `main`. Supabase records each applied version. Later deployments skip
those versions. No production credential is stored in GitHub Actions.

This deploys database schema and its reviewed grants. It preserves existing main
data. It does not copy Preview accounts, Sessions, projects, approvals, or secrets.
Production runtime login, TLS, GitHub OAuth, the GitHub App, and initial Instructor
designation remain separate one-time setup. Follow [Access setup](ACCESS-SETUP.md)
and [Project setup](PROJECT-SETUP.md) for those settings.

Supabase and Vercel deploy independently. A schema change must work with the app
already deployed. When a new app requires new schema, merge its database-only PR
first, wait for successful database deployment, then merge the app PR. Keep old
functions until the old app no longer needs them.

For the [eight-Member capacity update](https://github.com/vibies-club/vibies/issues/39),
wait for both the new access migration and the matching Vercel app deployment
before approving or reapproving the eighth Member. Confirm the Member access
page shows a capacity of eight. The migration changes no existing account status.
An older app rejects a Member count of eight, so do not roll back to that app
after filling the eighth place; deploy a compatible correction instead.

Issue #20 keeps its database and application changes in one reviewed PR while
remaining safe during independent deployment. The existing application ignores
the new Roadmap fields and continues to use every existing private function. The
new application treats an absent Roadmap result as temporarily unavailable and
shows no Roadmap write controls until the migration is present. A direct early
Roadmap write fails safely. The feature is ready only after both the Supabase
migration and Vercel deployment pass.

For the initial rollout, PR #18 and PR #30 merged after Member review. Main now
holds five migration versions, ending with `20260913212638`; the earlier
three-version state at `a5fabc1` is recorded as history in the receipts below.
PR #30's Preview was removed, and the Production settings and Ready redeploy
passed. Live Production Member publishing remains pending while Builder is
offline. The issue #31 database work in PR #33 and the issue #32 Vercel cleanup
in PR #34 have separate reviews and deploy no new app feature. While automatic
branching was on, feature Preview cleanup at merge did not wait for Production
verification. Do not treat an early Vercel success as database proof.

## Add a database change

1. Change the current schema source, [access.sql](../supabase/access.sql) or
   [demo-projects.sql](../supabase/demo-projects.sql), on a feature branch.
2. Copy the changed file into `supabase/migrations/YYYYMMDDHHMMSS_access.sql` or
   `YYYYMMDDHHMMSS_demo_projects.sql`. Use a unique UTC timestamp greater than
   every existing migration version. Remove only its first `begin;` line and
   last `commit;` line. Keep every other byte unchanged. The native migration
   runner handles the transaction and records its history entry.
3. Run the checks below. Include the SQL source, new snapshot, and receipts in
   the same PR. Review the grants and data preservation as well as the new feature.
4. After the Instructor merges, inspect the Supabase deployment result and
   Database > Migrations on main. Record the commit, expected versions, result,
   and date. Do not include account records or credentials in the receipt.

The standalone SQL is the current schema definition. The versioned copies are
immutable deployment history, not a second editable definition. The CI comparison
prevents the two from drifting. Full snapshots reuse the small existing,
repeatable setup scripts. Revisit this approach in a separate reviewed change
if schema size or lock time makes full snapshots unsuitable.

The existing `20260910065142_remote_schema.sql` was fetched from the main
database's migration history. It is preserved exactly. Its SHA-256 is
`85873b79e9f68d6a39bf487807c1e577ffab89040e7cfcdcfaa6598c22ed88d1`.
It contains schema SQL, no database row dump. Do not replace it with an empty
file or rewrite main's migration history.

## Local and CI checks

Use a clean checkout with no `.env` files, Node.js 24, Docker, and Supabase CLI
2.109.1. Do not link this checkout to a hosted project. The checks use only the
disposable local Supabase project `vibies-migrations`.

```sh
npm ci
node --test tests/migrations.test.mjs tests/migration-scope.test.mjs
npm run check:migrations -- --base "$(git rev-parse origin/main)"
supabase db start
npm run check:database-migrations
supabase stop --no-backup
```

The `migration-check` GitHub check is required on every PR alongside `app-check`
and `links`. Its snapshot, history, and
classification guards always run. The classification in
[migration-scope.mjs](../scripts/migration-scope.mjs) decides whether the
disposable Supabase startup and full migration exercise also run. This section is
the one home of that rule. A PR takes the fast result only when every changed
path, including both names of a rename, is one of these:

- a `.md` or `.css` file outside `supabase/`, `.github/workflows/`, and `scripts/`;
- `app/layout.tsx` or `app/page.tsx`.

Every other change runs the full exercise: SQL, backend, access, migration
tooling, dependency, workflow, type changes, unreadable diffs, and any path the
script cannot classify. Main always receives the full proof. Add a file to the
fast list only in the PR that creates it, so its reviewer sees what it contains.
A missing fixture or failed command is a failure. The `app-check` suite remains required and also covers the Cloudflare proofs
described below.

The native check applies the full migration chain, verifies an empty second
deployment, and upgrades the pre-Personal-Projects schema from commit `39fda5a`
with synthetic accounts and Sessions. It also tests migration adoption with
existing synthetic project and access rows. A temporary
local migration deliberately fails after a write. The check verifies rollback
and absent history, corrects that temporary unapplied migration, and verifies a
successful retry. It never runs a reset or repair against a hosted database.

The pinned CLI gives reproducible local receipts. Supabase controls its hosted
runner version, so the provider deployment and history are separate required
receipts after the first merge.

### Cloudflare local proof

Run `npm run test:d1` for the synthetic D1 access, project, schema, and Google
adapter suites, `npm run test:migration` for the all-table import rehearsal,
`npm run build:vinext` for the Workers build, and
`node --test tests/staging.test.mjs tests/staging-identity.test.ts` for the
staging guards and trusted identity wrapper. Local workerd tests need permission
to bind a loopback port. These checks complement the retained source-stack
migration checks above. Only the actual checked-in workflow defines which
commands CI runs; local results do not imply a green hosted check.

`app-check` additionally runs `tests/d1-projects-postgres.test.ts` against its
isolated PostgreSQL fixture and `tests/migration-encryption-postgres.test.mjs`
against a separate loopback PostgreSQL service on port 60584. The encrypted
fixture requires `VIBIES_MIGRATION_TEST_DATABASE_URL`, creates and removes its
own temporary database, and never targets a hosted source. `npm test` includes
the source read-only-barrier tests. The final source barrier still requires the
additive `scripts/read-only-access.sql` helper before it is enabled.

Every migration destination receives one operator-created `deployment_identity`
row containing the reviewed account, database UUID and environment. Its values
cannot be changed or deleted. Deployment code does not create this identity or
activate a database. Imports require an exact identity match and a disabled,
empty destination, checked again inside the same atomic batch as the import.

## Reusable staging

The issue #61 replacement uses the fixed Cloudflare Worker `vibies-staging`
and a fresh synthetic D1 database for each operation. It is implemented in
[the workflow](../.github/workflows/staging.yml),
[the selector and verifier](../scripts/staging.mjs),
[the artifact packer](../scripts/staging-cloudflare-artifact.mjs), and
[the deployment helper](../scripts/staging-cloudflare.mjs).

**Status on 2026-10-15:** local implementation and synthetic tests exist.
Instructor merge and hosted Preview PR/Clear proof remain pending. Historical
Vercel/Supabase staging remains rollback context, not evidence that this new
workflow has deployed. No remote configuration was changed by these docs.

### Configure it once

1. Merge the reviewed workflow and helpers through the Instructor. The workflow
   accepts only `vibies-club/vibies`, current `main`, and actor `0xinBeta`.
2. Keep the GitHub environment `staging` restricted to `main`, with Instructor
   approval. Its sole provider secret is `CLOUDFLARE_STAGING_API_TOKEN`; set
   variables `CLOUDFLARE_ACCOUNT_ID` and `STAGING_ORIGIN`. The origin must be one
   exact HTTPS origin for the fixed staging Worker. Grant the token only the
   account access required to manage that Worker and synthetic D1 databases.
   Validate the actual token policy before hosted proof; no secret values belong
   in the repository or receipts.
3. Ensure the fixed Worker has no secret or unsupported bindings. The helper
   rejects those before any deployment. It accepts only plain text, D1, assets,
   and version metadata bindings, and supplies no OAuth or GitHub App secrets.
4. Check that the account has room for one more D1 database under the Free-plan
   policy. The helper refuses when its database list has ten or more entries;
   it does not purchase capacity or change plans.
5. Run and record both hosted operations. Only after they pass should the
   Instructor retire the former staging deploy key and obsolete baseline
   variables. The replacement never pushes `staging`; do not manually push it.
   Preserve old-source rollback settings until their retirement is authorized.

### Preview a PR or clear staging

Run **staging** from `main`, choose **Preview PR**, and enter the PR number.
The PR must be open, non-draft, in this repository, target current `main`, and
contain main. Required `app-check`, `migration-check`, and `links` runs must
succeed on its exact head with the expected GitHub Actions provenance. The
synthetic merge tree must equal the selected head tree. The ordered
`d1/migrations` list must retain every main migration byte and version; appended
new versions are allowed. A schema-changing PR therefore uses its own isolated
synthetic schema rather than a shared production database.

Selection is recorded in a run-specific artifact. The candidate build job checks
out the exact SHA and runs `npm ci` and `npm run build:vinext` without deployment
credentials. The protected deploy job installs trusted main tooling before it
downloads the candidate artifact. It checks the GitHub artifact ID, digest, run,
repository, local file hashes, and exact source migration blobs. Candidate
package scripts and Wrangler configuration do not execute in this job.

The trusted helper creates `vibies-staging-run-<run>-<attempt>`, applies the
selected D1 migrations, and seeds only a synthetic Instructor and staging
activation record. It deploys the packaged Worker and assets using a generated
trusted configuration with binding `DB`. A trusted wrapper serves
`/staging.json`; a fresh nonce, no-store headers, SHA, Worker version, database
ID, schema digest, migration digest, and artifact digest must match. The helper
also rechecks the provider's deployed version and bindings, and revalidates
main and the PR before issuing a success receipt. Runs are serialized with
cancellation disabled.

**Clear** selects current main and repeats the build, isolation, deployment,
and verification steps. A successful Preview PR posts a PR receipt and job
summary. Clear records the job summary. Neither operation writes a Git ref.
After verified replacement, the helper deletes only the prior database whose
synthetic name and ownership record it checked.

### Shared staging limits

Every successful operation replaces staging data with a fresh synthetic
fixture. No source data is exported or imported by this workflow. There are no
production accounts, provider tokens, OAuth secrets, or authentication bypasses.
Authenticated GitHub/Google and GitHub App behavior need separate authorized
hosted proof. A passing identity response proves deployment identity, not every
application acceptance criterion.

The workflow cannot bootstrap its own trusted main scripts before merge.
Local tests use synthetic provider responses and a local workerd wrapper; they
are not Cloudflare deployment receipts. Provider API behavior, token scope,
origin routing, and the full artifact workflow still need hosted verification.

If artifact provenance, migration ancestry, selection freshness, provider
identity, binding verification, or the nonce response fails, no success receipt
is issued. Check the failed stage and retry only after its cause is understood.
A failure before deployment attempts removes the fresh database where possible.
An ambiguous deployment retains it to avoid deleting a database already in use;
inspect the current Worker version and binding before cleanup or retry. Do not
raise the plan tier, delete unrelated databases, or bypass a failed guard.

### Retained source staging history

Issue #37's Supabase Free project and Vercel staging deployment went live after
[PR #38](https://github.com/vibies-club/vibies/pull/38) on 2026-09-14. The
[first Clear](https://github.com/vibies-club/vibies/actions/runs/34868183241)
and [second Clear](https://github.com/vibies-club/vibies/actions/runs/34953066342)
used the former deploy key and fixed `staging` ref. Its first Preview PR selection
was still pending in the historical record. The exact old setup and receipts
remain in Git history and the receipt table below. Retain the source project,
configuration, and migration history for rollback until the Instructor approves
retirement after verified cutover. New Cloudflare operations do not update the
old Supabase baseline or old Vercel deployment.

## Retained source: configure main automatic deployment once

In the main Supabase project's Settings > Integrations, authorize Supabase's
GitHub connection for the intended repository and set:

| Setting | Value |
| --- | --- |
| Repository | `vibies-club/vibies` |
| Working directory | `.` |
| Production branch | `main` |
| Deploy to production | On |
| Automatic branching | Off (since 2026-09-16) |
| Branch limit | 3 (unused while branching is off) |
| Supabase changes only | On (unused while branching is off) |

Review the project and branch on the provider page before saving. Keep the
existing Vercel integration unchanged. Production deployment works on all
Supabase plans; automatic Preview branches require Pro and can add branch
compute charges. No GitHub Actions deployment token or database password is
needed.

Automatic branching was turned off on 2026-09-16, after shared staging passed
its Action proof and the owner inventoried the one remaining preview branch and
deleted it with explicit approval. New PRs create no Supabase Preview branch. A
PR that needs hosted database proof asks the owner for a temporary branch with
an agreed cost cap; the owner creates it, links it to the PR's GitHub branch, and
deletes it when the review ends. The cleanup section below then applies to that
exception branch. This transition does not alter the historical receipts below.

## Exception branch cleanup

This section applies only to a temporary branch the owner creates for a schema
PR that needs hosted database proof. Ordinary PRs create no branch. Link the
exception branch to the PR's GitHub branch and keep its Persistent setting off.
The native integration
[deletes an ephemeral Preview when its PR merges or closes](https://supabase.com/docs/guides/deployment/branching).
The owner deletes the branch when the review ends if it still exists. This ends
the unused feature database's running compute. Main and persistent environments
are outside this cleanup. No additional deletion job is needed.

Preview data is disposable. Complete its proof before merge, because cleanup
does not wait for a successful Production deployment and branch data does not
move to main. After merge, record the deleted feature branch and the retained
main branch from the provider's branch list. Until then, mark deletion pending.

The issue #17 Preview was removed automatically after PR #18 merged. The older
unlinked `access-review-5` was removed separately with the owner's explicit
approval under [Access setup](ACCESS-SETUP.md). Main was retained after both
deletions. Do not assume that an unlinked database will be removed automatically.

Vercel uses a separate reviewed cleanup for branch-specific Preview settings.
Follow its [setup, safety boundary, and proof status](VERCEL-PREVIEW-CLEANUP.md).
Vercel deployment retention continues to manage old deployments; the cleanup
removes only exact branch-specific Preview environment rows.

## If deployment fails

Read the failing migration version and safe error details in Supabase. Main is
not ready for the new app until the deployment passes. Fix an infrastructure or
permission problem and retry the same deployment. Do not reset main, copy a
Preview database over it, or mark a failed migration as applied.

If the SQL itself is wrong, the Instructor must first verify that its version
is absent from main's applied history. Submit a reviewed repair PR for that
unapplied file and an explicit, narrowly scoped exception to the history check,
linked to the verification. Restore the normal guard after repair. Applied
migrations stay unchanged; repairs to an applied schema use a new migration.

## Receipts

The [plan and Skeptic resolutions](https://github.com/vibies-club/vibies/issues/29#issuecomment-5625714487)
define the checks. Status is recorded separately for each boundary:

| Check | Status and receipt |
| --- | --- |
| Existing main history | READ: one recorded version, `20260910065142`, shown in Database > Migrations on 2026-09-10 UTC. Native migration fetch produced the exact hash above. No application rows were fetched. |
| Local snapshot and history checks | PASS on 2026-09-10 UTC: `npm run check:migrations -- --base 8450ac4eec3d77e6828729ca350552dc81bb5f17` checked all three files. `node --test tests/migrations.test.mjs` passed its temporary Git fixture, including the expected failure cases and a valid new snapshot. No skips. |
| Native blank, no-op, adoption, failure, and retry checks | PASS on 2026-09-10 UTC: CLI 2.109.1 and local Supabase PostgreSQL 17.6.1.143 applied all three migrations. The next push reported `Local database is up to date.` Existing synthetic account UUID, approval, onboarding, Session, project, demo, Instructor and audit rows stayed equal through migration adoption. The failure returned SQLSTATE 22012 with no table or history entry; its corrected local retry recorded exactly one version. The final reset returned the disposable fixture to the clean chain. |
| First main schema upgrade | PASS on 2026-09-10 UTC: the native proof applied the pre-Personal-Projects access SQL from commit `39fda5a`, inserted a synthetic approved Member with completed onboarding and a Session, then ran the pending native migrations. The new internal UUID was valid; all prior account and Session fields stayed equal and the current private API grants passed. |
| Runtime and public grants | PASS in the native proof: runtime stayed NOLOGIN/NOINHERIT, with 17 executable private functions and no direct private table read/write grants. Anonymous and authenticated roles had no private schema access; anonymous demo SELECT remained allowed and INSERT denied. Authenticated demo SELECT remained denied. |
| App and documentation checks | Local typecheck, 24 offline tests, clean build, and 88 relative file/directory links in changed docs PASS on Node.js 24.15.0. [App CI](https://github.com/vibies-club/vibies/actions/runs/34533955722/job/103061076048), [documentation CI including fragments](https://github.com/vibies-club/vibies/actions/runs/34533955646/job/103061075470), and [Vercel build](https://vercel.com/beta-momo/vibies/8SjaKntFdP5DqEgPNrPiMydJM1n7) PASS for code commit `17ecba5`. Initial attempts used the wrong npm runtime and an external node_modules symlink; both setup errors were corrected before the passing local runs. Issue #17 receipts remain in [PROJECT-VERIFICATION.md](PROJECT-VERIFICATION.md). |
| Clean GitHub migration runner | [PASS](https://github.com/vibies-club/vibies/actions/runs/34533955698/job/103061075368) for `17ecba5`: installation, snapshot fixture, history comparison, cold native database start, complete native proof, and database cleanup all succeeded within the 15-minute limit. |
| Native GitHub integration configuration | PASS on 2026-09-10 UTC: the owner connected the integration, and the provider page shows main Production, repository `vibies-club/vibies`, directory `.`, production deployment on, and branch `main`. The owner chose to keep automatic Preview branching on, with limit 3 and Supabase-changes-only on. The earlier automatic approval block is resolved by the owner's setup. |
| Native Supabase Preview migration | [PASS](https://github.com/vibies-club/vibies/pull/30/checks?check_run_id=103065754495) for `6b136d7` on 2026-09-10 UTC. The hosted migration page showed exactly `20260910065142`, `20260910220000`, and `20260910220001`; branch status was `FUNCTIONS_DEPLOYED`. The earlier branch-limit cancellation and skipped checks were not passes. After cleanup, reopening the same PR retried native branch creation successfully, with limit 3 unchanged. |
| Feature cleanup configuration | READ on 2026-09-10 UTC: PR #30's native Preview matches `feature/database-auto-deploy-29`, is linked to PR #30, and is non-default, non-persistent, with no copied main data. Main remains default. |
| Feature cleanup result | [PASS after PR #18 merge](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922) at `5e55642`, 21:59:40 UTC: a native metadata read showed `personal-projects-review-17` absent and main retained. [PR #30's Preview cleanup also passed after merge](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747): `feature/database-auto-deploy-29` was absent and main was retained. No manual delete was used for either linked feature Preview. |
| Legacy Preview cleanup | [PASS with explicit owner approval](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922): the owner confirmed Builder's Production profile access and requested removal of `access-review-5`. The native CLI returned `Deleted preview branch`; the next list contained only main. This is separate from automatic cleanup and full Production acceptance. |
| Required GitHub migration check | [PASS after explicit owner approval](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922): main requires `migration-check`, `app-check`, and `links`, bound to GitHub Actions. One approving Member review and administrator enforcement are retained (the review requirement was removed by D-021). |
| Main deployment | [PASS after PR #30 merged](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747) on 2026-09-11 UTC: main was at `a5fabc1` and its hosted migration history contained the three expected versions. |
| Production setup | [PASS for the settings and Ready redeploy](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630665472): three App settings moved to Production and the Ready redeploy passed. Live Production Member publishing remains pending while Builder is offline. |
| Historical source staging rollout | APPROVED in issue #37 on 2026-09-13. The owner created standalone Supabase project `rftkxfkteqxyyeimpqlx` in the Free organization. It is Healthy in Frankfurt; the owner approved the native main integration and it is enabled with automatic branching off. The separate Vercel project and fixed `staging` ref at `76cf1e8` exist; it builds only its `staging` production branch and has `VIBIES_STAGING=true` with system variables enabled. The initial Vercel deployment of `76cf1e8` is Ready, and an unauthenticated request to `https://vibies-staging.vercel.app/demo` returned HTTP 200 without Vercel SSO. The GitHub environment requires Instructor review and permits only `main`. Its origin and project ID are set; its database baseline was set after merge, as the next row records. Ruleset `staging-workflow-only` (id 23322240) was created on 2026-09-14 at 15:22 UTC: active, update and deletion rules, `refs/heads/staging` only, deploy keys as the sole bypass actor, and `current_user_can_bypass` reported `never` for the admin account. On the same day an admin push of `fef90e4` to `staging` over HTTPS was rejected with `GH013: Repository rule violations found for refs/heads/staging`, `Cannot update this protected ref`, and `push declined due to repository rule violations`; the ref stayed at `76cf1e8`. After the organization enabled deploy keys, write deploy key `163269059` was registered at 15:34 UTC as the repository's only deploy key, and `STAGING_DEPLOY_KEY` in the `staging` environment was updated at 15:37 UTC with its private half; two superseded keys from repeated setup runs were deleted. The first workflow push with this key is recorded in the next row. Wiki PR #36 still awaits its hosted staging proof and Member readability review. |
| Historical source staging live | PASS. [PR #38](https://github.com/vibies-club/vibies/pull/38) merged on 2026-09-14 at `d73a73d`. The [baseline receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5666956406) records the staging migration history equal to main's versions and `STAGING_SUPABASE_TREE` set. The [first Clear receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5667239388) records [run 34868183241](https://github.com/vibies-club/vibies/actions/runs/34868183241) on 2026-09-14: every step succeeded and `staging` moved from `76cf1e8` to `d73a73d` through the deploy key. The [runtime receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5667351537) records all eleven runtime variables on the `vibies-staging` Vercel project, a sign-in start that reaches GitHub, and the designated staging Instructor. After the PR #43 schema merge, the [second Clear receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5678045912) records the baseline verified against five versions ending `20260913212638`, `STAGING_SUPABASE_TREE` updated, and [run 34953066342](https://github.com/vibies-club/vibies/actions/runs/34953066342) on 2026-09-15 moving `staging` from `d73a73d` to `a53b4f3`, with the site reporting that commit. One staging Member is approved. The [cleanup receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5693405515) records automatic branching off on 2026-09-16. The first Preview PR selection has not run yet. |

The implementation review at `17ecba5` found no remaining code defect. A scan
of its 14 changed files found no environment files, private keys, live token
patterns, or non-loopback database connection literals. The two new SQL snapshots
retain their source's separator blank line after removing `commit;`; Git's
blank-at-EOF warning is intentional so the snapshot comparison remains exact.
