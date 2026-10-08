# Agent rules: Vibies

## Product

Vibies is a private community where beginners build and share real projects, with one Instructor and eight active Member places. GitHub sign-in and Instructor approval control access; Member-facing identity uses nicknames. Read [PRODUCT.md](PRODUCT.md) for product truth and [DESIGN.md](DESIGN.md) for the visual system.

## Stack and commands

The app root is the repository root. The stack is Node.js 24, npm, Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL, and direct GitHub OAuth.

- Development: `npm run dev`.
- Build: `npm run build`.
- Static checks: `npm run typecheck`.
- Offline tests: `npm test`.
- Lint: no lint script is configured. Do not report typecheck as a lint result.

Use [the database deployment guide](docs/DATABASE-DEPLOYMENT.md) for migration checks and [CONTRIBUTING.md](CONTRIBUTING.md) for the required CI gates.

## Design and craft

Before every UI change, read [DESIGN.md](DESIGN.md) and [docs/CRAFT.md](docs/CRAFT.md) and follow them. Read the craft playbook for motion, video, 3D, and feature tasks too. Every screen follows DESIGN.md; a screen that does not is a bug. Every UI change aims for a polished, award-level result.

When the user picks a new design direction through a comp, update DESIGN.md in the same PR with `$impeccable document`, then open a follow-up issue to bring every other screen in line.

## How work flows

> When I give you a task, you are the orchestrator. Decide the lane first and tell me in one sentence which lane and why.
>
> **Small lane** (copy, a style fix, a small bug): branch, change, build, screenshot if visual, pull request.
>
> **Feature lane** (anything new, anything with open choices, anything touching data, sign-in, or money):
> 1. Understand. If you do not fully understand what I want, say "I don't fully understand what you want. Let's run a grill-me session." and run `$grill-me` until nothing is unclear.
> 2. Technology. If the task needs a technology I have not chosen yet, give me 2 or 3 options in a table with pros, cons, cost, and difficulty, plus your recommendation. Wait for my choice.
> 3. Issue. Open a GitHub issue with numbered acceptance criteria.
> 4. Plan. Write the plan to `notes/plans/<issue>.md` and post it on the issue once.
> 5. Plan review. Spawn `plan_reviewer` fresh, with no conversation history (`fork_turns: "none"`), giving it only the issue, the plan path, and the docs to read. Revise the plan from its findings. Save its raw output verbatim to `notes/reviews/plan-<issue>.md`, never a summary.
> 6. Build. Create a branch. Use `explorer` to gather context and `worker` agents for bounded parts. For UI work, start comp-first: use `$impeccable` with `imagegen` to make 3 concepts, show them to me, and build the one I pick.
> 7. Prove. Run the build. For UI, take Playwright screenshots at 390, 768, 1280, and 1440 pixels wide into `notes/shots/<issue>/`, open every screenshot and look at it, fix what is wrong, and run `$impeccable critique` and `$impeccable polish`. On macOS the browser often cannot start inside the Codex sandbox: when that happens, ask me to approve running Playwright outside the sandbox. Never skip the visual check silently, and never say the UI is done without having looked at the screenshots.
> 8. Pull request. Open it with the issue number, the screenshot paths, and the Vercel preview link (it appears on the pull request a minute after the push; if there is none, say so). Commit only assets the app uses.
> 9. PR review. Spawn a new `pr_reviewer` for each round, fresh, with no conversation history (`fork_turns: "none"`), giving it only the issue, the plan path, the diff command, and the screenshot paths. Fix every blocker and major finding. At most two rounds. Save each reviewer's raw output verbatim to `notes/reviews/pr-<number>-r<round>.md`, never a summary.
> 10. Merge. Follow the merge choice recorded in this file: either you merge after a `ship` verdict and tell me, or you tell me the PR is ready with a three-line summary and I merge.
>
> Run reviewers in the background while you prepare the next step. Never push to main. After a merge, delete the merged branch. If a turn stops on an error, continue from `notes/plans/` and the git state.

Repository gates still apply to both lanes: use `feature/`, `fix/`, `docs/`, or `chore/` branches from current main, one issue per PR, and an approving Member or `Trident-app` review of the current head. Require green `app-check`, `migration-check`, and `links` checks. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for hosted staging proof and post-merge receipts. Never push to the `staging` ref.

## Decisions

Settled decisions live in [docs/DECISIONS.md](docs/DECISIONS.md), with one line explaining why. Change an accepted decision through an issue with new evidence.

## Skills

When a task matches a row in docs/SKILLS.md, install that skill if it is missing and use it, without asking. Read [the skill catalog](docs/SKILLS.md) for the core and on-demand tables.

## Merge choice

Only the Instructor (`0xinBeta`) merges to main. The user confirmed that the current repository merge rule stays in effect on 2026-10-08. After a `ship` verdict, report that the PR is ready in three lines; leave merging to the Instructor. A local reviewer verdict does not replace the required GitHub approval and CI gates.

## Safety and writing

- Durable artifacts are English: docs, code, comments, issues, PRs, and commits.
- Never read or write `.env` files, credentials, or secrets. Keep secret values out of outputs and commits.
- Nicknames only. Keep real names, photos, contact details, and other personal data out of the repository.
- Work on feature branches only. Never push to main. All work reaches main through a reviewed PR that the Instructor merges.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md#writing-rules) for writing and [RULES.md](RULES.md) for conduct and feedback.
