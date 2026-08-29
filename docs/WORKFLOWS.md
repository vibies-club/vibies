# Vibies Workflows

[Documentation home](../README.md) · [Product definition](PRODUCT.md) ·
[Domain model](DOMAIN.md) · [Community rules](../RULES.md)

This document describes how people and Projects move through Vibies. Canonical
terms and state meanings live in the [domain model](DOMAIN.md), while permissions
and product boundaries live in the [product definition](PRODUCT.md).

Personal Project connection, sync, publication, disconnection, and deletion
workflows apply only to Personal Projects. Issue #6 does not assign the
organization-owned Class Project's lifecycle authority. Comment and Feedback
creation workflows apply to any available Project. Moderation applies to any
existing, non-deleted Project, Comment, or Feedback, including hidden content.

## 1. Log in and enter the Community

**Start:** A person chooses to sign in with GitHub.

**Actor:** The person signing in: prospective Member, returning Member, or
Instructor.

**Outcome:**

1. GitHub authenticates the person's identity.
2. Vibies checks whether the identity is the pre-established Instructor or a
   Member with approved Membership.
3. The recognized Instructor or approved Member enters the Community.
4. An approved Member whose onboarding is incomplete may browse but cannot post
   Comments or Feedback.

Authentication proves identity only. It does not approve Member Membership or
provision a new Instructor.

**Failure path:** If GitHub authentication is cancelled or fails, the person does
not enter. If authentication succeeds but the identity is neither the
pre-established Instructor nor an approved Member, the person still does not
receive Community access.

## 2. Approve Membership and complete onboarding

**Start:** An authenticated prospective, returning, or Former Member needs a
Membership decision.

**Actors:** Instructor and prospective, returning, or Former Member.

**Outcome — approval:**

1. The Instructor confirms that one of the seven Member places is available and
   approves or reapproves the person's Membership.
2. The approved Member may enter and browse the private Community.
3. If onboarding is incomplete, the Member connects a private personal
   repository and publishes a first Personal Project.
4. That first publication completes onboarding permanently.
5. If onboarding was already completed before revocation, reapproval preserves
   that milestone without another publication.
6. A Member whose onboarding is complete can post Comments and Feedback under
   the normal permissions.

A reapproved Former Member returns with the same project ownership, content
authorship, and onboarding milestone they had before revocation.

Later archiving, disconnection, hiding, or deletion of the first project does not
reverse onboarding completion.

**Outcome — revocation:** Under the [community rules](../RULES.md), the Instructor
may revoke a Member's access. The person becomes a Former Member and cannot enter
the Community or run owner workflows. This opens a Member place but preserves the
Member Role, project ownership, content authorship, onboarding milestone, and
existing content states. Separate moderation and deletion rules continue to
apply.

**Failure path:** Until approval, the person cannot enter the Community. The
Instructor cannot approve an eighth active Member, and no one else can approve or
revoke Membership. After approval, connection or publication failure leaves
onboarding incomplete. The Member may keep browsing, but attempts to post a
Comment or Feedback are rejected with the onboarding requirement.

## 3. Connect a private personal repository

**Start:** An approved Member chooses a private personal GitHub Repository for a
new Personal Project.

**Actor:** Member.

**Preconditions:** The repository is selected by the Member, the GitHub App has
metadata-only access to it, and creating the Project would not exceed the limit
of three non-deleted Personal Projects.

**Outcome:**

1. The selected repository becomes the Personal Project's metadata source.
2. The new Personal Project starts as `Draft`, `Connected`, and `Visible`.
3. The Project counts toward the three-project limit immediately, before
   publication.
4. Vibies does not request or import source files or README contents.

The organization-owned Class Project is not created through this workflow and
does not count toward the limit.

**Failure path:** If metadata access is unavailable, the repository is not an
eligible private personal repository, or the Member already has three
non-deleted Personal Projects, no new Project is created. The failure does not
change an existing Project.

## 4. Manually sync repository metadata

**Start:** A Member selects the Sync action on one of their Connected Personal
Projects.

**Actor:** Personal Project owner.

**Preconditions:** The Project is non-deleted, belongs to the Member, and remains
`Connected` to an accessible repository.

**Outcome:**

1. Vibies requests only the allowed repository metadata.
2. Vibies replaces the previously imported metadata with the completed refresh.
3. Vibies records and displays the time of that completed sync.
4. No source file or README content is requested or imported.

**Failure path:** A temporary failure leaves the prior metadata and last-sync
time unchanged and reports that the refresh failed. If repository access has
been lost, the Project follows the disconnection workflow instead.

## 5. Publish or archive a Personal Project

**Start:** A Member chooses to publish a Draft Personal Project or archive a
Published Personal Project.

**Actor:** Personal Project owner.

**Preconditions:** The Project is non-deleted and belongs to the Member. A Project
must be `Connected` for publication.

**Outcome — publish:**

