# Supabase Demo Setup

[Documentation home](../README.md) · [Demo data model](DATA-MODEL.md) ·
[Progress](PROGRESS.md)

This guide is for the human who owns the Supabase and Vercel projects. It sets
up the synthetic public demo for issue #13. Use a Supabase project that contains
no real Vibies data.

## 1. Inspect the database before any change

Open the Supabase SQL Editor. Run this inventory before you run the setup SQL:

```sql
select
  schemaname,
  tablename,
  tableowner,
  rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Stop if the `public` schema contains an unrelated table or any table with Row
Level Security off. Do not change or delete an existing table to make this demo
fit.

If `public.demo_projects` already exists, inspect its columns, owner, policies,
and grants:

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_identity,
  identity_generation,
  identity_start
from information_schema.columns
where table_schema = 'public'
  and table_name = 'demo_projects'
order by ordinal_position;

select
  schemaname,
  tablename,
  tableowner,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'demo_projects';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'demo_projects'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'demo_projects'
order by grantee, privilege_type;
```

Compare the result with the [demo data model](DATA-MODEL.md). Stop if the table
has an incompatible schema, unexpected owner, extra policy, or extra grant. Ask
the instructor before you continue.

## 2. Create the demo table

Open [demo-projects.sql](../supabase/demo-projects.sql) in your code editor.
Copy all the SQL text inside the file. In the Supabase SQL Editor, replace the
current query with that text, then click **Run**. Do not paste the file path:
the SQL Editor runs SQL text and cannot open a file from your laptop.
Run the complete SQL a second time. The second run proves that setup is safe to
repeat and that it preserves the sample row at `id = 1`.

Then open [check-demo.sql](../supabase/check-demo.sql), copy its contents into
the Supabase SQL Editor, and click **Run**. Keep the result as the
receipt for the table shape, identity start, setup ownership marker, RLS state,
policy, and grants. Stop if any result differs from the expected model. The live
Data API check in step 4 proves that the sample row is readable.

If you edit the sample row during a manual test, restore its original synthetic
title and summary. The checks do not delete or recreate the seed row.

## 3. Add local public values

In the Supabase project dashboard, use **Connect** to find the project URL and
publishable key. The URL identifies the project's API. The publishable key
identifies the application; database grants and RLS control which rows it can
access. See the [Supabase API key guide](https://supabase.com/docs/guides/api/api-keys).
No secret key, database password, or database connection string is needed.
Create
`.env.local` next to `package.json` and replace both placeholders:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The URL must use HTTPS. The key must start with `sb_publishable_`. The demo
rejects legacy anonymous keys and service role keys.

The human owns this file and its values. Keep it local. Do not commit it, paste
its values into an issue, or add a service role key.

## 4. Run and prove the application

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Confirm that `/` redirects to `/demo` and that the
page shows the sample row from Supabase. Stop and restart `npm run dev` after a
change to `.env.local` so the application reads the new values.

Run the local checks:

```sh
npm run typecheck
npm test
npm run build
npm start
```

Run the live Data API proof:

```sh
npm run check:demo
```

This human-run command uses `node --env-file=.env.local
scripts/check-demo.mjs`. It must read exactly one row with `id = 1`. It also
attempts insert, update, and delete operations and passes only when each write is
denied. An authentication error, constraint error, or write that affects zero
rows is not proof of the required RLS denial.

## 5. Configure and deploy with Vercel

The existing Vercel project is `beta-momo/vibies`, and the local repository is
linked to it. Reuse this project. Its Git provider is connected to
`vibies-club/vibies`.

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with
the same validated public values for both Preview and Production. Do this in
the Vercel project settings. Do not use a service role or legacy anonymous key.

Before merge, create a Preview deployment from the feature branch. Open `/` and
`/demo` on its HTTPS URL and record the acceptance receipts. The instructor is
the only person who merges to main. After the instructor merges the reviewed
PR, verify the Production deployment with the same checks and record its URL.

Record verified deployment URLs and acceptance receipts in the PR.
