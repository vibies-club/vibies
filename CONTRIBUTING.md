# Contributing to Vibies

Vibies is built by its own community. This guide shows the workflow every
contributor follows. Agents follow the same rules through
[AGENTS.md](AGENTS.md). Community conduct lives in [RULES.md](RULES.md).

## The workflow

vague idea → grill → Ready → plan → Skeptic → build → prove → PR → review → staging → merge

1. Open an issue for your idea. Grill it until no branch is unresolved:
   interview the idea until every open question has an answer.
2. Make it Ready: write what to build, the numbered acceptance criteria that
   say when it is done, and a proof plan. The Ready issue template guides you.
3. Post your plan on the issue and wait for the Instructor's approval before
   you change code. Then run a Skeptic pass on the approved plan and post it:
   attack the plan, record what breaks it and the answers.
4. Branch from current `main` with a `feature/`, `fix/`, `docs/`, or
   `chore/` prefix. Keep changes small. One issue, one branch, one PR.
5. Prove your work against the acceptance criteria before you open the PR.
   Every claim needs a receipt: the command you ran and what it showed, a CI
   run link, or the staging receipt for a hosted claim.
6. Open a PR. The template carries the six-check merge gate. Complete it
   honestly. The three required checks must be green on the head commit.
7. Every PR needs at least one approving review from a Member or from the
   Instructor's review agent account `Trident-app` (see
   [D-017](docs/DECISIONS.md#d-017-review-prs-with-an-instructor-run-agent-account)).
   The review agent runs the merge gate and approves only after the last
   commit it checked. After every push, re-request the review.
8. If a criterion needs a browser or a real sign-in, ask the Instructor in the
   PR for hosted proof on staging. See [Hosted proof on staging](#hosted-proof-on-staging).
9. The instructor (`0xinBeta`) is the only person who merges to main. The
   merge deploys `main` to production and applies its migrations.

## The merge gate: six checks

1. Expected files only.
2. Nothing unrelated.
3. No secrets.
4. Matches the approved plan.
5. Build succeeded: `app-check`, `migration-check`, and `links` are green on
   the head commit, and the local build passes. For a docs-only PR, every
   local link resolves.
6. Proof satisfies the acceptance criteria: local receipts for local claims,
   the staging receipt for hosted claims. A Ready deployment alone proves
   nothing.

Database changes also follow the migration checks and rollout order in
[Database deployment](docs/DATABASE-DEPLOYMENT.md).

## The three required checks

Every PR reports `app-check`, `migration-check`, and `links`. `app-check` runs
typecheck, the offline tests, the database suites on an isolated Postgres, the
production build, and the built-server HTTP checks. `migration-check` runs the
snapshot and history guards on every PR, plus the full disposable Supabase
proof unless every changed file is on the fast list that the
[deployment guide](docs/DATABASE-DEPLOYMENT.md#local-and-ci-checks) owns.
`links` checks every local Markdown link and anchor. Main always gets the full
migration proof. Make a red check green before you ask for review.

## Hosted proof on staging

Vibies has one shared test site, https://vibies-staging.vercel.app, whose
database follows `main`'s merged schema. The Instructor puts one PR on it at a time with
the manual **staging** workflow. Your PR is eligible only when all of these
hold:

- it is open, ready rather than a draft, and comes from this repository into
  `main`;
- its head contains current `main`, so merge `main` into your branch and push
  before you ask;
- its required checks passed on that exact head;
- its `supabase/` folder is identical to `main`'s.

A PR that changes the schema cannot use staging before it merges. Its proof is
the full migration check in CI plus local receipts. If its criteria require
hosted database proof, the Instructor can grant a temporary branch with an
agreed cost cap.

Sign-in on staging is separate from production. Sign in once with GitHub at
the staging origin, then ask the Instructor to approve your account there with
a Nickname that follows the [safety rules](#safety).

The workflow posts a receipt comment on the PR with the exact deployed commit.
Quote it in your receipts. A Ready deployment alone proves nothing. The guards,
the operator steps, and the limits live in
[Reusable staging](docs/DATABASE-DEPLOYMENT.md#reusable-staging).

## After merge

Supabase applies new migrations to production and to staging. Vercel deploys
`main` to production. The cleanup workflow removes any branch-specific Preview
settings. After a schema merge the Instructor confirms the staging migration
list, updates the staging baseline, and runs Clear before staging accepts the
next PR. Keep your issue open until every post-merge receipt it asks for is
recorded.

## Writing rules

- Every durable artifact is English: docs, code, comments, issues, PRs, and
  commit messages.
- Plain, warm, human sentences. No em dashes or en dashes. No negative
  parallelisms ("not X, but Y").

## Safety

- Keep `.env` files, credentials, and secrets out of every commit.
- Nicknames only. Keep real names, photos, contact details, and all other
  personal data out of the repository. A Nickname must not contain your GitHub
  username, on production or on staging.
