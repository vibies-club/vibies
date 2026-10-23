# Vibies

A private community where beginners build real products together. One
Instructor approves access to eight active Member places. Members use nicknames.
Read [PRODUCT.md](PRODUCT.md) for purpose, permissions, and scope.

Vibies runs at https://vibies.club on one Cloudflare Worker,
`vibies-production`. The Worker serves the React frontend in `frontend/`, runs
the code in `worker/`, and stores data in the D1 database `vibies-production`.
D1 migrations live in `d1/migrations/`.

## Run locally

Use Node.js 24 and npm. Copy `.dev.vars.example` to `.dev.vars` and fill in the
values you need, then start the local Worker:

```sh
npm ci
npm run dev:cloudflare
```

Open `http://localhost:3001` for the home page and `/demo` for the synthetic
sample. Private access needs the separate [access setup](docs/ACCESS-SETUP.md).

Check with `npm run typecheck`, `npm test`, `npm run test:d1`,
`npm run test:worker`, and `npm run build:cloudflare`. The commands are listed
in [Project setup](docs/PROJECT-SETUP.md#local-and-ci-commands).
There is no configured lint script.

## Deploy

An operator deploys reviewed main to production:

```sh
npm run build:cloudflare:production
npx wrangler deploy --config dist/server/wrangler.json
```

[Database deployment](docs/DATABASE-DEPLOYMENT.md) covers D1 migrations,
staging, and recovery.

## Documentation

| Document | What it defines |
| --- | --- |
| [Community rules](RULES.md) | Behavior, safety, privacy conduct, feedback conduct, and enforcement |
| [Contributing guide](CONTRIBUTING.md) | Merge, CI, staging, safety, and contributor gates |
| [Shared error log](docs/ERROR_LOG.md) | Solved class workflow blockers and how to find or contribute a fix |
| [Class command wiki](PRODUCT.md#class-command-wiki) | The protected `/wiki` command reference, its access, and its content boundary |
| [Agent instructions](AGENTS.md) | How agents must work in this repository |
| [Product](PRODUCT.md) | Purpose, scope, roles, permissions, privacy boundaries, and exclusions |
| [Landing page brief](docs/LANDING-BRIEF.md) | The exact copy and limits of the public home page |
| [Domain](docs/DOMAIN.md) | Canonical concepts, relationships, constraints, states, and the Mermaid graph |
| [Demo data model](docs/DATA-MODEL.md) | The synthetic D1 table used by the public demo |
| [Workflows](docs/WORKFLOWS.md) | How access, projects, roadmaps, discussion, feedback, moderation, connection, and deletion work |
| [Decisions](docs/DECISIONS.md) | Accepted product and documentation decisions with their reasons |
| [Progress](docs/PROGRESS.md) | Dated development snapshot and pending receipts |
| [Roadmap](docs/ROADMAP.md) | The `Now`, `Next`, and `Later` sequence |
| [Database deployment](docs/DATABASE-DEPLOYMENT.md) | Production deploys, D1 migrations, required CI, and reusable staging |
| [Cloudflare PR previews](docs/CLOUDFLARE-PR-PREVIEWS.md) | Synthetic per-PR preview Workers and their trust boundary |
| [Access setup](docs/ACCESS-SETUP.md) | GitHub and Google sign-in, Worker configuration, Instructor, and recovery setup |
| [Access verification](docs/ACCESS-VERIFICATION.md) | Issue #5 implementation receipts for the A1 through A16 checks specified in issue #14 |
| [Personal Project setup](docs/PROJECT-SETUP.md) | Human App/Preview setup and exact isolated proof commands |
| [Personal Project verification](docs/PROJECT-VERIFICATION.md) | Phase order and receipts for issue #17 |
| [Personal Project Roadmap verification](docs/ROADMAP-VERIFICATION.md) | Acceptance receipts for issue #20, two browser rows pending |
| [Design system](DESIGN.md) | Implemented visual identity |
| [Craft playbook](docs/CRAFT.md) | UI, motion, video, 3D, and feature quality |
| [Skills](docs/SKILLS.md) | Core skills, on-demand skills, and installation |

Project agent settings live in `.codex/`, with agent definitions in
`.codex/agents/`. Project skills live in `.agents/skills/`. Plans, raw reviews,
and UI screenshots live in `notes/plans/`, `notes/reviews/`, and `notes/shots/`.
Impeccable's configuration, design sidecar, and surface briefs live in
`.impeccable/`; its work folders remain local.

The [progress record](docs/PROGRESS.md) is dated history; verify current GitHub
state before using its next steps. [AGENTS.md](AGENTS.md) owns the workflow.
[CONTRIBUTING.md](CONTRIBUTING.md) owns repository gates. Only the Instructor
merges PRs to main.

## License

Apache License 2.0. See [LICENSE](LICENSE).
