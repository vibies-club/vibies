# Database migrations and deployment

[Documentation home](../README.md) · [Issue #29](https://github.com/vibies-club/vibies/issues/29) ·
[Access setup](ACCESS-SETUP.md)

## What a merge deploys

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

For the initial rollout, PR #18 merged after Member review; this automation
follow-up has a separate review. Production is ready only after both merge,
the migration deployment passes, and the one-time Production setup is verified. The owner requested
automatic feature Preview cleanup at merge; it does not wait for Production
verification. Complete the needed Preview proof before merging. Do not treat an
early Vercel success as database proof.

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
node --test tests/migrations.test.mjs
npm run check:migrations -- --base "$(git rev-parse origin/main)"
supabase db start
npm run check:database-migrations
supabase stop --no-backup
```

The `migration-check` GitHub check runs these commands. It is required on main
alongside `app-check` and `links`, with one Member approval still required.
The owner approved this rule after PR #18 merged. A missing fixture or failed
command is a failure, never a skipped proof.

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

## Configure automatic deployment once

In the main Supabase project's Settings > Integrations, authorize Supabase's
GitHub connection for the intended repository and set:

| Setting | Value |
| --- | --- |
| Repository | `vibies-club/vibies` |
| Working directory | `.` |
| Production branch | `main` |
| Deploy to production | On |
| Automatic branching | On, as requested by the owner |
| Branch limit | 3 |
| Supabase changes only | On |

Review the project and branch on the provider page before saving. Keep the
existing Vercel integration unchanged. The owner connected
the integration and chose to keep automatic Preview branches on. New PRs with
Supabase changes also receive a native Preview migration check. Production
deployment works on all Supabase plans; automatic Preview branches require Pro
and can add branch compute charges. No GitHub Actions deployment token or database
password is needed.

## Automatic cleanup after merge

Use ephemeral, non-default Preview branches linked to the feature's GitHub
branch. Keep their Persistent setting off. The native integration
[deletes an ephemeral Preview when its PR merges or closes](https://supabase.com/docs/guides/deployment/branching).
This ends the unused feature database's running compute. Main and persistent
environments are outside this cleanup. No additional deletion job is needed.

Preview data is disposable. Complete its proof before merge, because cleanup
does not wait for a successful Production deployment and branch data does not
move to main. After merge, record the deleted feature branch and the retained
main branch from the provider's branch list. Until then, mark deletion pending.

The issue #17 Preview was removed automatically after PR #18 merged. The older
unlinked `access-review-5` was removed separately with the owner's explicit
approval under [Access setup](ACCESS-SETUP.md). Main was retained after both
deletions. Do not assume that an unlinked database will be removed automatically.

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
| Feature cleanup result | [PASS after PR #18 merge](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922) at `5e55642`, 21:59:40 UTC: a native metadata read showed `personal-projects-review-17` absent and main retained. No manual delete was used for that linked feature Preview. PR #30's own removal remains pending its merge or close. |
| Legacy Preview cleanup | [PASS with explicit owner approval](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922): the owner confirmed Builder's Production profile access and requested removal of `access-review-5`. The native CLI returned `Deleted preview branch`; the next list contained only main. This is separate from automatic cleanup and full Production acceptance. |
| Required GitHub migration check | [PASS after explicit owner approval](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922): main requires `migration-check`, `app-check`, and `links`, bound to GitHub Actions. One approving Member review and administrator enforcement are retained. |
| Main deployment | Pending PR #30's reviewed merge and provider deployment. The Preview result does not prove Production migration or runtime setup. |

The final local review found no remaining code or documentation defect. A scan
of all 14 changed files found no environment files, private keys, live token
patterns, or non-loopback database connection literals. The two new SQL snapshots
retain their source's separator blank line after removing `commit;`; Git's
blank-at-EOF warning is intentional so the snapshot comparison remains exact.
