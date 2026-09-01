# Progress

[Documentation home](../README.md) · [Decisions](DECISIONS.md) ·
[Roadmap](ROADMAP.md)

**Updated:** 2026-09-01

## Current snapshot

The document-only knowledge foundation from issue #6 was reviewed, accepted,
and merged to main through PR #7 on 2026-08-29.

The current work is issue #8: open-source readiness. It adds the license,
contribution guide, conduct and security policies, issue and PR templates,
code ownership, link-check CI, and the governance decision
([D-011](DECISIONS.md#d-011-open-the-repository-under-vibies-club)) that
moves this repository to the `vibies-club` organization as a public project.

## Not implemented

There is no application code, user interface, API, database schema, real product
data, GitHub App configuration, authentication flow, repository import, or sync
implementation in this repository. The documentation describes intended product
behavior; it does not claim that behavior is running.

## Next step

After the readiness PR merges, the instructor completes the move in this
order: harden the organization, transfer the repository to `vibies-club`,
make it public, protect main, then invite the members. After that, choose and
plan the first product feature against the [product](PRODUCT.md),
[domain](DOMAIN.md), and [workflow](WORKFLOWS.md) definitions.
