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

## Current status

The repository contains the product foundation and a small public demo. The demo
reads one synthetic row from Supabase. It does not use real Personal Projects or
Class Projects, authentication, writes, repository import, or synchronization.
See the [Supabase setup guide](docs/SUPABASE-SETUP.md), the
[demo data model](docs/DATA-MODEL.md), and [progress](docs/PROGRESS.md).

## Run the demo locally

Use Node.js 24 and npm. A human must first add the two public Supabase values to
`.env.local` as described in the [Supabase setup guide](docs/SUPABASE-SETUP.md).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The root path redirects to `/demo`.

Run the local checks with:

```sh
npm run typecheck
npm test
npm run build
npm start
```

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
community safe.

## License

Vibies is open source under the Apache License 2.0. See [LICENSE](LICENSE).