1. The publication state changes from `Draft` to `Published`.
2. Connection and moderation states do not change.
3. The Project becomes available only if it is also `Connected` and `Visible`.
4. If this is the Member's first publication, onboarding completes permanently.

**Outcome — archive:**

1. The publication state changes from `Published` to `Archived`.
2. The Project is retained but unavailable to the Community.
3. Connection, moderation, the three-project count, and onboarding completion do
   not change.

**Failure path:** A Member cannot change another Member's Personal Project. A
Disconnected Project cannot complete publication. Publishing never overrides an
Instructor's `Hidden` moderation state. If a precondition fails, no state changes.

## 6. Post a flat discussion Comment

**Start:** A User submits a Comment about an available Project.

**Actor:** Instructor, or a Member whose onboarding is complete.

**Preconditions:** The Project is `Published`, `Connected`, and `Visible`, and the
Comment follows the [community rules](../RULES.md).

**Outcome:**

1. The Comment is attached directly to the Project discussion.
2. The Comment has no reply parent; discussion remains flat.
3. A Personal Project owner may comment on their own Project.
4. Vibies records the User as the Comment's author.

**Failure path:** A Member with incomplete onboarding cannot post. A Comment
cannot be added to a Draft, Archived, Disconnected, Hidden, or deleted Project.
A User cannot change another User's Comment. Individual Comment editing and
deletion are not defined by this foundation. The Instructor may hide
rule-breaking content but cannot rewrite it.

## 7. Submit structured Feedback

**Start:** A User submits Feedback about an available Project.

**Actor:** Instructor, or a Member whose onboarding is complete.

**Preconditions:** The Project is `Published`, `Connected`, and `Visible`; the
author does not own the target Personal Project; and both `keep` and `improve`
contain feedback that follows the [community rules](../RULES.md).

**Outcome:**

1. Vibies stores `keep` and `improve` together as one Feedback contribution.
2. Vibies records the User as the Feedback author.

**Failure path:** Vibies rejects self-feedback and any submission missing either
required part. A Member with incomplete onboarding cannot submit Feedback.
Feedback cannot be added to a Draft, Archived, Disconnected, Hidden, or deleted
Project. A User cannot change another User's Feedback. Individual Feedback
editing and deletion are not defined by this foundation.

## 8. Moderate content

**Start:** A Project, Comment, or Feedback needs an Instructor moderation
decision, or previously hidden content is ready for review.

**Actor:** Instructor.

**Precondition:** The target content exists and has not been deleted.

**Outcome — hide:** The Instructor changes the target's moderation visibility to
hidden. For a Project, this means changing only its moderation state to `Hidden`.
The original content and authorship remain unchanged.

**Outcome — restore:** The Instructor restores the same unchanged content. For a
Project, this means changing only its moderation state to `Visible`; availability
still depends on publication and connection.

**Failure path:** A non-Instructor cannot moderate. Moderation cannot rewrite
member-authored content, and deleted content cannot be restored through this
workflow. Republishing or reconnecting a Project does not bypass `Hidden`.

Private reminders and membership enforcement follow the
[community rules](../RULES.md).

## 9. Disconnect or reconnect a repository

**Start:** The owner deliberately disconnects a Personal Project, GitHub access
is lost, or the owner tries to restore access.

**Actors:** Personal Project owner; Vibies may detect lost GitHub access.

**Outcome — disconnect:**

1. The connection state changes to `Disconnected`.
2. The Project becomes unavailable to the Community.
3. Publication and moderation states do not change.
4. The Project, imported metadata, discussion, and Feedback are retained for
   later restoration.

**Outcome — reconnect:**

1. The owner restores metadata-only GitHub App access to the repository.
2. Vibies verifies that access and changes the state to `Connected`.
3. The owner can request a new manual sync.
4. The Project becomes available only if it is also `Published` and `Visible`.

**Failure path:** If access cannot be verified, the Project remains
`Disconnected` and unavailable. A Member cannot disconnect or reconnect another
Member's Project. Reconnection does not import source files or README content and
does not override an Instructor's moderation state.

## 10. Delete a Personal Project

**Start:** A Member chooses to delete one of their Personal Projects.

**Actor:** Personal Project owner.

**Precondition:** The Project exists, is non-deleted, and belongs to the Member.

**Outcome:**

1. Vibies explains that the Project and all attached information will be removed.
2. The Member explicitly confirms deletion.
3. Vibies removes the Personal Project, imported repository metadata, discussion,
   and Feedback.
4. The Project no longer counts toward the Member's three-project limit.
5. If publishing this Project completed onboarding, onboarding remains complete.

Deleting the Project also removes Comments and Feedback authored by other Users
because they belong to its discussion. It does not give the owner permission to
rewrite those contributions before deletion.

**Failure path:** Cancelling or leaving the confirmation changes nothing. A
Member cannot delete another Member's Personal Project. Hiding, archiving, or
disconnecting is not a substitute for confirmed deletion.
