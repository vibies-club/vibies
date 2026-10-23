# Contributing to Vibies

Vibies is built by its own community. This guide shows the workflow every
contributor follows. Agents follow the same rules through
[AGENTS.md](AGENTS.md). Community conduct lives in [RULES.md](RULES.md).

## The workflow

Follow the lanes and steps in [AGENTS.md](AGENTS.md#how-work-flows), the one
home of the development workflow. The Instructor is the only person who merges.
No GitHub review is required, as
[D-021](docs/DECISIONS.md#d-021-merge-without-a-required-github-review)
defines. Both lanes follow the merge gate, required checks, staging rules,
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

## Add a command entry

Edit the typed `wikiEntries` array in `lib/wiki.ts`. Use a stable `id` that
does not change when wording changes. Copy this object into the array and
replace every `TODO`. The example command is a non-runnable placeholder:

```ts
{
  id: "todo-stable-id",
  title: "TODO: Clear command name",
  topic: "TODO: Topic",
  where: "shell",
  command: "TODO: Replace with the exact command before use",
  usage: "TODO: When and why to use it",
  prerequisites: "None",
  placeholders: "TODO: Explain each value the learner must replace",
  result: "TODO: Expected result",
  sources: [
    {
      file: "vibies-session-3.html",
      location: "TODO: Student-facing class heading",
    },
  ],
  guide: {
    label: "Personal Project setup",
    href: "https://github.com/vibies-club/vibies/blob/main/docs/PROJECT-SETUP.md#local-and-ci-commands",
  },
},
```

`where` must be `shell`, `tmux`, `Codex`, `SQL Editor`, or `browser`.
For a keyboard shortcut, use `keys` instead of `command`; it is shown as keys
without a copy button. Every entry needs a `command`, `keys`, or `guide`.
`command`, `keys`, `placeholders`, and `guide` are optional. All other template fields
are required. `prerequisites` and `placeholders` are strings. Cite the actual
student-facing class file and its heading in `sources`; instructor-only decks
are not entry sources. Use `guide` separately to link a related setup procedure.
Keep only the short command context in the entry instead of copying its recipe.

Update an affected entry in the same PR as the command change. Record the source
inventory in the PR receipt. Run `npm run typecheck` and `npm test`, then open the PR.
The Instructor merges it.
