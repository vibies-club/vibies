# Database migrations and deployment

[Documentation home](../README.md) · [D1 schema](../d1/README.md) ·
[Access setup](ACCESS-SETUP.md)

## Production

Production is the Cloudflare Worker `vibies-production`, serving
https://vibies.club. `www.vibies.club` and the workers.dev URL redirect with a
301 to the apex. The Worker binds the D1 database `vibies-production` as `DB`.
Its settings are the `production` environment in
[wrangler.jsonc](../wrangler.jsonc). Migrations live in
[d1/migrations](../d1/migrations).

Vercel and Supabase were retired on 2026-10-23. See D-033 in
[Decisions](DECISIONS.md). Their setup and receipts remain in Git history.

## Deploy main

Merging to `main` ships. Cloudflare Workers Builds watches `main` and deploys
every merge to `vibies-production` with build command
`CLOUDFLARE_ENV=production npm run build:cloudflare` and deploy command
`npx wrangler deploy --config dist/server/wrangler.json --env=""`.

When a PR adds a file to `d1/migrations`, apply it to production before you
merge, from a clean checkout of the PR branch:

```sh
npm ci
npx wrangler d1 migrations apply DB --env production --remote
```

Wrangler applies only the migrations that production has not recorded yet.
Every migration must work with the Worker that is already running, because it
lands before the new Worker does. Keep old tables and columns until no deployed
Worker reads them.

If Workers Builds is off or a build fails, deploy by hand from a clean checkout
of `main`:

```sh
npm ci
npm run build:cloudflare:production
npx wrangler deploy --config dist/server/wrangler.json
```

Record the merged commit, any new migration names, the deployed Worker version,
and the date on the PR or issue. Leave account records and credentials out of
receipts. Runtime secrets (GitHub OAuth, the GitHub App key, and Google sign-in)
are set once per environment by an operator and never belong in the repository.
Follow [Access setup](ACCESS-SETUP.md) and [Project setup](PROJECT-SETUP.md) for
those settings.

## Add a database change

1. Add a new file in `d1/migrations` named with the next number, for example
   `0005_short_name.sql`. Never edit, rename, or delete an applied migration.
   Fix an applied schema with a new migration.
2. Update the D1 adapters and their tests in the same PR, including
   `tests/d1-schema.test.mjs` when the schema rules change.
3. Run the checks below and include the receipts in the PR.
4. Apply the migration to production, then merge. See [Deploy main](#deploy-main).

## Local and CI checks

Use Node.js 24 in a clean checkout with no `.env` files:

```sh
npm ci
npm run typecheck
npm test
npm run test:d1
npm run test:worker
npm run build:cloudflare:production
```

Local workerd tests need permission to bind a loopback port.

Every PR must pass `app-check`, `migration-check`, and `links`. `app-check`
runs typecheck, `npm test`, `npm run test:d1`, `npm run test:worker`, and the
Cloudflare build. `migration-check` fails a PR that changes, renames, or
deletes an existing file in `d1/migrations`. It then runs
`tests/d1-schema.test.mjs` and applies every migration to a fresh local D1
database with `wrangler d1 migrations apply --local`. It never touches a hosted
database. `links` checks every local Markdown link and anchor. Only the
checked-in workflows define what CI runs; local results do not imply a green
hosted check.

## Reusable staging

The issue #61 replacement uses the fixed Cloudflare Worker `vibies-staging`
and a fresh synthetic D1 database for each operation. It is implemented in
[the workflow](../.github/workflows/staging.yml),
[the selector and verifier](../scripts/staging.mjs),
[the artifact packer](../scripts/staging-cloudflare-artifact.mjs), and
[the deployment helper](../scripts/staging-cloudflare.mjs).

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
5. Run and record both hosted operations. After they pass, the Instructor may
   retire the former staging deploy key and obsolete baseline variables. The
   workflow never pushes `staging`; do not push it manually.

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
out the exact SHA and runs `npm ci` and `npm run build:cloudflare` without deployment
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
fixture. No production data is exported or imported by this workflow. There are no
production accounts, provider tokens, OAuth secrets, or authentication bypasses.
Authenticated GitHub/Google and GitHub App behavior need separate authorized
hosted proof. A passing identity response proves deployment identity only. Application
acceptance criteria need their own receipts.

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

## If deployment fails

If a migration fails, Wrangler stops and production keeps every migration it
already recorded. Read the error, fix the cause, and run the same command again.
If the SQL itself is wrong, fix it in a new reviewed migration. Never mark a
failed migration as applied by hand, and never copy a staging or preview
database over production.

If a deployed Worker misbehaves, list recent versions with
`npx wrangler deployments list --env production` and roll back with
`npx wrangler rollback <version-id> --env production`. A rollback restores
code only. The Worker you roll back to must still work with the current schema.

## Receipts

Receipts for the retired Supabase migration pipeline, its Preview branches, and
the former Vercel staging live in Git history before D-033. Record new
production deployment receipts on the PR or issue that shipped the change.
