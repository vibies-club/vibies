# Contributing to Vibies

Vibies is built by its own community. This guide shows the workflow every
contributor follows. Agents follow the same rules through
[AGENTS.md](AGENTS.md). Community conduct lives in [RULES.md](RULES.md).

## The workflow

vague idea → grill → Ready → Skeptic → build → prove → PR → review → merge

1. Open an issue for your idea. Grill it until no branch is unresolved:
   interview the idea until every open question has an answer.
2. Make it Ready: write what to build and the acceptance criteria that say
   when it is done. The Ready issue template guides you.
3. Build on a feature branch (`feature/...`, `fix/...`, `docs/...`,
   `chore/...`). Keep changes small. One issue, one branch, one PR.
4. Prove your work against the written acceptance criteria before you open
   the PR. Every claim needs a receipt.
5. Open a PR. The template carries the six-check merge gate. Complete it
   honestly.
6. Every PR needs at least one member review. The instructor (`0xinBeta`)
   is the only person who merges to main.

## The merge gate: six checks

1. Expected files only.
2. Nothing unrelated.
3. No secrets.
4. Matches the approved plan.
5. Build succeeded. While the repository is documentation only, this means
   every local link resolves and Mermaid renders.
6. Preview satisfies the acceptance criteria.

## Writing rules

- Every durable artifact is English: docs, code, comments, issues, PRs, and
  commit messages.
- Plain, warm, human sentences. No em dashes or en dashes. No negative
  parallelisms ("not X, but Y").

## Safety

- Keep `.env` files, credentials, and secrets out of every commit.
- Nicknames only. Keep real names, photos, contact details, and all other
  personal data out of the repository.
