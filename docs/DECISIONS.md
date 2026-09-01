# Accepted Decisions

[Documentation home](../README.md) · [Product definition](PRODUCT.md) ·
[Domain model](DOMAIN.md) · [Workflows](WORKFLOWS.md)

This log records why the Vibies knowledge foundation has its current shape. The
linked documents remain authoritative for the detailed definitions and behavior.

## D-001 — Build shared knowledge before features

**Status:** Accepted.

**Decision:** Issue #6 creates a document-only product knowledge foundation before
the team chooses or implements application features.

**Why:** A shared vocabulary, scope, and set of boundaries lets future feature
work begin from the same understanding instead of conflicting assumptions.

**Consequence:** This work adds no application code, interface, API, database,
records, authentication, synchronization, or GitHub configuration. Feature
planning begins only after this foundation is reviewed.

**Related documents:** [Product definition](PRODUCT.md),
[progress](PROGRESS.md), and [roadmap](ROADMAP.md).

## D-002 — Give each kind of knowledge one home

**Status:** Accepted.

**Decision:** README is the documentation index; RULES owns behavior and safety;
AGENTS owns repository working instructions; PRODUCT, DOMAIN, WORKFLOWS,
DECISIONS, PROGRESS, and ROADMAP each own the concern named by the file.

**Why:** Linking to one definition is less likely to drift than copying it into
several files.

**Consequence:** Other documents may summarize a rule for context, but they link
to its authoritative definition instead of creating a competing definition.

**Related document:** [Documentation index](../README.md).

## D-003 — Require both identity proof and approval

**Status:** Accepted.

**Decision:** Vibies is private, with one pre-established Instructor place and
seven active Member places. Every User authenticates with GitHub. Instructor-
approved Membership grants Member access; the sole Instructor does not occupy a
Member place or self-approve.

**Why:** Authentication answers who a person is, while a pre-established
Instructor identity and Instructor approval of Members protect the private
Community boundary.

**Consequence:** Successful GitHub authentication alone never grants new access.
The Instructor cannot approve more than seven active Members. Revocation creates
a Former Member and temporary vacancy without deleting or rewriting content;
Role, ownership, authorship, and onboarding completion are retained for possible
reapproval.

**Related documents:** [Product community boundary](PRODUCT.md) and
[domain people and access](DOMAIN.md).

## D-004 — Display nicknames and minimize private data

**Status:** Accepted.

**Decision:** Nicknames are the only displayed identity. GitHub usernames,
avatars, and personal details remain private, and real names, secrets, tokens,
and installation IDs are excluded from this foundation.

**Why:** Vibies includes beginners of different ages and is designed to protect
personal information.

**Consequence:** Documentation and future features must use privacy-safe examples
and must not expose GitHub profile identity.

**Related documents:** [Product privacy boundaries](PRODUCT.md) and
[community rules](../RULES.md).

## D-005 — Center onboarding on a Personal Project

**Status:** Accepted.

**Decision:** An approved Member may browse during onboarding but must publish a
first Personal Project before posting Comments or Feedback. Completion is
permanent. Each Member may have at most three non-deleted Personal Projects, and
the organization-owned Class Project is separate from that requirement and
limit.

**Why:** Vibies is a community for active builders, while a small project limit
keeps the first product focused. The shared Class Project should not consume a
Member's personal capacity.

**Consequence:** Draft, Published, Archived, Connected, Disconnected, Visible,
and Hidden Personal Projects all count while non-deleted. Later changes to the
first published project do not reset onboarding.

**Related documents:** [Product member journey](PRODUCT.md) and
[domain constraints](DOMAIN.md).

## D-006 — Keep GitHub access selected, minimal, and manual

**Status:** Accepted.

**Decision:** Members connect selected private personal repositories through a
GitHub App with metadata-only access. Source files and README contents are not
imported. Metadata updates only through a manual Sync action that exposes a
last-sync time.

**Why:** Selected, metadata-only access protects repository contents. Manual sync
keeps the first product predictable and avoids background integration complexity.

