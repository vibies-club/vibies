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

1. Vibies allows the sign-in start when this browser session has made fewer
   than 10 starts in the current 10-minute window.
2. GitHub authenticates the person's identity.
3. Vibies matches the stable GitHub account identifier. A first successful
   sign-in creates one unapproved Access entry, and repeated sign-ins reuse it.
4. Vibies starts an opaque browser Session with an absolute 24-hour lifetime.
5. Vibies checks whether the identity is the designated Instructor or a Member
   with approved Membership.
6. The recognized Instructor or approved Member enters the Community. An
   approved Member whose onboarding is incomplete may browse but cannot post
   Comments or Feedback.
7. An unapproved or revoked person sees access denied with a sign-out action.

Authentication proves identity only. It does not approve Member Membership or
provision a new Instructor.

Every protected page and action checks the current Session and current access
status. At 24 hours, the person must sign in again. Sign-out deletes the current
browser Session without changing Membership. Every signed-in page offers this
action.

**Failure path:** Cancellation returns to sign-in. Authentication failure and an
expired Session grant no access and offer a safe retry. If the Membership lookup
fails, Vibies blocks private access and shows a retry message. It does not show
private page data, internal errors, configuration, or a revoked label without a
successful lookup. An eleventh sign-in start within the browser window waits
until the limit permits another attempt. Clearing browser state can bypass this
basic repeated-click limit; stronger abuse protection is separate work.

## 2. Approve Membership and complete onboarding

**Start:** An authenticated prospective, returning, or Former Member needs a
Membership decision.

**Actors:** Instructor and prospective, returning, or Former Member.

**Outcome — approval:**

1. The Instructor opens the private membership screen and identifies the account
   using its GitHub username and stable identifier.
2. For first approval, the Instructor agrees a Nickname with the Member and
   checks it for real names or contact information. The screen explains that
   automatic validation cannot detect all personal information.
