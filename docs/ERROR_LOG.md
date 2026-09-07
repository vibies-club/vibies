# Shared error log

[Documentation home](../README.md)

This page helps beginner members complete their first class contribution loop.
It records solved blockers and the results that confirmed each fix.

## Find a fix

Browse the topic headings or use your browser's Find command (Ctrl+F, or
Command+F on macOS). Search for a topic or a short part of the error text.
For the first entry, try `Codex` or `no matches found`.

If there is no match, or a listed fix fails, use the
[existing support channel](../SUPPORT.md).

## Add or update a fix

Search this page first. For the same cause, update the existing entry. If a
similar symptom has a different cause or environment, add a separate entry and
state that condition clearly. Follow the
[contribution workflow](../CONTRIBUTING.md) for issues, PRs, and review.

Copy the template below under a topic heading. Complete every field. Include
only environment details needed to apply the fix; exact versions are required
only when the fix depends on them. Mark unknown relevant details as `Unknown`.
Use `Cause unknown` when the cause is not known.

A blocker is solved when the member completes the original task after applying
the fix. Record cleaned output, a GitHub state, or a specific completed workflow
step as confirmation. A statement such as "It worked" is insufficient.

### Privacy

Use cleaned text only and follow the [community rules](../RULES.md).
Use nicknames only if an identity is needed. Do not include screenshots, raw
logs, personal paths, private repository URLs, tokens, emails, API keys, or
`.env` content. Remove private details before putting text in an issue or PR.
Never read or copy `.env` files for an entry.

### Entry template

```markdown
### Short blocker title

- **Topic:**
- **Symptom or error text:**
- **Where it happened:**
- **Task goal:**
- **Environment:**
- **Likely cause:**
- **Fix steps:**
  1. Describe the first action.
- **Success confirmation:**
- **Privacy check:** Confirm that the entry follows the privacy guidance.
```

### Review

In the PR, show that the README link resolves, the template is complete, and
the page contains the verified entry. Check that browser Find locates that
entry by topic and symptom text. Check privacy guidance and entry content for
private information, duplicates, and conflicting fixes. Repeat the fix only
if the recorded evidence is unclear. Follow the existing contribution guide's
merge gate.

## Codex

### Prompt entered in the shell before opening Codex

- **Topic:** Codex command placement.
- **Symptom or error text:** A natural-language prompt entered in the shell
  produced an error such as `zsh: no matches found: repository?`.
- **Where it happened:** The normal shell prompt in the VS Code terminal.
- **Task goal:** Ask Codex to read and explain the repository rules in `AGENTS.md`.
- **Environment:** VS Code terminal, WSL Ubuntu, zsh, tmux, and Codex CLI.
- **Likely cause:** The member entered the prompt in the shell before opening
  Codex. The shell tried to interpret the prompt as a shell command.
- **Fix steps:**
  1. Run `codex` in the shell.
  2. Wait for the Codex input box.
  3. Paste the natural-language prompt into that input box and submit it.
- **Success confirmation:** The member reported that, after opening Codex
  first, Codex answered with the repository rules from `AGENTS.md`.
- **Privacy check:** This entry uses cleaned text only. It contains no
  screenshots, raw logs, personal paths, private repository URLs, tokens,
  emails, API keys, or `.env` content.

## Outside version one

Unresolved help requests, custom search, automatic log collection, application
UI, databases, and automation are outside version one.