**Consequence:** Automatic sync, webhooks, GitHub App setup, and synchronization
implementation are outside this foundation.

**Related documents:** [Product projects and GitHub](PRODUCT.md) and
[sync workflow](WORKFLOWS.md).

## D-007 — Separate discussion from structured Feedback

**Status:** Accepted.

**Decision:** Comments are flat Project discussions. Feedback is a separate
structured contribution containing both `keep` and `improve`. A Member may
comment on their own Personal Project but may not submit self-feedback.

**Why:** Flat Comments keep conversation simple, while the two-part Feedback
format encourages useful, work-focused responses.

**Consequence:** Threads, reactions, mentions, and notifications are outside the
foundation. Feedback missing either required part is invalid. Individual Comment
and Feedback edit or delete operations remain undecided rather than being implied
by the word “manage.”

**Related documents:** [Domain participation concepts](DOMAIN.md),
[discussion and Feedback workflows](WORKFLOWS.md), and
[community feedback rules](../RULES.md).

## D-008 — Keep project state groups independent

**Status:** Accepted.

**Decision:** Publication, GitHub connection, and moderation are three independent
project state groups. Availability is derived from all three rather than stored
as another state.

**Why:** Archiving, losing repository access, and Instructor moderation are
different events and must not silently overwrite one another.

**Consequence:** A Project is available only when `Published`, `Connected`, and
`Visible`. Reconnection cannot override `Hidden`, and restoration cannot override
`Archived` or `Disconnected`.

**Related documents:** [Domain project state groups](DOMAIN.md) and
[project availability](PRODUCT.md).

## D-009 — Distinguish disconnection, moderation, and deletion

**Status:** Accepted.

**Decision:** Disconnection preserves a Project for reconnection. Instructor
moderation hides or restores content without rewriting it. Confirmed owner
deletion removes the Personal Project, imported metadata, discussion, and
Feedback.

**Why:** Temporary access loss and moderation must be reversible without being
confused with deliberate removal, while authorship must remain intact.

**Consequence:** Only deletion reduces the non-deleted Personal Project count.
The Instructor cannot use moderation to rewrite member content, and reconnection
does not clear a moderation decision.

**Related documents:** [Product moderation, disconnection, and deletion](PRODUCT.md)
and [corresponding workflows](WORKFLOWS.md).

## D-010 — Do not invent unassigned lifecycle authority

**Status:** Accepted.

**Decision:** Issue #6 defines the organization-owned Class Project and its
collaboration relationship but does not assign its connection, sync, publication,
archive, disconnection, or deletion operations. It also does not define
individual Comment or Feedback edit and delete operations.

**Why:** Assigning authority or capabilities without an accepted product decision
would turn documentation into an accidental feature specification.

**Consequence:** Future feature planning must decide these operations explicitly
before implementing them. Until then, no agent should infer them from general
words such as “collaborate” or “manage.”

**Related documents:** [Product boundaries](PRODUCT.md),
[domain concepts](DOMAIN.md), and [workflow scope](WORKFLOWS.md).

## D-011: Open the repository under vibies-club

**Status:** Accepted.

**Decision:** The repository moves to the `vibies-club` organization and
becomes public under the Apache License 2.0. Members receive Write access
through a reviewers team so their PR approvals count toward the review
requirement. Main is protected: every change arrives through a PR with at
least one member review, and only the instructor account `0xinBeta` can push
to or merge into main. [RULES.md](../RULES.md) serves as the code of conduct,
and conduct reports go to the instructor.

**Why:** Open source turns every contribution into a public receipt. Write
access lets member reviews satisfy the review requirement, and protection on
main keeps merge authority with the instructor.

**Consequence:** The instructor performs the organization hardening (2FA
requirement on, member repository creation off), the transfer, the visibility
change, the branch protection, and the invitations after the readiness PR
merges. Protection on main comes before invitations. This heading uses a
colon because the writing rules exclude em dashes; older headings keep their
format until a cleanup issue.

**Related documents:** [Contributing guide](../CONTRIBUTING.md),
[community rules](../RULES.md), and [agent rules](../AGENTS.md).