3. For first approval, Vibies trims outer ASCII spaces and validates the
   Nickname rules from the [domain model](DOMAIN.md#people-and-access).
4. Reapproval keeps the Former Member's reserved Nickname and retained records.
5. Vibies approves or reapproves the Membership only when one of the seven
   Member places is available. Approval, capacity enforcement, and Nickname
   reservation are one operation. Repeated submissions create no duplicate.
6. The approved Member may enter and browse the private Community.
7. If onboarding is incomplete, the Member connects a private personal
   repository and publishes a first Personal Project.
8. That first publication completes onboarding permanently.
9. If onboarding was already completed before revocation, reapproval preserves
   that milestone without another publication.
10. A Member whose onboarding is complete can post Comments and Feedback under
   the normal permissions.

A reapproved Former Member returns with the same project ownership, content
authorship, and onboarding milestone they had before revocation.

Later archiving, disconnection, hiding, or deletion of the first project does not
reverse onboarding completion.

**Outcome — revocation:** Under the [community rules](../RULES.md), the Instructor
reviews a warning that access ends while existing content remains. Cancellation
changes nothing. After confirmation, the person becomes a Former Member. The
next protected request or action is blocked, even when a Session remains valid.
This opens a Member place but preserves the Member Role, Nickname, project
ownership, content authorship, onboarding milestone, and existing content states.
Separate moderation and deletion rules continue to apply.

**Outcome: dismissal:** The Instructor may dismiss an unapproved Access entry.
The entry is removed without granting access. A later successful sign-in may
create it again. Dismissal cannot remove a revoked Member or retained content.

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

1. The owner installs or configures selected-repository access in the GitHub App,
   returns to the protected connect page, and refreshes eligible repositories.
   Callback parameters never prove access or ownership.
2. A fresh server check verifies a personal User installation, selected access,
   no suspension, matching stable owner ID, and a private repository.
3. The owner supplies the title, summary, and optional demo link. Only the stable
   repository ID and authored details are stored; picker names are transient.
4. The new Personal Project starts as `Draft`, `Connected`, and `Visible`.
5. The Project counts toward the three-project limit immediately, before
   publication.
6. Vibies does not request or import source files or README contents.

The organization-owned Class Project is not created through this workflow and
does not count toward the limit.

An existing connection opens its retained project without changing any fields,
even when the owner has three projects. Concurrent connections cannot exceed
three retained projects. A repository attached to another retained project
returns a safe conflict without revealing its owner.

**Failure path:** If metadata access is unavailable, the repository is not an
eligible private personal repository, or the Member already has three
non-deleted Personal Projects, no new Project is created. The failure does not
change an existing Project.

## 4. Manually sync repository metadata

Manual Sync remains a separate planned operation. Issue #17 uses Member-written
project details and an explicit Check connection action instead of imported
repository descriptions. See [D-015](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access)
and [workflow 9](#9-disconnect-or-reconnect-a-repository).

## 5. Publish or archive a Personal Project

**Start:** A Member chooses to publish a Draft Personal Project or archive a
Published Personal Project.

**Actor:** Personal Project owner.

**Preconditions:** The Project is non-deleted and belongs to the Member. A Project
must be `Connected` for publication.

**Outcome — publish:**

1. The server route checks current ownership and runs a fresh GitHub verification,
   including for repeated or direct Publish requests. A browser-supplied
   verification result has no authority.
2. The database rechecks current Session, Membership, ownership, row version, and
   eligibility. It saves `Draft` to `Published` and first-time onboarding together.
   A failed write rolls both changes back.
3. Connection and moderation states do not change. A Hidden Draft can publish
   and complete onboarding while remaining unavailable.
4. The Project becomes available only if it is also `Connected` and `Visible`.
5. A repeated Publish returns Already published after current access and GitHub
   checks pass, with no stored changes. Concurrent retries run fresh checks again
   after a version conflict; a second conflict stops with a safe retry.

**Archive outcome:** This remains a separate planned action outside #17.

1. The publication state changes from `Published` to `Archived`.
2. The Project is retained but unavailable to the Community.
3. Connection, moderation, the three-project count, and onboarding completion do
   not change.

**Failure path:** A Member cannot change another Member's Personal Project. A
Disconnected Project cannot complete publication. Publishing never overrides an
Instructor's `Hidden` moderation state. A Disconnected Project needs a successful
Check connection before publication. Archived, missing, and Class Projects are
ineligible. Other failed preconditions change nothing. The accepted Q9 exception
is confirmed GitHub access loss: it saves only Disconnected and stops publication,
preserving publication, moderation, onboarding, and the last successful check
time. Unknown provider failures change nothing.

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

**Precondition:** The target content exists and has not been deleted. For Personal
Projects in #17, the Instructor opens the project page and selects Hide or
Restore. The Instructor can reach a Hidden target for restoration, as well as
available projects. Visible Draft, Archived, and Disconnected projects remain
unavailable to non-owners, including the Instructor. The action
route and database function both check Instructor access. A Member cannot use
these controls or a direct POST to moderate. The full moderation screen remains
outside this issue.

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

**Start:** GitHub access is lost or the owner uses Check connection to verify or
restore access. Deliberate owner Disconnect is a separate planned action outside
#17.

**Actors:** Personal Project owner; Vibies may detect lost GitHub access.

**Outcome — disconnect:**

1. The connection state changes to `Disconnected`.
2. The Project becomes unavailable to the Community.
3. Publication and moderation states do not change.
4. The Project, stored repository ID and authored details, discussion, and Feedback are retained for
   later restoration.

**Outcome — reconnect:**

1. The owner restores metadata-only GitHub App access to the repository.
2. Vibies verifies selected, metadata-only access for the same stable repository
   ID and owner. A public repository is confirmed lost.
3. A successful Check connection saves `Connected` and the last successful check
   time. It preserves authored details, publication, moderation, and onboarding.
4. The Project becomes available only if it is also `Published` and `Visible`.

**Failure path:** A timeout, rate limit, configuration error, malformed response,
or incomplete bounded scan is Unknown and changes nothing. A completed result
that proves lost access saves Disconnected and preserves the last successful
check time. A stale version stops the write, so a late response cannot overwrite
a newer connection check or recreate a deleted project. A Member cannot disconnect or reconnect another
Member's Project. Reconnection does not import source files or README content and
does not override an Instructor's moderation state.

## 10. Delete a Personal Project

**Start:** A Member chooses to delete one of their Personal Projects.

**Actor:** Personal Project owner.

**Precondition:** The Project exists, is non-deleted, and belongs to the Member.

**Outcome:**

1. Vibies explains that the Project and all attached information will be removed.
2. The Member explicitly confirms deletion.
3. Vibies removes the Personal Project, stored repository ID and details, discussion,
   and Feedback.
4. The Project no longer counts toward the Member's three-project limit.
5. If publishing this Project completed onboarding, onboarding remains complete.
6. Deletion changes nothing on GitHub. Repeated deletion reveals no ownership
   details. Connecting the deleted repository again creates a new Draft with a
   new ID.

Deleting the Project also removes Comments and Feedback authored by other Users
because they belong to its discussion. It does not give the owner permission to
rewrite those contributions before deletion.

**Failure path:** Cancelling or leaving the confirmation changes nothing. A
Member cannot delete another Member's Personal Project. Hiding, archiving, or
disconnecting is not a substitute for confirmed deletion.

## 11. Recover Instructor access

**Start:** The designated Instructor cannot use the existing GitHub account.

**Actor:** Deployment owner.

**Preconditions:** The owner verifies the Instructor through an existing trusted
channel outside Vibies, selects a separate GitHub account that is not a Member,
and writes the reason in the private audit record. Ordinary sign-in cannot start
this workflow.

**Outcome:**

1. The owner-only recovery operation locks the single Instructor designation.
2. It designates the verified replacement and invalidates Sessions for the old
   and replacement accounts.
3. The old account loses Instructor access on its next protected request or
   action.
4. Exactly one Instructor remains, and the active Member count is unchanged.

**Failure path:** A Member account cannot become the replacement through
recovery. A rejected recovery changes no designation or Membership. Account
transfer requires a separate reviewed procedure.

## 12. Edit Personal Project details

**Actor:** Current approved owner of a retained Personal Project.

**Outcome:** The owner saves a title, short summary, and optional HTTPS demo link
before or after publication. An empty demo field removes the link. Server checks
apply the [canonical field rules](DOMAIN.md#projects-and-repositories). Only
these three authored fields and the concurrency version change. Publication,
connection, moderation, ownership, and onboarding remain unchanged.

**Failure path:** Invalid input, cross-origin requests, lost Membership, wrong
ownership, a deleted project, or a version conflict make no change. Stored text
renders as plain text. Demo links send no referrer; Vibies does not fetch, embed,
or preview their destinations. The detail form explains the privacy rules and
the accepted GitHub Pages destination exception.
