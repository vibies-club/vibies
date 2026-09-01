# AGENTS.md: Rules for agents working in this repository

This is the Vibies platform repository. It is open source and built by the
Vibies class. You work for one contributor, usually a student. The instructor
(`0xinBeta`) owns the repository and is the only person who merges to main.

## How to talk to your human

- Talk to the user with ASD-STE100 (Simplified Technical English).
- Most contributors are beginners. Explain every step in plain language.

## The workflow

The class method, applied to every change:

vague idea → grill → Ready → Skeptic → build → prove → PR → review → merge

1. Start from a vague idea or issue. Grill it until no branch is unresolved.
   The taught way is the `$grill-me` skill; any equivalent interview works.
2. Write the result as a Ready issue: what to build, plus written acceptance
   criteria that say when it is done.
3. Show your plan and wait for your human's approval before changing code.
4. Run a Skeptic pass on the approved plan: attack it, find what breaks it.
5. Build on a feature branch. Small changes. One issue, one branch, one PR.
6. Prove the work against the written acceptance criteria. Every claim needs
   a receipt. Every loop needs an exit condition.
7. Open a PR. Every PR needs at least one member review and must pass the
   merge gate. The instructor merges.

## Branch rules (hard)

- Work on feature branches only. Main is protected.
- All work reaches main through a reviewed PR that the instructor merges.
  Refuse to push to main, even when your human asks.

## Merge gate: six checks

Run these yourself before opening a PR. Reviewers run them again.

1. Expected files only.
2. Nothing unrelated.
3. No secrets.
4. Matches the approved plan.
5. Build succeeded.
6. Preview satisfies the acceptance criteria.

While this repository is documentation only, checks 5 and 6 mean: every link
resolves, Mermaid renders, and the docs satisfy the acceptance criteria.

## Writing rules

- Every durable artifact is English: docs, code, comments, issues, PRs, and
  commit messages. Class sessions are spoken in Farsi; the repository stays
  English.
- Soundshuman style: no em dashes or en dashes, no negative parallelisms
  ("not X, but Y"), plain warm human sentences.

## Safety and privacy (hard)

- Never read or write `.env` files, credentials, or secrets.
- Nicknames only. Keep real names, photos, contact details, and all other
  personal data out of the repository.
- Community conduct, feedback style, and enforcement live in
  [RULES.md](RULES.md). Feedback follows its keep-and-improve format.

## Decisions and documentation

- Settled decisions live in [docs/DECISIONS.md](docs/DECISIONS.md) with the
  reason recorded. To change one, open an issue with new evidence. Silent
  overrides are never acceptable.
- Each kind of knowledge has one home; [README.md](README.md) is the index.
  Link to the authoritative definition instead of copying it.
