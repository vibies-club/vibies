# Vibies

Vibies is a private community where beginners build real products together.

## What Vibies is

- Build and share real projects.
- Learn by making, asking questions, and helping each other.
- Give useful feedback about the work, never the person.
- Welcome unfinished work because every builder starts somewhere.

Vibies is built for one instructor and seven active member places. The detailed
product purpose, access model, permissions, privacy boundaries, and exclusions
are documented in the [product definition](docs/PRODUCT.md).

## Community principles

Vibies is designed to be safe and encouraging for builders of all ages. Members use nicknames, protect personal information, and celebrate each other's progress.

Everyone in Vibies follows the [community rules](RULES.md).

## Documentation

These linked documents form the agent-facing knowledge foundation for Vibies.
Each kind of information has one authoritative home so future work can link to a
definition instead of creating a different version of it.

| Document | What it defines |
| --- | --- |
| [Community rules](RULES.md) | Behavior, safety, privacy conduct, feedback conduct, and enforcement |
| [Contributing guide](CONTRIBUTING.md) | The workflow every contributor follows, and the merge gate |
| [Shared error log](docs/ERROR_LOG.md) | Solved class workflow blockers and how to find or contribute a fix |
| [Class command wiki](docs/PRODUCT.md#class-command-wiki) | The protected `/wiki` command reference, its access, and its content boundary |
| [Agent instructions](AGENTS.md) | How agents must work in this repository |
| [Product](docs/PRODUCT.md) | Purpose, scope, roles, permissions, privacy boundaries, and exclusions |
| [Domain](docs/DOMAIN.md) | Canonical concepts, relationships, constraints, states, and the Mermaid graph |
| [Demo data model](docs/DATA-MODEL.md) | The synthetic Supabase table used by the public demo |
| [Workflows](docs/WORKFLOWS.md) | How access, projects, discussion, feedback, moderation, connection, and deletion work |
| [Decisions](docs/DECISIONS.md) | Accepted product and documentation decisions with their reasons |
| [Progress](docs/PROGRESS.md) | The current development snapshot and immediate next step |
| [Roadmap](docs/ROADMAP.md) | The `Now`, `Next`, and `Later` sequence |
| [Supabase setup](docs/SUPABASE-SETUP.md) | Human setup, safety checks, local verification, and Vercel deployment |
| [Database deployment](docs/DATABASE-DEPLOYMENT.md) | Reviewed migrations, automatic main deployment, local checks, and retry receipts |
| [Vercel Preview cleanup](docs/VERCEL-PREVIEW-CLEANUP.md) | Exact branch-setting cleanup boundary, owner setup, and proof status |
| [Access setup](docs/ACCESS-SETUP.md) | Human database, GitHub OAuth, Instructor, recovery, and deployment setup |
| [Access verification](docs/ACCESS-VERIFICATION.md) | Issue #5 implementation receipts for the A1 through A16 checks specified in issue #14 |
| [Personal Project setup](docs/PROJECT-SETUP.md) | Human App/Preview setup and exact isolated proof commands |
| [Personal Project verification](docs/PROJECT-VERIFICATION.md) | Phase order and receipts for issue #17 |

## Current status

The repository contains the product foundation, a small public demo, private
sign-in and access, and Personal Projects. The demo still reads one synthetic row
from Supabase and stays public. GitHub sign-in, approval, revocation, and the
protected welcome and membership pages are separate from it. See the
[access setup guide](docs/ACCESS-SETUP.md), [access verification](docs/ACCESS-VERIFICATION.md),
and [progress](docs/PROGRESS.md).

Issue #17 merged through [PR #18](https://github.com/vibies-club/vibies/pull/18).
It adds private Personal Project connection, publication, connection checks,
Community reading, owner Edit/Delete, and Instructor Hide/Restore.
The [project proof record](docs/PROJECT-VERIFICATION.md) lists local and live
receipts in the approved stage order, plus the Member review and merge receipt.

[PR #30](https://github.com/vibies-club/vibies/pull/30) merged after Member
review. Its [post-merge receipt](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747)
records main at `a5fabc1`, all three migration versions, and removal of its
ephemeral Preview. The [Production follow-up](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630665472)
records three App settings moved to Production and a passing Ready redeploy.
Live Production Member publishing remains pending while Builder is offline. See
[Database deployment](docs/DATABASE-DEPLOYMENT.md) for the rollout details.

The [Vercel Preview cleanup](docs/VERCEL-PREVIEW-CLEANUP.md) has local and
bounded live script proof. Its first GitHub Actions run with the dedicated
project token waits for the reviewed cleanup PR to merge.

## Run the demo locally

Use Node.js 24 and npm. A human must first add the two public Supabase values to
`.env.local` as described in the [Supabase setup guide](docs/SUPABASE-SETUP.md).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The root path redirects to `/demo`.
The demo links to `/sign-in` for private Community access.

Run the local checks with:

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm test` is offline and needs no fixture database. `npm run test:access` and
`npm run test:projects` are explicit isolated-database checks. Both fail with a
setup message when fixtures are absent. `npm run check:access-web` needs the
built server and its separate isolated fixtures and also fails when setup is
missing. Run the exact commands in the
[project setup guide](docs/PROJECT-SETUP.md#local-and-ci-commands). These tests
never use the live Preview database.

The live Supabase check is a separate human-run command because it needs the
values in `.env.local`:

```sh
npm run check:demo
```

## How to join

Vibies is invite-only. GitHub authentication proves identity, but a prospective
member also needs instructor approval. The sole instructor's access is
pre-established when the private Community is created. Before joining, read the
[community rules](RULES.md) to learn how we build, share feedback, and keep the
community safe. The human owner follows the [access setup guide](docs/ACCESS-SETUP.md)
before opening sign-in.

## License

Vibies is open source under the Apache License 2.0. See [LICENSE](LICENSE).
