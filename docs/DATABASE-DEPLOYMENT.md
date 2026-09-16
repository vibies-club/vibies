# Database migrations and deployment

[Documentation home](../README.md) · [Issue #29](https://github.com/vibies-club/vibies/issues/29) ·
[Issue #37](https://github.com/vibies-club/vibies/issues/37) ·
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
and `links`, with one approving review still required. Its snapshot, history, and
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
A missing fixture or failed command is a failure. The `app-check` suite remains
required and unchanged.

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

## Reusable staging

Issue #37 replaces repeated feature-specific hosted setup with one stable test
site and one standalone Supabase Free project. Shared staging is live since
[PR #38](https://github.com/vibies-club/vibies/pull/38) merged on 2026-09-14.
The first Clear, [run 34868183241](https://github.com/vibies-club/vibies/actions/runs/34868183241)
on 2026-09-14, moved `staging` from `76cf1e8` to `d73a73d` with the deploy key.
The second Clear, [run 34953066342](https://github.com/vibies-club/vibies/actions/runs/34953066342)
on 2026-09-15, moved it from `d73a73d` to `a53b4f3` after the PR #43 schema
merge, and the site reported that commit. The first Preview PR selection is
still pending. A local script run is not proof of the Action or the Vercel Git
trigger.

### Configure it once

1. Confirm that one Free Supabase project slot is available. Create
   `vibies-staging` in the selected Free organization, in the Frankfurt region.
   Keep the Data API enabled and **Automatically expose new tables** off. Copy no
   Production data. Stop if setup requires a paid project.
2. Connect that project through Supabase's native GitHub integration to
   `vibies-club/vibies`, working directory `.`, and production branch `main`.
   Keep automatic branching off. This second same-repository connection must
   coexist with the existing Production integration. If the provider rejects
   it, stop the rollout. Do not add a Supabase token fallback.
3. After native deployment, the owner compares the project's applied migration
   versions with all migration versions in current `main`. If they match, record
   the 40-character `supabase` tree from `main` as the verified baseline. The
   Action never connects to the database. Its receipt derives the expected
   migration version list from that verified repository tree.
4. Create a separate Vercel project named `vibies-staging`. Connect the same
   repository, set its Production Branch to the fixed `staging` ref, and create
   that ref at current `main` before the first operation. Configure the Ignored
   Build Step as **Only build production** before adding runtime credentials or
   deploying candidate code. Only `staging` deploys from this project. Use its
   generated fixed domain. In this project, Vercel's **Production** label means
   the staging test site. Configure its protection so designated reviewers can
   use Vibies sign-in without a second Vercel login. Keep this change scoped to
   the staging project.
5. Create a protected GitHub Actions environment named `staging` and restrict it
   to selected branch `main`, with the Instructor as required reviewer. The
   reviewer checks the selected code before approving access to staging settings.
   Add only these public environment variables after
   the matching provider values exist:

   | Name | Value |
   | --- | --- |
   | `STAGING_ORIGIN` | Exact generated HTTPS origin, with no trailing slash or path |
   | `STAGING_PROJECT_ID` | Exact ID of the separate Vercel staging project |
   | `STAGING_SUPABASE_TREE` | Verified 40-character `supabase` tree from current `main` |

6. Protect the `staging` ref before any staging credential exists. New
   organizations disable deploy keys by default, so an owner first enables them
   under the organization's **Member privileges**. Create an
   active repository ruleset named `staging-workflow-only` that targets only
   `refs/heads/staging`, with the **Restrict updates** and **Restrict deletions**
   rules and **Deploy keys** as its only bypass actor. Then create one ed25519
   key pair for the workflow, add its public half as a repository deploy key with
   write access, store its private half as the secret `STAGING_DEPLOY_KEY` in the
   `staging` environment, and delete both local files. Keep this the
   repository's only deploy key, because every deploy key bypasses the ruleset.
   Rotate it by repeating this step and removing the old key. Verify the rule by
   pushing any commit to `staging` from a collaborator account, including an
   admin account. GitHub must reject the push with `GH013`.
7. Set `VIBIES_STAGING=true` only in this Vercel project. Expose Vercel's system
   environment variables, including `VERCEL_GIT_COMMIT_SHA` and
   `VERCEL_PROJECT_ID`. Configure the fixed origin, runtime login, GitHub OAuth,
   and GitHub App once through [Access setup](ACCESS-SETUP.md) and
   [Project setup](PROJECT-SETUP.md). The public demo needs its own anonymous API
   values from [Supabase setup](SUPABASE-SETUP.md).

The workflow pins GitHub REST version `2022-11-28` because its PR response
includes the test merge SHA. [GitHub supports this version until March 10, 2028](https://docs.github.com/en/rest/about-the-rest-api/api-versions); update that
lookup before then.

No Vercel or Supabase token belongs in this environment. Its only secret is the
staging deploy key. The workflow's `GITHUB_TOKEN` has read-only contents access;
it reads PR and CI state and posts the receipt. The ruleset rejects every other
identity that tries to move `staging`, including repository admins, so nobody
can skip reviewer selection, the CI check, or the schema guard with a push. The
deploy key itself could write any unprotected ref. Trusted main code and its
fixed refspec limit the workflow to `staging`, and main's push restriction
excludes deploy keys.

### Preview a PR or clear staging

Run the manual **staging** workflow from `main`. Choose **Preview PR** and enter
the PR number, or choose **Clear** to restore current `main`. Operations are
serialized through deployment and verification. Ordinary feature pushes do not
change the shared site. Clear after the selected PR is closed, rejected, or
merged. This moves the app ref and does not reset the shared database.

Preview accepts only an open, non-draft, same-repository PR into `main`. It
rejects a PR whose head branch is named `main` or `staging`. Current `main` must
be an ancestor of its unchanged head. The exact head must have passing
`app-check`, `migration-check`, and `links` checks from
`.github/workflows/app.yml`, `.github/workflows/database.yml`, and
`.github/workflows/docs.yml`. Their GitHub Actions `pull_request` run metadata
must match current `main` and the exact head. GitHub Actions tests the synthetic
merge revision, so the operation separately verifies that revision's parents and
requires its complete tree to equal the head tree. The candidate and verified
baseline must have the same complete `supabase` tree as current `main`.

The trusted workflow checks out the pinned `main` script and moves only the
existing `staging` ref to the exact PR head, never to the synthetic merge commit.
It pushes with the deploy key and a lease on the ref's previous value.
It never checks out or runs PR code in the privileged job. Vercel runs the
selected app code with staging-only credentials after maintainer review.

After the ref moves, verification waits at most 570 seconds, nine and a half
minutes, for the fixed origin, inside the job's 12-minute limit.
`/staging.json` must report the full selected commit SHA, the configured Vercel
project ID, the echoed request nonce, and `staging` as its Git ref. The endpoint
is available only when Vercel also reports its `production` environment and the
fixed `staging` ref. This prevents an older feature Preview with the same SHA
from passing. The operation then rechecks `main`, the PR head, and the fixed ref.
A detected change, timeout, provider failure, wrong alias, wrong project, or wrong
commit fails the operation and cannot produce a success receipt. Clear staging
uses the same checks for the exact current `main` commit, and it requires each
required check's latest run on `main` to be a push run for `main`.

The receipt records the operation, PR when applicable, current main, exact head,
tested merge commit, fixed URL, project ID, verified `supabase` tree,
repository-derived migration versions, and result. It contains no credentials
or account data.

### Shared staging limits

Shared staging follows reviewed `main` schema only. A PR with an unmerged
database change uses the full local and CI migration proof and cannot use the
routine staging operation. If its acceptance criteria require hosted database
proof, use a separate temporary environment with an agreed cost cap. Do not add
a paid resource automatically.

After each reviewed `main` schema change, wait for the native staging deployment.
The owner verifies the applied versions and then updates
`STAGING_SUPABASE_TREE` to the new `supabase` tree. Routine staging, including
Clear, stays blocked while this attestation is stale, because Clear verifies the
same baseline and main CI before it moves the ref.

Supabase can pause a Free project after low activity. Resume it in the dashboard,
then verify the applied migration versions, update the baseline tree if current
`main` changed, and prove sign-in before accepting a hosted receipt. Do not add a
keep-alive job. Test data is recreated through the migration and setup procedures,
without Production data.

### Operator runbook

Contributors do not run these steps. Ask the Instructor in the PR.

**After a schema merge.** Wait for the native staging deployment, then confirm
in the staging dashboard that the applied migration list equals main's. Set the
baseline with
`gh variable set STAGING_SUPABASE_TREE --env staging --repo vibies-club/vibies --body $(git rev-parse origin/main:supabase)`,
then run Clear. See [Shared staging limits](#shared-staging-limits).

**Select a PR.** Open Actions, choose the **staging** workflow, click **Run
workflow** from `main`, choose **Preview PR**, enter the number, and approve the
`staging` environment prompt. See
[Preview a PR or clear staging](#preview-a-pr-or-clear-staging). When the run
refuses, its summary names the reason. These reasons are for the PR author:

| Refusal message | What to tell the author |
| --- | --- |
| `PR #<number> is not an open same-repository PR into current main` | Open the PR against `main` from a branch in this repository, mark it ready for review, resolve any merge conflict, and merge current `main` into current `main`. A head branch named `main` or `staging` cannot be selected. |
| `current main is not an ancestor of the PR head` | Merge current `main` into the branch and push. |
| `PR merge commit does not exactly combine current main and the selected head` | Merge current `main` into the branch, push, and wait a minute for GitHub to recompute the merge commit. |
| `commit does not have one valid supabase tree` | The PR removes or replaces the `supabase` directory. It changes the schema, so it cannot use staging. |
| `PR, main, and staging Supabase trees do not match` | This PR changes the schema, so it cannot use staging. Use the full migration proof in CI. |
| `required check <name> is missing or ambiguous` | Wait for `app-check`, `migration-check`, and `links` to start on the exact head, or push the head again. |
| `required check <name> did not complete successfully in GitHub Actions` | Wait for the checks to finish, or fix the failing check and push. |
| `required check <name> is not for the selected pull request` | `main` moved after the checks ran. Merge current `main` into the branch and push so the checks run again. |
| `main changed during the staging operation` | `main` moved during the run. Merge current `main` into the branch, push, and ask for another run. |
| `PR head or merge commit changed during the staging operation` | Do not push while a run is in progress. Ask for another run. |
| `staging deployment timed out: ...` | The staging build did not serve the head in time. Check the `vibies-staging` Vercel build for this commit, then ask for another run. |
| `staging returned an invalid marker schema` | The PR changes the shape of the `/staging.json` response. Keep that route unchanged. |
| `staging marker identity did not match this request` | The PR changes the project ID, ref, or nonce that `/staging.json` reports. Keep that route unchanged. |

Every other message is for the operator. `the workflow commit is not current
main` means run the workflow again from current `main`. `current main does not
match the staging Supabase baseline` means follow the entry above for a schema
merge. `required check <name> is not a main push run` means wait for main's push
checks to finish before Clear.

**Approve a student on staging.** The student signs in once at the staging
origin, then the Instructor approves them on `/admin/members` there. Production
Membership does not carry over. Agree a Nickname that follows the
[safety rules](../CONTRIBUTING.md#safety). See [Access setup](ACCESS-SETUP.md).

**Resume a paused Free project.** Resume it in the Supabase dashboard, verify
the applied migration versions, update the baseline if `main` changed, and prove
sign-in before accepting a receipt. See
[Shared staging limits](#shared-staging-limits).

**Rotate the deploy key.** Create a new ed25519 pair, add its public half as the
repository's only write deploy key, update `STAGING_DEPLOY_KEY` in the `staging`
environment, remove the old key, and delete both local files. See step 6 of
[Configure it once](#configure-it-once).

**Grant an exception branch.** For a schema PR that needs hosted database proof,
the owner agrees a cost cap, creates a temporary branch on the main Supabase
project, and links it to the PR's GitHub branch. The owner deletes it when the
review ends. See [Exception branch cleanup](#exception-branch-cleanup).

## Configure main automatic deployment once

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
| Required GitHub migration check | [PASS after explicit owner approval](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922): main requires `migration-check`, `app-check`, and `links`, bound to GitHub Actions. One approving Member review and administrator enforcement are retained. |
| Main deployment | [PASS after PR #30 merged](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747) on 2026-09-11 UTC: main was at `a5fabc1` and its hosted migration history contained the three expected versions. |
| Production setup | [PASS for the settings and Ready redeploy](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630665472): three App settings moved to Production and the Ready redeploy passed. Live Production Member publishing remains pending while Builder is offline. |
| Reusable staging rollout | APPROVED in issue #37 on 2026-09-13. The owner created standalone Supabase project `rftkxfkteqxyyeimpqlx` in the Free organization. It is Healthy in Frankfurt; the owner approved the native main integration and it is enabled with automatic branching off. The separate Vercel project and fixed `staging` ref at `76cf1e8` exist; it builds only its `staging` production branch and has `VIBIES_STAGING=true` with system variables enabled. The initial Vercel deployment of `76cf1e8` is Ready, and an unauthenticated request to `https://vibies-staging.vercel.app/demo` returned HTTP 200 without Vercel SSO. The GitHub environment requires Instructor review and permits only `main`. Its origin and project ID are set; its database baseline was set after merge, as the next row records. Ruleset `staging-workflow-only` (id 23322240) was created on 2026-09-14 at 15:22 UTC: active, update and deletion rules, `refs/heads/staging` only, deploy keys as the sole bypass actor, and `current_user_can_bypass` reported `never` for the admin account. On the same day an admin push of `fef90e4` to `staging` over HTTPS was rejected with `GH013: Repository rule violations found for refs/heads/staging`, `Cannot update this protected ref`, and `push declined due to repository rule violations`; the ref stayed at `76cf1e8`. After the organization enabled deploy keys, write deploy key `163269059` was registered at 15:34 UTC as the repository's only deploy key, and `STAGING_DEPLOY_KEY` in the `staging` environment was updated at 15:37 UTC with its private half; two superseded keys from repeated setup runs were deleted. The first workflow push with this key is recorded in the next row. Wiki PR #36 still awaits its hosted staging proof and Member readability review. |
| Reusable staging live | PASS. [PR #38](https://github.com/vibies-club/vibies/pull/38) merged on 2026-09-14 at `d73a73d`. The [baseline receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5666956406) records the staging migration history equal to main's versions and `STAGING_SUPABASE_TREE` set. The [first Clear receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5667239388) records [run 34868183241](https://github.com/vibies-club/vibies/actions/runs/34868183241) on 2026-09-14: every step succeeded and `staging` moved from `76cf1e8` to `d73a73d` through the deploy key. The [runtime receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5667351537) records all eleven runtime variables on the `vibies-staging` Vercel project, a sign-in start that reaches GitHub, and the designated staging Instructor. After the PR #43 schema merge, the [second Clear receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5678045912) records the baseline verified against five versions ending `20260913212638`, `STAGING_SUPABASE_TREE` updated, and [run 34953066342](https://github.com/vibies-club/vibies/actions/runs/34953066342) on 2026-09-15 moving `staging` from `d73a73d` to `a53b4f3`, with the site reporting that commit. One staging Member is approved. The [cleanup receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5693405515) records automatic branching off on 2026-09-16. The first Preview PR selection has not run yet. |

The implementation review at `17ecba5` found no remaining code defect. A scan
of its 14 changed files found no environment files, private keys, live token
patterns, or non-loopback database connection literals. The two new SQL snapshots
retain their source's separator blank line after removing `commit;`; Git's
blank-at-EOF warning is intentional so the snapshot comparison remains exact.
