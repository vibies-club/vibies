# Progress

[Documentation home](../README.md) · [Decisions](DECISIONS.md) ·
[Roadmap](ROADMAP.md)

**Updated:** 2026-09-02

## Current snapshot

The open-source readiness work from issue #8 merged through PR #9 on
2026-09-02, and the move recorded in
[D-011](DECISIONS.md#d-011-open-the-repository-under-vibies-club) is complete:

- The repository is public at `vibies-club/vibies` under the Apache
  License 2.0.
- Main is protected: every change arrives through a PR with one approving
  review and a passing `links` check, and only the instructor can push or
  merge. The protection applies to the instructor too.
- The reviewers team holds Write access, the organization requires 2FA, and
  members cannot create repositories.
- Seven member invitations are pending. Accepting one joins the reviewers
  team.

## Not implemented

There is no application code, user interface, API, database schema, real product
data, GitHub App configuration, authentication flow, repository import, or sync
implementation in this repository. The documentation describes intended product
behavior; it does not claim that behavior is running.

## Next step

Members accept their invitations and each runs one full loop: a small Ready
issue, a feature branch, a proven fix, a PR with the six checks, and one
peer review. After that, choose and plan the first product feature against
the [product](PRODUCT.md), [domain](DOMAIN.md), and
[workflow](WORKFLOWS.md) definitions.
