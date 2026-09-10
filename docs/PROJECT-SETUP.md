# Personal Project setup and proof

[Documentation home](../README.md) · [Decision](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access) ·
[Proof record](PROJECT-VERIFICATION.md)

The approved scope is in [issue #17](https://github.com/vibies-club/vibies/issues/17).
The [domain model](DOMAIN.md#projects-and-repositories) owns field and state
definitions. The [workflows](WORKFLOWS.md) own user behavior.

## Human setup for the live Preview

1. Use an isolated Preview database. Follow [Access setup](ACCESS-SETUP.md) for
   GitHub sign-in, the runtime login, TLS, and Instructor designation. Apply
   `supabase/access.sql` as the database owner twice. Verify retained rows and
   runtime grants. Never run test fixture commands against this database.
2. Register a separate GitHub App with installation by Any account. This requires
   a public App. Request Metadata read-only and no optional permissions. Disable
   webhooks and user authorization during installation. This App is separate
   from the existing OAuth sign-in application.
3. Put `VIBIES_GITHUB_APP_ID`, `VIBIES_GITHUB_APP_PRIVATE_KEY`, and
   `VIBIES_GITHUB_APP_SLUG` in server-only Preview configuration. The private key
   is the App's PEM value with actual newlines. Keep it outside the repository
   and receipts. Agents must not read or write it. The installation link is
   derived from the slug as `https://github.com/apps/SLUG/installations/new`.
4. Scope the existing access settings and these three App settings to
   `feature/personal-projects-17`. Set `VIBIES_APP_ORIGIN` to the fixed Preview
   origin. Configure the OAuth callback as that origin plus `/auth/callback`.
   Redeploy after configuration changes.
5. The Instructor and two approved Members sign in in separate browser sessions.
   Use a private personal repository with synthetic content for the live proof.
   The owning Member selects only that repository in the App installation and
   returns to `/projects/connect` to refresh the eligible list. The repository
   must stay private.

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

Use Node.js 24. `npm test` runs offline unit tests, including synthetic provider
responses and project validation. It needs no database or GitHub configuration.

```sh
npm run typecheck
npm test
```

`npm run test:access` and `npm run test:projects` are explicit database proof
commands. Both fail with a setup message if `VIBIES_TEST_DATABASE_URL` is absent.
They accept only the isolated loopback database named `vibies_access_test`.
`test:projects` also runs provider and validation tests. Run these commands
sequentially because they reset synthetic fixtures.

Start a disposable PostgreSQL 17 container and create the fixture databases:

```sh
docker run --detach --name vibies-projects-test-17 \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --publish 127.0.0.1:55437:5432 postgres:17-alpine
docker exec vibies-projects-test-17 createdb -U postgres vibies_access_test
docker exec vibies-projects-test-17 createdb -U postgres vibies_access_web_test
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/vibies_access_test \
  npm run test:access
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/vibies_access_test \
  npm run test:projects
```

Build in a clean checkout with no `.env` files. Next.js loads those files
automatically; an agent must use a clean source snapshot instead of opening them.

```sh
npm run build
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/vibies_access_web_test \
VIBIES_TEST_APP_ORIGIN=http://127.0.0.1:3105 \
  npm run check:access-web -- --prepare
```

Start the built server with the isolated test hook. The hook exists only in test
code, checks the exact local fixture database and runtime login, and supplies
synthetic GitHub responses. It is never imported by application code. It does
not establish live GitHub proof.

```sh
NODE_ENV=production PORT=3105 \
VIBIES_APP_ORIGIN=http://127.0.0.1:3105 \
VIBIES_TEST_APP_ORIGIN=http://127.0.0.1:3105 \
VIBIES_DATABASE_URL=postgresql://vibies_web_test@127.0.0.1:55437/vibies_access_web_test \
VIBIES_GITHUB_CLIENT_ID=fixture-client \
VIBIES_GITHUB_CLIENT_SECRET=fixture-secret \
  node --import ./tests/project-provider-hook.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1
```

In another terminal, run the combined built-server proof:

```sh
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/vibies_access_web_test \
VIBIES_TEST_APP_ORIGIN=http://127.0.0.1:3105 \
  npm run check:access-web
```

The command fails when fixtures, the test hook, or the built server are absent.
Stop the server and `docker stop vibies-projects-test-17` after the checks.
CI runs the same offline, database, build, and HTTP layers with its own disposable
PostgreSQL service. The [proof record](PROJECT-VERIFICATION.md) distinguishes each
completed layer from pending live work.

## Live P1 and P15 procedure

1. As the owning Member, open the configured Preview, refresh the eligible list,
   and connect the selected private repository. Save a synthetic title and
   summary, review the Draft, and choose Publish.
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
5. Record the Preview URL, tested commit, time, Nicknames, synthetic project
   details, and observed outcomes in the proof record. Do not include account
   identifiers, repository links, installation IDs, cookies, keys, or raw
   provider responses. Synthetic HTTP results cannot replace this procedure.

Keep the PR draft until all proof rows have receipts. Follow the issue's stage
order before implementing Edit, Delete, and then Instructor Hide and Restore.
