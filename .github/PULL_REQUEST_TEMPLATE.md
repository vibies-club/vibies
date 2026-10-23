## What this PR does

Closes #

## The six-check merge gate

Check each box only after you verified it yourself.

- [ ] Expected files only.
- [ ] Nothing unrelated.
- [ ] No secrets.
- [ ] Matches the approved plan.
- [ ] Build succeeded: the three required checks are green on the head commit
      and the local build passes (docs-only: every local link resolves).
- [ ] Proof satisfies the acceptance criteria: local receipts for local
      claims, the staging receipt for hosted claims.

## Receipts

Show how you proved each acceptance criterion. Every claim needs a receipt.

- Branch contains current `main` at commit:
- Adds a file to `d1/migrations`: no / yes. If yes, name the migration and
  link the passing `migration-check` run.
- Staging receipt for hosted claims: link to the staging workflow's comment on
  this PR, or "none needed".
