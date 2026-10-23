# Demo Data Model

[Documentation home](../README.md) · [Product domain](DOMAIN.md) ·
[Decisions](DECISIONS.md)

The public `/demo` page reads one small D1 table to prove a public read from the
deployed application. Every value in this table is synthetic demo content.

## Boundary

`demo_projects` is separate from the Vibies `Project`, `Personal Project`, and
`Class Project` concepts in the [product domain](DOMAIN.md). It does not define
the product schema. Do not put member data, repository data, real projects,
names, contact details, credentials, or other personal data in it.

The demo has no authentication, write feature, ORM, repository integration, or
real product data. Private access is implemented separately under
[D-014](DECISIONS.md#d-014-use-direct-github-oauth-and-a-private-database-api).

## Table

The table is created in [0001_application.sql](../d1/migrations/0001_application.sql).

| Column | D1 definition | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Stable row identifier. The seed keeps ID 1. |
| `title` | `TEXT NOT NULL` | Required synthetic title. |
| `summary` | `TEXT NOT NULL` | Required synthetic summary. |
| `created_at` | `TEXT NOT NULL`, UTC ISO time by default | Creation time. |

## Access

Only the Worker's `DB` binding can query D1. No client reads the table directly,
and the Worker exposes no write path for it.

## Application behavior

For `/demo`, the Worker reads `demo_projects` for `id = 1` and passes the result
through `demoState` in `lib/demo.ts`. The page shows the row, an empty state when
the row is absent, or an error state when the query fails.
