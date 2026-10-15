# Accepted Decisions

[Documentation home](../README.md) · [Product definition](../PRODUCT.md) ·
[Domain model](DOMAIN.md) · [Workflows](WORKFLOWS.md)

This log records why the Vibies knowledge foundation has its current shape. The
linked documents remain authoritative for the detailed definitions and behavior.

## D-001: Build shared knowledge before features

**Status:** Accepted.

**Decision:** Issue #6 creates a document-only product knowledge foundation before
the team chooses or implements application features.

**Why:** A shared vocabulary, scope, and set of boundaries lets future feature
work begin from the same understanding instead of conflicting assumptions.

**Consequence:** This work adds no application code, interface, API, database,
records, authentication, synchronization, or GitHub configuration. Feature
planning begins only after this foundation is reviewed.

**Related documents:** [Product definition](../PRODUCT.md),
[progress](PROGRESS.md), and [roadmap](ROADMAP.md).

## D-002: Give each kind of knowledge one home

**Status:** Accepted.

**Decision:** README is the documentation index; RULES owns behavior and safety;
AGENTS owns repository working instructions; PRODUCT, DOMAIN, WORKFLOWS,
DECISIONS, PROGRESS, and ROADMAP each own the concern named by the file.

**Why:** Linking to one definition is less likely to drift than copying it into
several files.

**Consequence:** Other documents may summarize a rule for context, but they link
to its authoritative definition instead of creating a competing definition.

**Related document:** [Documentation index](../README.md).

## D-003: Require both identity proof and approval

**Status:** Accepted.

