# Vibies Product

[Documentation home](../README.md) · [Domain model](DOMAIN.md) ·
[Workflows](WORKFLOWS.md) · [Community rules](../RULES.md)

## Purpose

Vibies is a private community where beginners build, publish, discuss, and
improve real projects together. It is built for exactly one **Instructor** and
seven active **Member** places. A place may be temporarily vacant after access is
revoked and before a replacement is approved. These and other capitalized
product terms are defined once in the [domain model](DOMAIN.md).

This document defines the product experience and its boundaries. It does not
choose an interface, database, API, or integration design.

## Community boundary

Vibies is not public. A prospective or returning Member must pass both access
checks:

1. GitHub authentication proves the person's identity.
2. The Instructor approves the person's membership.

Authentication alone never grants Member access. An authenticated person without
approval cannot enter or browse the Community as a Member.

The sole Instructor also authenticates with GitHub, but Instructor access is
pre-established when the private Community is created. The Instructor does not
approve themselves and does not occupy one of the seven Member places. How that
initial Instructor access is technically provisioned is outside this
documentation-only foundation.

The Instructor may revoke Membership under the [community rules](../RULES.md).
The person then becomes a Former Member: they retain the Member Role, project
ownership, content authorship, and permanent onboarding milestone, but cannot
access the Community or run owner actions. Revocation opens one of the seven
Member places and does not itself delete, rewrite, or change the states of the
Former Member's Projects, Comments, or Feedback. Those remain subject to the
separate moderation and deletion rules. Reapproval fills an available Member
place and restores access to the same ownership, authorship, and onboarding
milestone.

## Member journey

An approved Member may enter and browse while onboarding. The Member completes
onboarding by publishing a first Personal Project. This is a permanent
milestone: later archiving, disconnection, moderation, or deletion does not make
the Member repeat onboarding.

Until onboarding is complete, a Member cannot post a Comment or Feedback. After
completion, the Member can participate according to the permissions below and
the [community rules](../RULES.md).

Each Member must publish one Personal Project to complete onboarding. A Member
may have at most three non-deleted Personal Projects at once. Every non-deleted
Personal Project counts, whatever its publication, connection, or moderation
states. The organization-owned Class Project is separate: it neither completes
personal onboarding nor counts toward this limit.

## Projects and GitHub

A Member connects a selected private personal GitHub Repository through a
GitHub App. Vibies receives metadata only for repositories the Member selected.
It does not import source files or README contents.

Repository metadata changes only when the project owner requests a manual sync.
The product displays the time of the last completed sync. A failed sync does not
pretend that newer metadata was received.

The Instructor and all Members collaborate on the separate, organization-owned
Class Project. It is not owned by an individual Member. Issue #6 defines this
collaboration relationship and the Class Project's exclusion from personal
limits, but it does not assign authority for connecting, syncing, publishing,
archiving, disconnecting, or deleting the Class Project. That lifecycle requires
a future accepted decision before implementation.

## Project availability

The three project state groups are independent and are defined in the
[domain model](DOMAIN.md):

- publication: `Draft`, `Published`, or `Archived`;
- GitHub connection: `Connected` or `Disconnected`;
- moderation: `Visible` or `Hidden`.

A Project is available to the Community only when it is `Published`,
`Connected`, and `Visible`. If one condition is not met, the Project is
unavailable without silently changing either of the other state groups.

For example, losing GitHub access changes a Project to `Disconnected` and makes
it unavailable, but it does not archive the Project or remove an Instructor's
moderation decision. Reconnection makes it available again only if it is still
`Published` and `Visible`.

## Permissions

| Capability | Authenticated prospective Member, not approved | Approved Member onboarding | Member onboarding complete | Instructor |
| --- | --- | --- | --- | --- |
| Enter and browse the Community | No | Yes | Yes | Yes |
| Use the documented Personal Project workflows | No | Own projects only | Own projects only | No |
| Publish a Personal Project | No | Own projects only | Own projects only | No |
| Post a Comment | No | No | Yes, including on an owned project | Yes |
| Submit Feedback | No | No | Yes, except on an owned project | Yes |
| Approve or revoke Membership | No | No | No | Yes |
| Hide or restore a Project, Comment, or Feedback | No | No | No | Yes |
| Rewrite another person's content | No | No | No | No |

For Personal Projects, the documented owner operations are connect, sync,
publish, archive, disconnect, reconnect, and delete. For Comments and Feedback,
this foundation defines authoring but does not define individual edit or delete
operations. “Own content only” is a permission boundary for any future operation,
not an unlisted capability.

The Instructor moderates by changing visibility, not authorship. No User may
change another User's Comment or Feedback.

## Discussion and feedback

Comments form a flat Project discussion. A Comment discusses a Project directly;
there are no nested replies or threads. A Member may comment on their own
Personal Project.

Feedback is different from a Comment. It is a structured evaluation containing
both a `keep` part and an `improve` part. A user cannot submit Feedback on a
Personal Project they own. Conduct requirements for both formats live in the
[community rules](../RULES.md).

## Moderation, disconnection, and deletion

The Instructor may hide or restore a Project, Comment, or Feedback. The original
content is preserved unchanged, and the Instructor cannot rewrite it.

If GitHub access is deliberately removed or lost, the Project becomes
`Disconnected` and unavailable. The Project and its existing metadata,
discussion, and Feedback remain so the connection can be restored.

Deletion is different and requires confirmation from the Personal Project
owner. It removes the Project, imported metadata, discussion, and Feedback. The
deleted Project no longer counts toward the owner's limit.

## Privacy boundaries

- Only Vibies nicknames are displayed as identity.
- GitHub usernames, avatars, and personal details remain private.
- Repository access is limited to selected repositories and metadata only.
- Source files and README contents are never imported.
- Real names, avatars, secrets, tokens, and installation IDs do not belong in
  product records or this documentation.

Behavioral rules about personal information and credentials are defined in the
[community rules](../RULES.md).

## Out of scope

This knowledge foundation does not include:

- application code, user interfaces, APIs, or database schemas;
- real Member, Project, Comment, or Feedback records;
- GitHub App creation or configuration;
- authentication or synchronization implementation;
- source-code or README importing;
- automatic sync or webhooks;
- threads, reactions, mentions, or notifications;
- real names, avatars, secrets, tokens, or installation IDs.

The Class Project lifecycle authority and individual Comment or Feedback edit
and delete operations are also deliberately undecided. They require later
product decisions rather than assumptions in this foundation.

Future feature work must be planned separately against these definitions.
