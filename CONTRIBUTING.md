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
5. Build succeeded. Local documentation links resolve, and changed Mermaid
   diagrams render.
6. Preview satisfies the acceptance criteria.

Database changes also follow the migration checks and rollout order in
[Database deployment](docs/DATABASE-DEPLOYMENT.md).

## Writing rules

- Every durable artifact is English: docs, code, comments, issues, PRs, and
  commit messages.
- Plain, warm, human sentences. No em dashes or en dashes. No negative
  parallelisms ("not X, but Y").

## Safety

- Keep `.env` files, credentials, and secrets out of every commit.
- Nicknames only. Keep real names, photos, contact details, and all other
  personal data out of the repository.

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
inventory in the PR receipt. Run `npm run typecheck` and `npm test`, then request
a Member review. The Instructor merges the approved PR.
