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
approve themselves and does not occupy one of the seven Member places. The
deployment owner designates this account before sign-in opens. The first visitor
cannot become Instructor.

The Instructor may revoke Membership under the [community rules](../RULES.md).
The person then becomes a Former Member: they retain the Member Role, project
ownership, content authorship, and permanent onboarding milestone, but cannot
access the Community or run owner actions. Revocation opens one of the seven
Member places and does not itself delete, rewrite, or change the states of the
Former Member's Projects, Comments, or Feedback. Those remain subject to the
separate moderation and deletion rules. Reapproval fills an available Member
place and restores access to the same ownership, authorship, and onboarding
milestone.

The Instructor membership screen separates unapproved accounts, active Members,
and revoked Members. It shows the active count out of seven. Only the Instructor
can read its private identity details or perform approval, revocation, and
dismissal actions. Approval records the Member-agreed Nickname. Revocation needs
confirmation and blocks the next protected request or action. Dismissal removes
only an unapproved entry; a later successful sign-in may create it again.

Instructor recovery is an owner-run procedure. The owner verifies the Instructor
through an existing trusted channel, records a private reason, and designates a
separate replacement account. Recovery invalidates the old Instructor's
sessions, preserves one Instructor, and does not change the Member count. A
Member account cannot become the replacement through this procedure. Account
transfer and self-service role transfer are outside this feature.

## Sign-in and sessions

A successful GitHub sign-in identifies an account by its stable GitHub account
identifier. A changed GitHub username keeps the same access. A different account
does not inherit approval. The first successful sign-in for an unknown account
creates one unapproved entry. Repeated sign-ins reuse it.

An authenticated person without approval sees an access-denied page with a
sign-out action. Approved Members may open a minimal welcome page while
onboarding is incomplete. The Instructor can also open membership administration.
Every signed-in page provides sign-out.

Private access expires 24 hours after sign-in. Sign-out ends the current browser
session without changing Membership. Each protected request and action checks
the current session and access status, so revocation takes effect on the next
one. A cancelled sign-in returns to sign-in. Authentication and membership
lookup failures deny access and show a safe retry without exposing internal
details or claiming the person is revoked.

One browser session may start sign-in 10 times in 10 minutes. Further starts wait
until the limit permits another attempt. This is repeated-click protection. It
is not complete abuse prevention.

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

Shared details are a Member-written title, short summary, and optional HTTPS
demo link. The owner can edit these fields before or after publication in every
retained state. Community pages show the details and owner Nickname. Canonical
field limits live in the [domain model](DOMAIN.md#projects-and-repositories).

The protected `/projects` page has My projects and Community projects sections.
Owners connect a repository at `/projects/connect`, review the Draft, and choose
Publish on `/projects/[id]`. The Instructor can browse and moderate, but cannot
run owner actions. An existing connection opens the existing project unchanged,
even at the three-project limit.

Connect, Publish, and Check connection verify selected metadata-only access to
the same private personal repository. It must stay private. The owner can
explicitly Check connection to detect lost access or restore it. The page shows
the last successful check time. Connection is last known status; there are no
background checks. Unknown provider failures change nothing. Manual Sync is
outside this feature. See [D-015](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access).

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
| Run Personal Project owner workflows | No | Own projects only | Own projects only | No |
| Publish a Personal Project | No | Own projects only | Own projects only | No |
| Post a Comment | No | No | Yes, including on an owned project | Yes |
| Submit Feedback | No | No | Yes, except on an owned project | Yes |
| Approve or revoke Membership | No | No | No | Yes |
| Hide or restore a Project, Comment, or Feedback | No | No | No | Yes |
| Rewrite another person's content | No | No | No | No |

For Personal Projects, issue #17 defines Connect, Publish, Edit, Check connection
(including restoration), and confirmed Delete. Manual Sync, Archive, and
deliberate owner Disconnect remain separate planned operations. For Comments and Feedback,
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
content is preserved unchanged, and the Instructor cannot rewrite it. Minimal
Hide and Restore controls belong on the project page. The Instructor can open a
Hidden target to restore it, as well as available projects. Visible Draft,
Archived, and Disconnected projects are unavailable to non-owners, including
the Instructor. Ordinary Members can read another owner's project only when it
is available.

If GitHub access is deliberately removed or lost, the Project becomes
`Disconnected` and unavailable. The Project and its stored repository ID and details,
discussion, and Feedback remain so the connection can be restored.

Deletion is different and requires confirmation from the Personal Project
owner. It removes the Project, its stored repository ID and details, discussion, and Feedback. The
deleted Project no longer counts toward the owner's limit.

## Privacy boundaries

- Member-facing pages display only Vibies nicknames as identity.
- The Instructor membership screen may show a GitHub username and stable account
  identifier only to identify an account for an access decision.
- Application-supplied shared content does not show GitHub account details.
  Members may choose any valid HTTPS demo host, including GitHub Pages; the
  chosen destination can contain a GitHub username. This explicit exception is
  recorded in [D-015](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access).
- Profile names, avatars, email addresses, and biographies are not imported or
  stored. Authentication responses are discarded after the stable identifier and
  current GitHub username are projected for access management.
- Repository access is limited to selected repositories and metadata only.
- Source files and README contents are never imported.
- Real names, avatars, secrets, tokens, and installation IDs do not belong in
  product records or this documentation.

The Instructor checks an agreed Nickname for real names or contact information
before approval. Automatic validation follows the canonical
[Nickname rules](DOMAIN.md#people-and-access) and cannot identify every real
name.

Behavioral rules about personal information and credentials are defined in the
[community rules](../RULES.md).

## Out of scope

Issue #17 excludes Manual Sync, deliberate owner Disconnect, Archive actions,
a full moderation screen, Comments, Feedback, Class Project lifecycle,
source-code or README import, automatic sync, webhooks, notifications,
repository transfer, and GitHub repository modification. Membership requests,
Nickname editing, account transfer, and stronger sign-in abuse protection also
remain separate work. App registration and private server configuration require
human setup. The [progress record](PROGRESS.md) distinguishes implemented work
from pending proof and later delivery stages.

The Class Project lifecycle authority and individual Comment or Feedback edit
and delete operations are also deliberately undecided. They require later
product decisions rather than assumptions in this foundation.

Future feature work must be planned separately against these definitions.
