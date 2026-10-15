# Contributing to Vibies

Vibies is built by its own community. This guide shows the workflow every
contributor follows. Agents follow the same rules through
[AGENTS.md](AGENTS.md). Community conduct lives in [RULES.md](RULES.md).

## The workflow

Follow the lanes and steps in [AGENTS.md](AGENTS.md#how-work-flows), the one
home of the development workflow. The Instructor is the only person who merges.
Every PR needs an approving review from a Member or the Instructor's review
agent `Trident-app`, as [D-017](docs/DECISIONS.md#d-017-review-prs-with-an-instructor-run-agent-account)
defines. An approval covers only the commit it checked; re-request review after
every push. Both lanes follow the merge gate, required checks, staging rules,
and post-merge receipts below.

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
typecheck, offline and read-only-barrier tests, the database suites on isolated
Postgres, D1/workerd and Google security tests, synthetic migration and encrypted
export roundtrips, PostgreSQL/D1 parity, both production builds, and the
built-server HTTP checks. The encrypted roundtrip uses a separate disposable
PostgreSQL service and its own temporary database. `migration-check` runs the
snapshot and history guards on every PR, plus the full disposable Supabase
proof unless every changed file is on the fast list that the
[deployment guide](docs/DATABASE-DEPLOYMENT.md#local-and-ci-checks) owns.
`links` checks every local Markdown link and anchor. Main always gets the full
migration proof. Make a red check green before you ask for review.

## Hosted proof on staging

Issue #61 implements a Cloudflare replacement for shared staging. It is pending
Instructor merge and successful hosted **Preview PR** and **Clear** runs. The
historical Vercel/Supabase staging receipts do not prove the replacement live.

The Instructor runs the manual **staging** workflow from current `main`. An
eligible PR is open, non-draft, from this repository into `main`, contains
current `main`, and has passing required checks on its exact head. Its D1
migration list must preserve main's existing migration bytes and order; new
versions may follow that unchanged prefix.

The workflow builds the selected SHA in a job without deployment credentials.
A separate protected job uses trusted main scripts to validate the artifact,
create an isolated synthetic D1 database, and deploy the fixed
`vibies-staging` Worker. It never pushes the `staging` ref. **Clear** follows the
same flow using current main and a fresh synthetic database.

A success receipt requires the selected SHA, uploaded artifact digest, actual
D1 schema digest, migration digest, Worker version, database binding, and a
fresh no-store identity response to agree. Quote that receipt for hosted claims.
The synthetic staging Worker has no OAuth or GitHub App secrets. Its identity
receipt alone does not prove authenticated Member flows; those require a
separately authorized environment and explicit evidence. Setup, failure handling,
and historical rollback context live in
[Reusable staging](docs/DATABASE-DEPLOYMENT.md#reusable-staging).

## After merge

Until the Instructor authorizes and verifies the Cloudflare cutover, retain the
existing Supabase/Vercel production deployment and rollback configuration.
Issue #61's local builds and synthetic tests do not switch live traffic. After
the trusted staging workflow reaches main, record hosted Preview PR and Clear
receipts before describing it as operational. Production D1 import,
reconciliation, activation, and traffic cutover require their own receipts.
Keep your issue open until every post-merge receipt it asks for is recorded.

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
