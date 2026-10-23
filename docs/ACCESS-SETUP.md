# Access Setup

[Documentation home](../README.md) · [Access decision](DECISIONS.md#d-014-use-direct-github-oauth-and-a-private-database-api) ·
[Verification](ACCESS-VERIFICATION.md)

This guide is for the operator who owns the Cloudflare account and the GitHub
and Google sign-in apps. Production is the Cloudflare Worker
`vibies-production` serving `https://vibies.club`, backed by the D1 database
`vibies-production`. Never put a credential, real name, contact detail, or
private recovery reason in this repository, a command transcript, an issue, or
a PR.

[Database deployment](DATABASE-DEPLOYMENT.md) owns D1 migrations, the build, and
the deploy. This guide covers the one-time sign-in and Instructor setup that
sits on top of them.

## 1. Configure the GitHub OAuth App

Create a GitHub OAuth App for the exact origin being configured.

- Set its homepage URL to the fixed HTTPS application origin.
- Set its authorization callback URL to that origin followed by
  `/auth/callback`.
- Do not configure an OAuth scope. The application also sends an empty scope.
- Keep the client secret in Cloudflare secret storage only.

Use a separate OAuth App for another fixed origin. This avoids changing the
callback while a deployment is in use.

## 2. Configure Google sign-in

Google sign-in is optional and turns on only when all three Google values are
present. Register exactly `<VIBIES_APP_ORIGIN>/auth/google/provider/callback/google`
as the Google redirect URI. The [Google identity notes](../lib/google-auth/README.md)
describe the routes and their limits.

## 3. Provide Worker configuration

Public values live in the `production` environment of
[wrangler.jsonc](../wrangler.jsonc). Secrets are set by the operator with
`npx wrangler secret put NAME --env production` and are never printed or
committed.

| Name | Where | Value |
| --- | --- | --- |
| `VIBIES_APP_ORIGIN` | `wrangler.jsonc` | `https://vibies.club`, the exact origin with no path. |
| `VIBIES_GITHUB_CLIENT_ID` | `wrangler.jsonc` | The GitHub OAuth App client ID for this origin. |
| `VIBIES_GITHUB_APP_ID`, `VIBIES_GITHUB_APP_SLUG` | `wrangler.jsonc` | The Personal Project GitHub App, see [Personal Project setup](PROJECT-SETUP.md). |
| `VIBIES_GITHUB_CLIENT_SECRET` | secret | The matching GitHub OAuth App client secret. |
| `VIBIES_GITHUB_APP_PRIVATE_KEY` | secret | The GitHub App PEM key. |
| `VIBIES_GOOGLE_CLIENT_ID`, `VIBIES_GOOGLE_CLIENT_SECRET` | secret | The Google OAuth client. |
| `VIBIES_GOOGLE_AUTH_SECRET` | secret | A random secret of at least 32 characters. |

For local development, copy [.dev.vars.example](../.dev.vars.example) to
`.dev.vars`, fill in synthetic or development values, and run
`npm run dev:cloudflare`. `.dev.vars` is ignored by git.

## 4. Designate the first Instructor

The operator-only `designateInstructor` function lives in
`scripts/operators/designate-instructor.ts`. Invoke it from trusted operator
tooling with the explicitly verified destination D1 binding, stable GitHub ID,
agreed nickname, and private reason. It is deliberately absent from HTTP routes
and the application's domain dispatcher. Never commit the invocation or reason.

Before running it, verify the Instructor account through the class's existing
trusted channel and agree a privacy-safe Nickname.

The function atomically checks Member and nickname conflicts, appends the audit,
revokes both affected identities' application and Google sessions and pending
link grants, removes an unapproved target entry, and updates the Instructor.
Existing provider links remain attached to their original identities; recovery
does not transfer Google ownership. Verify the resulting Instructor identity and
audit privately before reopening access. Run `npm run test:d1` to check recovery
rollback and concurrency behavior against local workerd.

## 5. Run local checks

Run the repository checks with Node.js 24 and npm. They use synthetic fixtures,
local SQLite and local workerd only, and need no credentials:

```sh
npm ci
npm run typecheck
npm test
npm run test:d1
npm run test:worker
npm run build:cloudflare
```

The `app-check` CI job runs the same commands on each PR update. Record pass
counts, without configuration values, in [Access verification](ACCESS-VERIFICATION.md).

## 6. Hosted proof

Routine app reviews use the synthetic Cloudflare PR previews and the manual
**staging** workflow described in [Cloudflare PR previews](CLOUDFLARE-PR-PREVIEWS.md)
and [Database deployment](DATABASE-DEPLOYMENT.md). After a reviewed merge and
deploy, check on `https://vibies.club`: Instructor and Member sign-in, welcome,
unapproved and signed-out denial, sign-out, and the public demo. Record dated
results without private identifiers.

The earlier issue #5 proof ran on the retired Supabase and Vercel stack. Its
receipts stay in [Access verification](ACCESS-VERIFICATION.md) as history. That
stack was retired on 2026-10-23 (D-033 in [Decisions](DECISIONS.md)).
