# Vibies

A private community where beginners build real products together. One
Instructor approves access to eight active Member places. Members use nicknames.
Read [PRODUCT.md](PRODUCT.md) for purpose, permissions, and scope.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000` for the home page and `/demo` for the synthetic
sample. A human configures the demo through [Supabase setup](docs/SUPABASE-SETUP.md).
Private access needs the separate [access setup](docs/ACCESS-SETUP.md).

Check with `npm run typecheck`, `npm test`, and `npm run build`.
Database and HTTP proof use the isolated fixtures in
[Project setup](docs/PROJECT-SETUP.md#local-and-ci-commands).
There is no configured lint script.

## Documentation

| Document | What it defines |
| --- | --- |
| [Community rules](RULES.md) | Behavior, safety, privacy conduct, feedback conduct, and enforcement |
| [Contributing guide](CONTRIBUTING.md) | Merge, CI, staging, safety, and contributor gates |
| [Shared error log](docs/ERROR_LOG.md) | Solved class workflow blockers and how to find or contribute a fix |
| [Agent instructions](AGENTS.md) | How agents must work in this repository |
| [Product](PRODUCT.md) | Purpose, scope, roles, permissions, privacy boundaries, and exclusions |
| [Landing page brief](docs/LANDING-BRIEF.md) | The exact copy and limits of the public home page |
| [Domain](docs/DOMAIN.md) | Canonical concepts, relationships, constraints, states, and the Mermaid graph |
| [Demo data model](docs/DATA-MODEL.md) | The synthetic Supabase table used by the public demo |
| [Workflows](docs/WORKFLOWS.md) | How access, projects, roadmaps, discussion, feedback, moderation, connection, and deletion work |
| [Decisions](docs/DECISIONS.md) | Accepted product and documentation decisions with their reasons |
| [Progress](docs/PROGRESS.md) | Dated development snapshot and pending receipts |
| [Roadmap](docs/ROADMAP.md) | The `Now`, `Next`, and `Later` sequence |
| [Supabase setup](docs/SUPABASE-SETUP.md) | Human setup, safety checks, local verification, and Vercel deployment |
| [Database deployment](docs/DATABASE-DEPLOYMENT.md) | Reviewed migrations, required CI, reusable staging setup and use, and rollout receipts |
| [Vercel Preview cleanup](docs/VERCEL-PREVIEW-CLEANUP.md) | Exact branch-setting cleanup boundary, owner setup, and proof status |
| [Access setup](docs/ACCESS-SETUP.md) | Human database, GitHub OAuth, Instructor, recovery, and deployment setup |
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
merges reviewed PRs to main.

## License

Apache License 2.0. See [LICENSE](LICENSE).
