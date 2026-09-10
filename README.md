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
| [Agent instructions](AGENTS.md) | How agents must work in this repository |
| [Product](docs/PRODUCT.md) | Purpose, scope, roles, permissions, privacy boundaries, and exclusions |
| [Domain](docs/DOMAIN.md) | Canonical concepts, relationships, constraints, states, and the Mermaid graph |
| [Demo data model](docs/DATA-MODEL.md) | The synthetic Supabase table used by the public demo |
| [Workflows](docs/WORKFLOWS.md) | How access, projects, discussion, feedback, moderation, connection, and deletion work |
| [Decisions](docs/DECISIONS.md) | Accepted product and documentation decisions with their reasons |
| [Progress](docs/PROGRESS.md) | The current development snapshot and immediate next step |
| [Roadmap](docs/ROADMAP.md) | The `Now`, `Next`, and `Later` sequence |
| [Supabase setup](docs/SUPABASE-SETUP.md) | Human setup, safety checks, local verification, and Vercel deployment |
| [Access setup](docs/ACCESS-SETUP.md) | Human database, GitHub OAuth, Instructor, recovery, and deployment setup |
| [Access verification](docs/ACCESS-VERIFICATION.md) | Skeptic findings and evidence for issue #14 checks A1 through A16 |
| [Personal Project setup](docs/PROJECT-SETUP.md) | Human App/Preview setup and exact isolated proof commands |
| [Personal Project verification](docs/PROJECT-VERIFICATION.md) | Phase order and receipts for issue #17 |

## Current status

The repository contains the product foundation, a small public demo, and the
first private sign-in and access feature. The demo still reads one synthetic row
from Supabase and stays public. GitHub sign-in, approval, revocation, and the
protected welcome and membership pages are separate from it. See the
[access setup guide](docs/ACCESS-SETUP.md), [access verification](docs/ACCESS-VERIFICATION.md),
and [progress](docs/PROGRESS.md).

Issue #17 is in staged draft implementation. The first stage adds private
Personal Project connection, publication, connection checks, and Community
reading. The [project proof record](docs/PROJECT-VERIFICATION.md) lists completed
checks and pending live setup. Edit, Delete, and Instructor Hide and Restore
follow the first stage's live proof.

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
