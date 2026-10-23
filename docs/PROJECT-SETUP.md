# Personal Project setup and proof

[Documentation home](../README.md) · [Decision](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access) ·
[Proof record](PROJECT-VERIFICATION.md)

The approved scope is in [issue #17](https://github.com/vibies-club/vibies/issues/17).
The [domain model](DOMAIN.md#projects-and-repositories) owns field and state
definitions. The [workflows](WORKFLOWS.md) own user behavior.

The issue #17 proof ran on the Supabase and Vercel stack that was retired on
2026-10-23 (D-033 in [Decisions](DECISIONS.md)). Its setup is kept below as
history. Production now runs on the Cloudflare Worker `vibies-production` at
`https://vibies.club` with the D1 database `vibies-production`.

## Human setup for the issue #17 Preview, as history

The issue #17 proof used this setup, kept here as history:

1. An isolated Preview database. The owner followed
   the access setup of the time for GitHub sign-in, the database login, and
   Instructor designation, and verified retained rows and grants. Test fixture
   commands were never run against this database.
2. A separate GitHub App registered with installation by Any account, which
   requires a public App. It requested Metadata read-only and no optional
   permissions, with webhooks and user authorization during installation
   disabled. This App is separate from the existing OAuth sign-in application.
3. `VIBIES_GITHUB_APP_ID`, `VIBIES_GITHUB_APP_PRIVATE_KEY`, and
   `VIBIES_GITHUB_APP_SLUG` in server-only Preview configuration. The private key
   is the App's PEM value with actual newlines. It stays outside the repository
   and receipts, and agents must not read or write it. The installation link is
   derived from the slug as `https://github.com/apps/SLUG/installations/new`.
4. The existing access settings and these three App settings scoped to
   `feature/personal-projects-17`, with `VIBIES_APP_ORIGIN` set to the fixed
   Preview origin, the OAuth callback set to that origin plus `/auth/callback`,
   and a redeploy after each configuration change.
5. Both Members passed the hosting provider's separate Preview access gate
   before application testing.
6. The Instructor and two approved Members signed in in separate browser
   sessions, using a private personal repository with synthetic content for the
   live proof. The owning Member selected only that repository in the App
   installation and returned to `/projects/connect` to refresh the eligible
   list. The repository stays private.

GitHub documents [App registration](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app),
[user installation lookup](https://docs.github.com/en/rest/apps/apps#get-a-user-installation-for-the-authenticated-app),
[installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
and [accessible repositories](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation).

The verifier looks up the current stored username and checks the stable account
ID. Missing or mismatched lookup results need a complete bounded installation
scan before absence can become Disconnected. Collections have 100 results per
page and a 10-page limit. The verifier has a 20-second deadline, with at most
5 seconds per request. An incomplete scan or provider failure is Unknown.

## Local and CI commands

Use Node.js 24. Every check is offline. `npm test` covers synthetic provider
responses and project validation. `npm run test:d1` runs the D1 project and
access suites against local SQLite and workerd. `npm run test:worker` checks the
Worker HTTP boundary with synthetic GitHub results. None of them needs a
database URL or GitHub configuration, and none of them is live GitHub proof.

```sh
npm ci
npm run typecheck
npm test
npm run test:d1
npm run test:worker
npm run build:cloudflare
```

CI runs the same commands in the `app-check` job. The
[proof record](PROJECT-VERIFICATION.md) distinguishes each completed layer from
pending live work.

## Live P1 and P15 procedure

1. As the owning Member, open the hosted test site (staging for later runs),
   refresh the eligible list, and connect the selected private repository.
   Save a synthetic title and summary, review the Draft, and choose Publish.
2. Confirm Published, Connected, Visible, completed onboarding, and the shared
   details. In the second Member session and Instructor session, load the
   Community list and direct project page. Confirm only the chosen shared
   details and Nickname appear.
3. In a signed-out browser, request the list and project directly. Confirm no
   private project details appear.
4. Remove selected access on GitHub, then use Check connection. Confirm the
   project leaves the next Community read without losing publication or
   onboarding. Restore selected access, run Check connection, and confirm the
   same project returns.
5. Record the tested URL, tested commit, time, Nicknames, synthetic project
   details, and observed outcomes in the proof record. Do not include account
   identifiers, repository links, installation IDs, cookies, keys, or raw
   provider responses. Synthetic HTTP results cannot replace this procedure.

Issue #17 completed this stage order before Member review and merge. Its
[proof record](PROJECT-VERIFICATION.md) contains every acceptance receipt.
For later routine changes, finish the approved proof on a Cloudflare PR preview
or staging before merging; see [Cloudflare PR previews](CLOUDFLARE-PR-PREVIEWS.md).

## Production setup

[Database deployment](DATABASE-DEPLOYMENT.md) owns D1 migrations, the build, and
the deploy. Use [Access setup](ACCESS-SETUP.md) for the OAuth origin, callback,
Worker secrets, and Instructor setup. `VIBIES_GITHUB_APP_ID` and
`VIBIES_GITHUB_APP_SLUG` live in the `production` environment of
`wrangler.jsonc`. The operator sets `VIBIES_GITHUB_APP_PRIVATE_KEY` with
`npx wrangler secret put VIBIES_GITHUB_APP_PRIVATE_KEY --env production`. Verify
the selected-repository, Metadata-read boundary from step 2 of the history above.
