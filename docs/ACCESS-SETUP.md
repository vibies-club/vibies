# Access Setup

[Documentation home](../README.md) · [Access decision](DECISIONS.md#d-014-use-direct-github-oauth-and-a-private-database-api) ·
[Verification](ACCESS-VERIFICATION.md)

This guide is for the human who owns the Supabase, GitHub, and Vercel projects.
Use a clean staging database and privacy-safe test accounts first. Never put a
credential, real name, contact detail, or private recovery reason in this
repository, a command transcript, an issue, or a PR.

## 1. Inspect the staging database

In the Supabase SQL Editor, confirm that the private schema and runtime role do
not belong to another feature:

```sql
select nspname from pg_namespace where nspname = 'vibies_private';
select rolname, rolcanlogin from pg_roles where rolname = 'vibies_runtime';
```

On a clean staging database, both queries return no rows. If either name exists,
stop and inspect its owner and purpose. The setup SQL refuses to take over an
unrecognized schema or role.

## 2. Apply the private access SQL twice

Open [access.sql](../supabase/access.sql). Copy its complete contents into the
Supabase SQL Editor and run it. Run the same complete SQL a second time. Both
runs must succeed. The second run proves that setup is repeatable.

The SQL creates private access records and security-definer functions in
`vibies_private`. It also creates `vibies_runtime` as `NOLOGIN`, removes table
and sequence rights from runtime and public roles, and grants runtime only the
function calls required by the server. It does not change the public demo.

Check the live staging catalog separately from the local tests:

```sql
select rolcanlogin, rolinherit
from pg_roles
where rolname = 'vibies_runtime';

select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'vibies_private'
  and grantee in ('PUBLIC', 'vibies_runtime', 'anon', 'authenticated');

select grantee, routine_name, privilege_type
from information_schema.routine_privileges
where routine_schema = 'vibies_private'
  and grantee = 'vibies_runtime'
order by routine_name;

select has_function_privilege(
  'vibies_runtime',
  'vibies_private.designate_instructor(text,text,text)',
  'execute'
) as runtime_can_designate_instructor;
```

The runtime role must show `rolcanlogin = false` and `rolinherit = false`. The
table-grant query must return no rows. Runtime routine grants must contain only
`access_state`, `begin_sign_in`, `change_member`, `consume_sign_in`,
`end_session`, `finish_sign_in`, and `members`. The final value must be `false`.

Nickname validation requires PostgreSQL 17 with UTF-8 and its `unicode` ICU
collation. The SQL pins validation and case-insensitive uniqueness to this
collation, so the database default locale does not change access behavior.
Check staging with synthetic values:

```sql
select pg_encoding_to_char(encoding) as encoding, datctype as locale,
       datlocprovider
from pg_database
where datname = current_database();

select value, vibies_private._normalized_nickname(value) as normalized
from (values
  ('Builder 2'),
  ('Büild۲'),
  ('Builder²'),
  ('Builder½'),
  ('BuilderⅣ')
) as samples(value);
```

The encoding must be `UTF8`. `Builder 2`, `Büild۲`, and `BuilderⅣ` must be
accepted. Roman numerals belong to the accepted Unicode letter-number category.
`Builder²` and `Builder½` must return `null`. Stop if staging differs from the
automated parity test.

## 3. Create the server login role

Create one dedicated database login in the private SQL Editor. Replace the
placeholder with a generated password and do not copy the completed statement
into a receipt:

```sql
create role vibies_app_login login password 'REPLACE_WITH_GENERATED_SECRET';
grant vibies_runtime to vibies_app_login;
```

Use this login through the Supabase pooler with TLS. It inherits only the
`vibies_runtime` function rights. Do not grant it table access, schema ownership,
or Instructor designation rights. Do not use a database owner or service-role
credential in the application.

## 4. Configure the GitHub OAuth App

Create a GitHub OAuth App for the exact hosted environment being tested.

- Set its homepage URL to the fixed HTTPS application origin.
- Set its authorization callback URL to that origin followed by
  `/auth/callback`.
- Do not configure an OAuth scope. The application also sends an empty scope.
- Keep the client secret in the hosting provider's secret storage.

Use a separate OAuth App for another fixed origin. This avoids changing the
callback while a deployment is in use.

## 5. Provide server configuration

Provide these values to the server process through the hosting environment. Do
not create or document a shared environment file for this feature.

| Name | Value |
| --- | --- |
| `VIBIES_APP_ORIGIN` | The exact fixed HTTPS origin, with no path, query, fragment, username, password, or trailing path. Loopback HTTP is accepted only by local fixture checks. |
| `VIBIES_DATABASE_URL` | The dedicated `vibies_app_login` Supabase pooler connection, with TLS. This value is server-only and must never be printed. |
| `VIBIES_DATABASE_CA` | Optional public Supabase certificate authority in PEM format. Use it when the database TLS certificate is not in the server's default trust store. |
| `VIBIES_GITHUB_CLIENT_ID` | The GitHub OAuth App client ID for this exact origin. |
| `VIBIES_GITHUB_CLIENT_SECRET` | The matching GitHub OAuth App client secret. This value is server-only and must never be printed. |

In the Supabase Dashboard, open Database Settings and find SSL Configuration.
Download the certificate and put the complete PEM value, including its BEGIN
and END lines, in `VIBIES_DATABASE_CA`. The application still requires a valid
certificate and hostname for every remote database connection. See the
[Supabase SSL guide](https://supabase.com/docs/guides/platform/ssl-enforcement).

No access value uses a `NEXT_PUBLIC_` prefix. The existing public demo values
remain separate and continue to control only `/demo`.

## 6. Designate the first Instructor

Before sign-in opens, verify the Instructor account through the class's existing
trusted channel. Obtain its stable numeric GitHub account identifier without
recording account details in the repository. Agree a privacy-safe Nickname and
write a private setup reason.

As database owner in the private SQL Editor, run this call with the verified
values. Keep the completed statement private:

```sql
select vibies_private.designate_instructor(
  'STABLE_GITHUB_ACCOUNT_ID',
  'AGREED_NICKNAME',
  'PRIVATE_SETUP_REASON'
);
```

The operation is unavailable to `vibies_runtime`. It rejects an approved or
revoked Member account, removes an unapproved entry for the target account,
invalidates affected Sessions, and writes the reason to the private audit table.

## 7. Run local and database checks

Run the repository checks with Node.js 24 and npm. The build must also succeed
without access configuration:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Start the fixed local PostgreSQL 17 container and create two isolated databases:

```sh
docker run --detach --name vibies-access-test-5 \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --publish 127.0.0.1:55435:5432 postgres:17-alpine
docker exec vibies-access-test-5 createdb -U postgres vibies_access_test
docker exec vibies-access-test-5 createdb -U postgres vibies_access_web_test
```

For a later run, start the same stopped container with
`docker start vibies-access-test-5`. Its two fixture databases already exist;
skip the container and database creation commands above.

Run the database proof. The test refuses any host except loopback and any
database name except `vibies_access_test`:

```sh
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55435/vibies_access_test \
  npm run test:access
```

Prepare the separate web fixtures:

```sh
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55435/vibies_access_web_test \
VIBIES_TEST_APP_ORIGIN=http://127.0.0.1:3105 \
  npm run check:access-web -- --prepare
```

Start the built application in one terminal with synthetic local values:

```sh
NODE_ENV=production PORT=3105 \
VIBIES_APP_ORIGIN=http://127.0.0.1:3105 \
VIBIES_DATABASE_URL=postgresql://vibies_web_test@127.0.0.1:55435/vibies_access_web_test \
VIBIES_GITHUB_CLIENT_ID=fixture-client \
VIBIES_GITHUB_CLIENT_SECRET=fixture-secret \
  npm start
```

In a second terminal, run the HTTP proof:

```sh
VIBIES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55435/vibies_access_web_test \
VIBIES_TEST_APP_ORIGIN=http://127.0.0.1:3105 \
  npm run check:access-web
```

Stop the local server, then stop the fixture container:

```sh
docker stop vibies-access-test-5
```

These checks use synthetic accounts and fixed local databases. They must never
target staging or production. Record their pass counts, without configuration
values, in [Access verification](ACCESS-VERIFICATION.md).

The `app-check` CI job runs the unit, database, build, and HTTP checks on each PR
update. It creates a separate web-test database and uses synthetic configuration.
The build runs before access configuration is provided to the web-test step.

## 8. Deploy and prove Preview

Add the required server values to the Vercel Preview environment for the
feature branch only. Add
`VIBIES_DATABASE_CA` when the database certificate needs the Supabase CA. Keep
the existing public demo values. Deploy the feature branch and complete every
human procedure in [Access verification](ACCESS-VERIFICATION.md), including the
real GitHub flow, direct access denials, privacy inspection, Session expiry, and
recovery.

For the recovery exercise, use clean staging and separate privacy-safe test
accounts. Verify the replacement through the trusted channel, record the reason
privately, and call `designate_instructor` with the replacement. Confirm that the
old account's next protected request is blocked, exactly one Instructor remains,
and the active Member count is unchanged. A Member account must be rejected as a
replacement. Restore the intended staging Instructor through the same verified
procedure after the exercise.

When implementation, automated checks, and the configured Preview are ready,
mark the PR ready for Member review. Record any remaining participant checks
explicitly. A1 through A16 and Member review must all pass before the Instructor
merges. Configure and verify Production only after that reviewed merge.
