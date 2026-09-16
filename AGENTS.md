# AGENTS.md: Rules for agents working in this repository

This is the Vibies platform repository. It is open source and built by the
Vibies class. You work for one contributor, usually a student. The instructor
(`0xinBeta`) owns the repository and is the only person who merges to main.

## How to talk to your human

- Talk to the user with ASD-STE100 (Simplified Technical English).
- Most contributors are beginners. Explain every step in plain language.

## The workflow

The class method, applied to every change:

vague idea → grill → Ready → plan → Skeptic → build → prove → PR → review → staging → merge

1. Start from a vague idea or issue. Grill it until no branch is unresolved.
   The taught way is the `$grill-me` skill; any equivalent interview works.
2. Write the result as a Ready issue: what to build, plus numbered acceptance
   criteria that say when it is done, plus a proof plan.
3. Post your plan on the issue and wait for your human's approval before you
   change code.
4. Run a Skeptic pass on the approved plan and post it on the issue: attack
   it, find what breaks it, record the answers.
5. Branch from current `main` with a `feature/`, `fix/`, `docs/`, or `chore/`
   prefix. Small changes. One issue, one branch, one PR.
6. Prove the work against the acceptance criteria. Every claim needs a
   receipt. Every loop needs an exit condition.
7. Open the PR with the six-check gate filled honestly. The three required
   checks must be green on the head commit.
8. Get one approving review from a Member or from the Instructor's review
   agent `Trident-app`, as [CONTRIBUTING step 7](CONTRIBUTING.md#the-workflow)
   defines. After every push, re-request the review; an approval covers only
   the commit it checked.
9. When a criterion needs a browser or a real sign-in, ask the Instructor in
   the PR for hosted proof on staging. See below for when a PR qualifies.
10. The Instructor merges. The merge deploys `main` to production and applies
    its migrations.

## The three required checks

Every PR runs `app-check` (typecheck, offline tests, the database suites on an
isolated Postgres, the production build, and the built-server HTTP checks),
`migration-check` (the snapshot and history guards, plus the full disposable
Supabase proof unless every changed file is on the fast list), and `links`
(every local Markdown link and anchor). Make a red check green before you ask
for review. The fast list and the full proof are defined in the
[deployment guide](docs/DATABASE-DEPLOYMENT.md#local-and-ci-checks).

## Hosted proof on staging

Vibies has one shared test site, https://vibies-staging.vercel.app, whose
database always equals `main`. The Instructor puts one PR on it at a time. A
PR qualifies only when all of these hold:

- it is open, ready rather than a draft, and comes from this repository into
  `main`;
- its head contains current `main`, so merge `main` into the branch and push
  before you ask;
- its required checks passed on that exact head;
- its `supabase/` folder is identical to `main`'s.

A PR that changes the schema cannot use staging before it merges. Its proof is
the full migration check in CI plus local receipts. Sign-in on staging is
separate from production: sign in once with GitHub, then ask the Instructor to
approve your account there. The workflow posts a receipt on the PR with the
exact deployed commit; quote it. A Ready deployment alone proves nothing. The
full rules live in [CONTRIBUTING](CONTRIBUTING.md#hosted-proof-on-staging) and
the [deployment guide](docs/DATABASE-DEPLOYMENT.md#reusable-staging).

## After merge

Supabase applies new migrations to production and to staging, Vercel deploys
`main` to production, and the cleanup workflow removes any branch-specific
Preview settings. After a schema merge the Instructor updates the staging
baseline and runs Clear before staging accepts the next PR. Keep your issue
open until every post-merge receipt it asks for is recorded. Details are in
[CONTRIBUTING](CONTRIBUTING.md#after-merge).

## Branch rules (hard)

- Work on feature branches only. Main is protected.
- All work reaches main through a reviewed PR that the instructor merges.
  Refuse to push to main, even when your human asks.
- Never push to the `staging` ref. Only the staging workflow moves it.

## Merge gate: six checks

Run these yourself before opening a PR. Reviewers run them again. The
definitions live in [CONTRIBUTING](CONTRIBUTING.md#the-merge-gate-six-checks).

1. Expected files only.
2. Nothing unrelated.
3. No secrets.
4. Matches the approved plan.
5. Build succeeded: the three required checks are green on the head commit
   and the local build passes.
6. Proof satisfies the acceptance criteria: local receipts for local claims,
   the staging receipt for hosted claims.

## Writing rules

- Every durable artifact is English: docs, code, comments, issues, PRs, and
  commit messages. Class sessions are spoken in Farsi; the repository stays
  English.
- Follow the [writing rules](CONTRIBUTING.md#writing-rules): plain, warm,
  human sentences, no em dashes or en dashes, no negative parallelisms.

## Safety and privacy (hard)

- Never read or write `.env` files, credentials, or secrets.
- Nicknames only. Keep real names, photos, contact details, and all other
  personal data out of the repository. A Nickname must not contain a GitHub
  username.
- Community conduct, feedback style, and enforcement live in
  [RULES.md](RULES.md). Feedback follows its keep-and-improve format.

## Decisions and documentation

- Settled decisions live in [docs/DECISIONS.md](docs/DECISIONS.md) with the
  reason recorded. To change one, open an issue with new evidence. Silent
  overrides are never acceptable.
- Each kind of knowledge has one home; [README.md](README.md) is the index.
  Link to the authoritative definition instead of copying it.