**Amended by:** [Issue #39](https://github.com/vibies-club/vibies/issues/39),
shipped in [PR #40](https://github.com/vibies-club/vibies/pull/40) on 2026-09-13.
The class now has eight students, so Vibies provides eight active Member places.
The pre-established Instructor remains separate and does not occupy a Member place.

**Decision:** Vibies is private, with one pre-established Instructor place and
eight active Member places. GitHub establishes each User identity. D-022 adds
optional Google sign-in only after explicit linking to that identity. Instructor-
approved Membership grants Member access; the sole Instructor does not occupy a
Member place or self-approve.

**Why:** Authentication answers who a person is, while a pre-established
Instructor identity and Instructor approval of Members protect the private
Community boundary.

**Consequence:** Successful GitHub authentication alone never grants new access.
The Instructor cannot approve more than eight active Members. Revocation creates
a Former Member and temporary vacancy without deleting or rewriting content;
Role, ownership, authorship, and onboarding completion are retained for possible
reapproval.

**Related documents:** [Product community boundary](../PRODUCT.md) and
[domain people and access](DOMAIN.md).

## D-004: Display nicknames and minimize private data

**Status:** Accepted.

**Supplemented by:** [D-013](#d-013-restrict-github-identity-to-access-management),
which records the narrow Instructor-only identity exception accepted in issue #14.

**Decision:** Nicknames are the only displayed identity. GitHub usernames,
avatars, and personal details remain private, and real names, secrets, tokens,
and installation IDs are excluded from this foundation.

**Why:** Vibies includes beginners of different ages and is designed to protect
personal information.

**Consequence:** Documentation and future features must use privacy-safe examples
and must not expose GitHub profile identity.

**Related documents:** [Product privacy boundaries](../PRODUCT.md) and
[community rules](../RULES.md).

## D-005: Center onboarding on a Personal Project

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

**Related documents:** [Product member journey](../PRODUCT.md) and
[domain constraints](DOMAIN.md).

## D-006: Keep GitHub access selected, minimal, and manual

**Status:** Accepted.

**Supplemented by:** [D-015](#d-015-share-member-written-personal-projects-with-checked-repository-access),
which replaces imported Personal Project descriptions with Member-written details
and defines explicit connection checks for issue #17.

**Decision:** Members connect selected private personal repositories through a
GitHub App with metadata-only access. Source files and README contents are not
imported. Metadata updates only through a manual Sync action that exposes a
last-sync time.

**Why:** Selected, metadata-only access protects repository contents. Manual sync
keeps the first product predictable and avoids background integration complexity.

**Consequence:** Automatic sync, webhooks, GitHub App setup, and synchronization
implementation are outside this foundation.

**Related documents:** [Product projects and GitHub](../PRODUCT.md) and
[sync workflow](WORKFLOWS.md).

## D-007: Separate discussion from structured Feedback

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

## D-008: Keep project state groups independent

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
[project availability](../PRODUCT.md).

## D-009: Distinguish disconnection, moderation, and deletion

**Status:** Accepted.

**Supplemented by:** [D-015](#d-015-share-member-written-personal-projects-with-checked-repository-access),
which replaces imported metadata with Member-written details, and
[D-019](#d-019-add-optional-personal-project-roadmaps), which deletes a
Roadmap and its Milestones with the Personal Project.

**Decision:** Disconnection preserves a Project for reconnection. Instructor
moderation hides or restores content without rewriting it. Confirmed owner
deletion removes the Personal Project, imported metadata, discussion, and
Feedback.

**Why:** Temporary access loss and moderation must be reversible without being
confused with deliberate removal, while authorship must remain intact.

**Consequence:** Only deletion reduces the non-deleted Personal Project count.
The Instructor cannot use moderation to rewrite member content, and reconnection
does not clear a moderation decision.

**Related documents:** [Product moderation, disconnection, and deletion](../PRODUCT.md)
and [corresponding workflows](WORKFLOWS.md).

## D-010: Do not invent unassigned lifecycle authority

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

**Related documents:** [Product boundaries](../PRODUCT.md),
[domain concepts](DOMAIN.md), and [workflow scope](WORKFLOWS.md).

## D-011: Open the repository under vibies-club

**Status:** Accepted.

**Supplemented by:** [D-017](#d-017-review-prs-with-an-instructor-run-agent-account),
which lets the Instructor's review agent account satisfy the review rule, so
the approving review comes from a Member or from `Trident-app`.

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
colon because the writing rules exclude em dashes; the older headings now use
the same form.

**Related documents:** [Contributing guide](../CONTRIBUTING.md),
[community rules](../RULES.md), and [agent rules](../AGENTS.md).

## D-012: Prove the first public data path with a synthetic demo

**Status:** Accepted.

**Decision:** Issue #13 uses Node.js 24, npm, Next.js 16 App Router with
TypeScript, Supabase, and Vercel for one public demo. The `/demo` page reads the
fixed synthetic row `public.demo_projects.id = 1` through an unauthenticated
Supabase client with a publishable key. Vercel deployment belongs to the
`beta-momo` account.

**Why:** One small browser-to-database path gives the class a concrete way to
learn local setup, Row Level Security, deployment, and proof before private
product features add more risk and decisions.

**Consequence:** The demo table stays separate from Personal Projects and the
Class Project. It contains synthetic data only. It adds no authentication,
write feature, ORM, GitHub integration, or real product data. The `anon` role
can select the demo row and cannot write. The `authenticated` role receives no
demo access; private access was outside issue #13's scope and was later
implemented by [D-014](#d-014-use-direct-github-oauth-and-a-private-database-api).
Humans supply public configuration locally and in Vercel. This decision does not
define the full Vibies product or its future production data model.

**Related documents:** [Demo data model](DATA-MODEL.md),
[Supabase setup](SUPABASE-SETUP.md), and [progress](PROGRESS.md).

## D-013: Restrict GitHub identity to access management

**Status:** Accepted in [issue #14](https://github.com/vibies-club/vibies/issues/14).

**Decision:** D-004 remains the general privacy rule. Issue #14 supplements it
with one narrow exception: only the Instructor membership screen may show the
current GitHub username and stable account identifier, and only to identify an
account for an access decision. Member-facing pages show Nicknames only. The
feature stores the stable identifier, current username, and required access
records. It does not store profile names, avatars, email addresses, or
biographies. The GitHub profile response is transient and is discarded after
projecting the stable identifier and username.

The Instructor records a Member-agreed Nickname during first approval. The
Nickname rules are defined in [DOMAIN](DOMAIN.md#people-and-access). Nickname
editing is outside this feature.

**Why:** The Instructor needs enough private information to distinguish accounts
without exposing GitHub identity to Members or retaining unrelated profile data.

**Consequence:** Access management is an explicit supplement to D-004. Direct
requests by any non-Instructor must not reveal account details. Receipts use
synthetic identifiers and Nicknames.

**Related documents:** [Product privacy boundaries](../PRODUCT.md#privacy-boundaries),
[domain people and access](DOMAIN.md#people-and-access), and
[access verification](ACCESS-VERIFICATION.md).

## D-014: Use direct GitHub OAuth and a private database API

**Status:** Accepted for issue #5 after the approved plan and Skeptic pass.

**Decision:** The first access feature uses the native GitHub OAuth authorization
code flow with no requested scope. It uses Node.js cryptography and `fetch`
instead of an authentication framework. Each OAuth state is one-use, expires in
10 minutes, is bound to its browser and PKCE verifier, and is consumed in one
database operation. A cancelled flow or a GitHub HTTP 200 response containing an
error fails safely. GitHub profile fields are projected as specified in D-013.

Browser Sessions use random opaque cookies. Only their hashes are stored. Each
Session expires absolutely 24 hours after sign-in, rotates at sign-in, and is
deleted at sign-out. Every protected request and action joins the current
Session to the current Instructor or Membership status. The browser sign-in
counter permits 10 starts in a rolling 10-minute window and is updated before
redirecting to GitHub.

The server connects with `postgres` 3.4.9 through a dedicated TLS Supabase
pooler connection. Product tables and callable functions live in the private
`vibies_private` schema. The SQL creates `vibies_runtime` as a `NOLOGIN` role
with only the required function execution rights. A human creates the dedicated
login role and grants it `vibies_runtime`. The browser receives no database
credential or service-role key. Instructor designation and recovery remain
owner-only database operations outside the runtime role.

**Why:** This design avoids automatic GitHub profile import, makes session expiry
absolute, closes approval races in PostgreSQL, and keeps private access records
outside the public Data API.

**Consequence:** The database is the authorization boundary. Approval locks the
single capacity record and saves capacity and Nickname uniqueness together.
Revocation is effective at the next protected request. Recovery rejects a Member
account, preserves the Member count, invalidates affected Sessions, and records
its reason privately. Membership lookup and configuration failures deny access
with a safe retry.

The public `/demo` continues through its separate anonymous Supabase client.
This feature does not change the grants accepted in D-012.

**Related documents:** [Access setup](ACCESS-SETUP.md),
[access verification](ACCESS-VERIFICATION.md), and [access workflows](WORKFLOWS.md).

## D-015: Share Member-written Personal Projects with checked repository access

**Status:** Accepted in [issue #17](https://github.com/vibies-club/vibies/issues/17),
through the [interview plan](https://github.com/vibies-club/vibies/issues/17#issuecomment-5622731491),
[Skeptic pass and Owner answers](https://github.com/vibies-club/vibies/issues/17#issuecomment-5622944893),
and [plan amendments](https://github.com/vibies-club/vibies/issues/17#issuecomment-5623003691).

**Decision:** A Personal Project stores its stable repository ID and a
Member-written title, summary, and optional HTTPS demo link. This changes DOMAIN's
Personal Project and GitHub Repository definitions and `syncs_from` relationship,
PRODUCT's Projects and GitHub section, WORKFLOWS 3 outcome 1, and D-006's imported
metadata and manual Sync model for this feature. GitHub metadata is transient
eligibility evidence. Repository descriptions, URLs, source, and README contents
are not imported. Members control the shared description, and provider data
storage stays small.

PRODUCT's owner operations and WORKFLOWS gain Edit and Check connection. Edit
changes only the three authored fields in any retained state. Check connection
detects loss or restores the same repository. DOMAIN's Connected definition is
last known status. There are no background checks. Manual Sync, deliberate owner
Disconnect, and Archive actions remain outside #17.

WORKFLOWS 5 and 9 gain the accepted Q9 exception: every Publish request verifies
GitHub on the server. Confirmed loss saves Disconnected and rejects publication
while preserving publication, moderation, and onboarding. A repository that
becomes public is confirmed loss. Unknown failures change nothing. The pages
state that the repository must stay private. This distinguishes established
access loss from uncertain provider failure.

D-004, D-013, and PRODUCT's privacy boundaries gain one explicit exception:
Members may choose any valid HTTPS demo host, including GitHub Pages. A chosen
destination can contain a GitHub username. Application-supplied shared identity
remains Nickname-only. The form retains the privacy instruction because automated
checks cannot identify every personal detail in arbitrary text or destinations.

WORKFLOWS 8 and PRODUCT's feature scope include minimal Instructor Hide and
Restore actions on the project page, including access to a Hidden target for
restoration. They change only moderation state and the concurrency
version. This makes the existing moderation promise usable when Community reads
ship. A full moderation screen remains outside #17.

**Why:** These changes deliver the approved connection-to-publication journey,
keep shared descriptions under Member control, handle access loss explicitly,
and give the Instructor a working response to rule-breaking shared content.

**Consequence:** Publication, connection, and moderation stay independent.
Publishing and permanent onboarding complete in one transaction. Session,
Membership, ownership, and row version are checked at each protected write;
fresh GitHub verification is the server route's responsibility. Source import,
automatic sync, webhooks, Comments, Feedback, Class Project lifecycle, repository
transfer, and GitHub repository modification remain outside this issue.

**Related documents:** [Product](../PRODUCT.md), [domain](DOMAIN.md), and
[workflows](WORKFLOWS.md).

**Owner clarifications on 2026-09-10:** The [implementation review answers](https://github.com/vibies-club/vibies/issues/17#issuecomment-5623179154)
require an opaque internal account UUID as the project owner reference. The
stable GitHub account ID remains in the access account, and project records
reference only its internal UUID. This satisfies P13 without copying GitHub
identity into project records. The Instructor can read available projects plus
Hidden targets for restoration. Visible Draft, Archived, and Disconnected
projects remain unavailable to non-owners, including the Instructor.

**Moderation version answer on 2026-09-10 UTC:** The owner
[requires review of the current version](https://github.com/vibies-club/vibies/issues/17#issuecomment-5625398735).
Hide and Restore submit the version shown on the Instructor's project page.
The database compares it with the current locked row and rejects any intervening
change without a write. The Instructor then reviews the current content before
trying again. This prevents an old Restore form from exposing unseen edits.

## D-016: Deploy reviewed schema changes through native migrations

**Status:** Accepted implementation scope in the owner's request for
[issue #29](https://github.com/vibies-club/vibies/issues/29).

**Decision:** Connect Supabase main to the repository's protected `main` branch
and use its native production deployment for versioned SQL migrations. Current
standalone SQL remains the schema definition; exact versioned snapshots are
deployment history. CI checks their agreement and tests the native migration
chain on an isolated local database. Production credentials stay out of GitHub
Actions. GitHub's reviewed merge remains the release gate.

**Why:** A reviewed merge should apply its database changes without repeated
manual SQL setup. Native migration tracking avoids a custom deployment runner
and preserves the existing main database and its applied history.

**Consequence:** Schema deployment does not transfer Preview data or repeat
identity, approval, OAuth, App, or login setup. Supabase and Vercel deploy
independently, so database changes must support the deployed app during rollout.
Failure and first-production receipts remain explicit. Applied migrations are
immutable; the Instructor must verify an unapplied version before a reviewed
repair exception. The [deployment guide](DATABASE-DEPLOYMENT.md) owns the steps.

**Original owner cleanup addition:** Automatic Preview branching stayed enabled.
Feature Previews used the native ephemeral lifecycle and the matching GitHub
branch, so Supabase deleted them after PR merge or close. The owner requested
this to end unused branch compute charges. Main was retained. Preview proof had
to finish before merge because deletion did not wait for Production deployment.
Legacy unlinked branches needed separate reconciliation. After PR #18 merged,
the owner explicitly authorized deleting `access-review-5` and confirmed
Builder's Production profile access. The [cleanup receipt](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922)
records its deletion and retained main. Full Production verification remains
separate from that access confirmation.

**Issue #37 amendment on 2026-09-13:** Keep automatic paid Preview branching on
only during the reusable staging rollout. Disable it for future PRs after shared
staging passes its complete Action and hosted proof, and after the owner
inventories all existing active branches. Existing review environments keep
their approved review and cleanup path. A database-changing PR that needs hosted
proof can use an isolated environment only with an agreed cost cap.

**Owner action on 2026-09-16:** Both conditions were met. Shared staging passed
its Action proof twice, and the owner inventoried the Production project's
branches: only `feature/error-library-database-31`, for the open PR #33,
remained, because the native lifecycle had already removed the merged PR #40 and
PR #43 branches. With the owner's explicit approval, that branch was deleted and
**Automatic branching** was switched off, with **Deploy to production** kept on
for `main`. Schema-changing PRs now rely on the full disposable migration proof
in `migration-check`. A hosted database branch is an explicit exception with an
agreed cost cap, created and deleted by the owner. The
[cleanup receipt](https://github.com/vibies-club/vibies/issues/37#issuecomment-5693405515)
records both actions.

## D-017: Review PRs with an Instructor-run agent account

**Status:** Accepted by the Instructor on 2026-09-13.

**Decision:** The Instructor operates one GitHub machine account,
`Trident-app`, driven by a coding agent. The account belongs to the
`reviewers` team with Write access, so its approval satisfies the one-approval
rule on main. It reviews only. It never authors, commits, or pushes. It is not
a Vibies Member and holds no Member place. A review by this account checks out
the PR branch, runs typecheck, tests, and build, reads the diff against the
approved plan, and approves only after the last commit it checked. The account
profile states that it is a machine account run by the Vibies Instructor.

**Why:** Members split limited AI usage between their Personal Projects and
Vibies, so waiting for a Member review slows the platform. GitHub's terms allow
one free personal account per person plus machine accounts for automation, so
the reviewer is a machine account and never reviews by hand.

**Consequence:** An approval from `Trident-app` is a second agent pass and
the PR records it as such. A Member review remains welcome and counts the same.
The [contributing guide](../CONTRIBUTING.md) and [agent rules](../AGENTS.md)
accept either review. The account cannot open the staging site, so the
hosted check stays with the PR author's receipts and the Instructor's
confirmation before merge. The Instructor remains the only person who merges.
The account holds no product secret and no Member identity.

**Related documents:** [Contributing guide](../CONTRIBUTING.md),
[agent rules](../AGENTS.md), and [D-011](#d-011-open-the-repository-under-vibies-club).

## D-018: Reuse one free staging environment for app reviews

**Status:** Accepted in [issue #37](https://github.com/vibies-club/vibies/issues/37)
on 2026-09-13. The former Supabase/Vercel implementation went live after PR #38
on 2026-09-14, with two recorded Clear runs and its first Preview PR selection
pending. Its historical receipts remain in the deployment guide and Git history.

**2026-10-15 amendment, issue #61:** Implement a Cloudflare replacement using
one fixed `vibies-staging` Worker and a new isolated synthetic D1 database per
operation. Instructor merge and hosted Preview PR/Clear proof remain pending;
this amendment does not claim a live switch or retire the source deployment.

**Decision:** The Instructor runs the manual workflow from trusted current
main. It validates the exact eligible PR head and required checks, builds that
head without deployment credentials, and deploys the verified artifact through
trusted main scripts in the protected staging job. Main's D1 migration prefix
is immutable; new migrations may be appended for isolated schema review.
Clear repeats the same process for current main. The workflow never pushes the
`staging` ref.

**Why:** One stable review URL and disposable synthetic databases provide exact
revision and schema evidence without exposing source data or provider secrets
to candidate code. Separate build and deployment jobs preserve the trusted
credential boundary.

**Consequence:** Receipts require matching artifact, schema, migration, version,
database, SHA, provider bindings, and a fresh no-store identity response. This
secret-free staging environment cannot prove authenticated Member flows on its
own. Existing required CI checks remain. Free-plan limits fail closed; no paid
upgrade or automatic purchase is authorized. The
[deployment guide](DATABASE-DEPLOYMENT.md#reusable-staging) owns setup, operation,
limits, pending hosted gates, and source rollback history.

## D-019: Add optional Personal Project roadmaps

**Status:** Accepted design from the completed grill for the
[Ready body in issue #20](https://github.com/vibies-club/vibies/issues/20).
Shipped in [PR #43](https://github.com/vibies-club/vibies/pull/43) on
2026-09-15; P8 and P13 browser receipts pending on staging.

**Decision:** Personal Projects gain an optional Roadmap with zero through 20
ordered Milestones. Each Milestone has a plain-text title, a completion value,
and an optional Blocked note. The owner adds one at a time, edits one at a time,
reorders with Move up and Move down controls, completes or reopens it with one
Complete checkbox, and deletes it after a confirmation that identifies it.
Progress is derived from completed Milestones.

Roadmap visibility follows Project visibility, and only the current approved
owner can change it. The owner can manage a Roadmap in every retained Project
state. A stale write stops without replacing newer data and asks the owner to
reload. The experience is defined in
[PRODUCT](../PRODUCT.md#personal-project-roadmaps) and the invariants in
[DOMAIN](DOMAIN.md#projects-and-repositories).

Project state changes preserve Roadmap data, and deleting a Personal Project
deletes its Milestones. The Roadmap remains optional for publication. Dates,
deadlines, assignees, notifications, milestone Comments, change history,
imports, Class Project Roadmaps, and student learning Roadmaps remain outside
the first version.

**Why:** A shared Roadmap lets a Member show current progress and explain a
blocked next step on the Project page. The 20 item limit and derived Progress
keep the first version small and easy to understand. Current Roadmap display
keeps the page useful without introducing public history.

**Consequence:** [DOMAIN](DOMAIN.md) owns Roadmap terms and invariants,
[PRODUCT](../PRODUCT.md) owns the experience and boundaries, and
[WORKFLOWS](WORKFLOWS.md) owns the owner and viewer flows. The implementation
must preserve existing Personal Project ownership, availability, moderation,
privacy, and deletion rules. [Roadmap verification](ROADMAP-VERIFICATION.md)
tracks the 14 acceptance receipts.

**Related documents:** [Issue #20](https://github.com/vibies-club/vibies/issues/20),
[domain model](DOMAIN.md), [product definition](../PRODUCT.md),
[workflows](WORKFLOWS.md), and [roadmap verification](ROADMAP-VERIFICATION.md).

## D-020: Configure a project agent workflow and craft policy

**Status:** Accepted by the owner's master setup prompt on 2026-10-08.

**Decision:** Keep one root [PRODUCT.md](../PRODUCT.md) and one root
[DESIGN.md](../DESIGN.md). [AGENTS.md](../AGENTS.md) owns the agent workflow,
[CRAFT.md](CRAFT.md) owns craft policy, and [SKILLS.md](SKILLS.md) owns skill
routing. Project Codex settings and agent definitions live in `.codex/`;
project skills live in `.agents/skills/`.

**Why:** Shared project instructions make the required process and design
quality reproducible across contributors and future agent sessions.

**Merge boundary:** The owner explicitly retained the current merge rule:
only the Instructor merges. Required GitHub approval, the three head checks,
staging eligibility, and post-merge receipts remain in force. The local
`pr_reviewer` verdict supplements these gates.

## D-021: Build the Workers application with vinext

**Date and status:** 2026-10-15, selected for issue #61 and implemented locally;
Instructor merge and hosted compatibility proof pending.

**Decision:** Keep the Next.js App Router source and use `vinext` 1.2.0,
`@vinext/cloudflare` 1.1.1, Vite 8.3.4, and `@cloudflare/vite-plugin` 1.64.0 for
the Workers build. Wrangler 4.151.0 supplies deployment tooling. The separate
`build:vinext` command preserves the existing Next build as source-stack proof.

**Why:** This provides a Workers runtime path while retaining the current app
structure. Local build success is not proof of hosted route or browser parity.

## D-022: Add optional linked Google sign-in through Better Auth

**Date and status:** 2026-10-15, selected for issue #61 and implemented locally;
provider setup and hosted authentication proof pending.

**Decision:** Pin Better Auth 1.7.9 for the D1-backed Google subsystem. GitHub
remains the first account identity and approval path. An approved Member may
link Google only with a fresh GitHub-authenticated session and a one-use grant.
Google sign-in requires that existing link; email matching, public signup, and
password sign-in are disabled. Provider profile and token retention are blocked.

**Why:** Optional Google access must preserve the existing Member identity,
Instructor approval, and nickname-only privacy rules. Configuration gates the
feature; synthetic OAuth tests do not prove live Google authorization.

## D-023: Preserve stable identity when moving domain storage to D1

**Date and status:** 2026-10-15, selected for issue #61 and implemented locally;
source reconciliation and production activation pending.

**Decision:** Use Cloudflare D1 through binding `DB`, preserving existing account
UUIDs, GitHub identifiers, nicknames, approvals, project ownership, and domain
relationships. Atomic guarded writes and database constraints retain capacity,
one-use authorization, and stale-write rules. Production starts disabled and
requires a reconciled source snapshot before explicit activation.

**Why:** Changing storage must not create new Members or alter ownership.
Synthetic fixtures and local parity tests cannot substitute for source-data
reconciliation or production cutover receipts. Retain Supabase migration history
and the source deployment for rollback until retirement is authorized.

## D-024: Keep the Cloudflare migration within the Free-plan boundary

**Date and status:** 2026-10-15, selected for issue #61; account Free plan verified,
full authenticated-flow capacity verification pending.

**Decision:** Target Cloudflare Workers and D1 on the Free plan. Do not enable
paid upgrades, subscriptions, or capacity purchases automatically. Staging uses
synthetic data and refuses a run when its database capacity guard is reached.

**Why:** The hosting change must respect the agreed cost boundary. A local
configuration does not establish account entitlement, remaining quota, or live
readiness; each deployment still needs capacity and provider proof.


## D-025: Stream migration data through an isolated Wrangler process

**Date and status:** 2026-10-15, selected for issue #61; synthetic remote proof passed, private-data use and cutover remain gated.

**Decision:** Keep encrypted backups outside the repository. Decrypt in memory and pass migration statements through an isolated process using Wrangler 4.151.0's pinned command handler. Capture and suppress all provider output. Check immutable destination identity and disabled/empty state again inside the same atomic batch, then reconcile every table and sequence.

**Why:** Wrangler's file import rereads its input and cannot consume a non-rewindable stdin pipe safely. Remote bindings stalled in this environment. The HTTPS command-handler path passed a real D1 late-constraint rollback and ten-table reconciliation without putting private SQL in command arguments or files. This version-sensitive path must be revalidated whenever Wrangler changes.

## D-026: Keep preview deployment authority outside candidate code

**Date:** 2026-10-15

**Decision:** Workers Builds deploys only reviewed `main` to `vibies-production`. A separate trusted-main GitHub workflow builds PR code without provider credentials, then validates and deploys an inert artifact to its own synthetic Worker and D1 database. Preview deployment serializes allocation, refuses insufficient Free capacity, verifies source and resource identity, and posts the resulting URL.

**Why:** Worker Preview runtime isolation does not isolate a build token from arbitrary branch scripts. Separate build and deployment jobs preserve the existing private data boundary. Use `CLOUDFLARE_ENV=production` at Vite build time to flatten the reviewed production configuration. See [preview operations](CLOUDFLARE-PR-PREVIEWS.md).
