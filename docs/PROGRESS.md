# Progress

[Documentation home](../README.md) · [Decisions](DECISIONS.md) ·
[Roadmap](ROADMAP.md)

**Updated:** 2026-09-10

## Repository setup

The open-source readiness work from issue #8 merged through PR #9 on
2026-09-02, and the move recorded in
[D-011](DECISIONS.md#d-011-open-the-repository-under-vibies-club) is complete:

- The repository is public at `vibies-club/vibies` under the Apache
  License 2.0.
- Main is protected: every change arrives through a PR with one approving
  review and passing `links` and `app-check` checks, and only the instructor can push or
  merge. The protection applies to the instructor too.
- The reviewers team holds Write access, the organization requires 2FA, and
  members cannot create repositories.
- Seven member invitations are pending. Accepting one joins the reviewers
  team.

## Product status

Issue #13 merged through PR #15 on 2026-09-07. It provides:

- a minimal Node.js 24, npm, Next.js 16 App Router, and TypeScript application;
- a public `/demo` page that reads the fixed synthetic Supabase row with
  `id = 1`;
- an idempotent demo table setup, metadata proof, and Data API read and
  write-denial check;
- local setup and Vercel deployment instructions.

The demo is separate from the Vibies product domain. It has no real Personal
Projects or Class Projects, member data, product writes, repository import, or
synchronization.

Local implementation exists. The `beta-momo/vibies` Vercel project is linked
locally and connected to `vibies-club/vibies` on GitHub. The Supabase CLI applied
the demo SQL twice to the previously empty public schema. One sample row
remains, RLS is enabled, and anonymous grants allow SELECT only.

Tests, type checking, and a build without database configuration pass. The
human-run Data API check passed all ten checks. Local and Preview pages display
the stored sample and show database edits on new requests. Preview empty and
safe error states also pass. The original sample and read grants are restored.

[PR #15](https://github.com/vibies-club/vibies/pull/15) holds the demo verification
receipts and [Preview link](https://vibies-git-feature-supabase-demo-13-beta-momo.vercel.app/demo).

Issue #5 merged through [PR #16](https://github.com/vibies-club/vibies/pull/16).
GitHub sign-in, private access, Instructor membership management, and live access
receipts are in [Access verification](ACCESS-VERIFICATION.md).

Issue #17 is in draft implementation on `feature/personal-projects-17`, based on
main `39fda5a`. The [approved issue](https://github.com/vibies-club/vibies/issues/17)
now points to the interview plan, required Skeptic pass, and explicit plan
amendments. [D-015](DECISIONS.md#d-015-share-member-written-personal-projects-with-checked-repository-access)
was committed before application code.

The first stage implements Connect, Publish, Check connection, and private
Community reading. The [project proof record](PROJECT-VERIFICATION.md) lists the
actual local results and hosted setup and live receipts. The isolated
database, Preview, OAuth sign-in, and GitHub App are configured. Guide signed in
and approved Builder and Scout. Live receipts now show Member access, a private
repository in the picker, publication and onboarding, Scout's Community list,
Guide's list and direct read, and signed-out denial. Scout's direct read is
human-confirmed. Selected-access loss preserves publication and onboarding and
removes the project from shared reads. Builder and Scout confirmed restoration
of the original project; Guide's list and original direct URL also pass. The
first-stage proof gate is complete.

## Next step

Edit and Delete (P10 to P12) now pass local database and HTTP proof, including
delayed provider responses after edits and deletion. Instructor Hide and Restore
(P16) pass local proof too. Resolve the final moderation review findings before the hosted check.
Keep the PR draft until every row has a receipt. A Member reviews; only the
Instructor merges.
