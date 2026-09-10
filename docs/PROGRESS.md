# Progress

[Documentation home](../README.md) · [Decisions](DECISIONS.md) ·
[Roadmap](ROADMAP.md)

**Updated:** 2026-09-11

## Repository setup

The open-source readiness work from issue #8 merged through PR #9 on
2026-09-02, and the move recorded in
[D-011](DECISIONS.md#d-011-open-the-repository-under-vibies-club) is complete:

- The repository is public at `vibies-club/vibies` under the Apache
  License 2.0.
- Main is protected: every change arrives through a PR with one approving
  Member review and passing `links`, `app-check`, and `migration-check` checks.
  Only the Instructor merges. The protection applies to the Instructor too.
  The [verified settings](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922)
  record the added migration requirement.
- The reviewers team holds Write access, the organization requires 2FA, and
  members cannot create repositories.

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

Issue #17 merged through [PR #18](https://github.com/vibies-club/vibies/pull/18)
on 2026-09-10 UTC at `5e55642`, after Scout approved the completed implementation.
It adds Connect, Publish, Check connection, Community reading, owner Edit/Delete,
and Instructor Hide/Restore. All P1 to P16 receipts and the approved stage order
are in [Project verification](PROJECT-VERIFICATION.md).

Issue #29 adds automatic main database migrations and feature Preview cleanup.
[PR #30](https://github.com/vibies-club/vibies/pull/30) targets main and is ready
for Member review. Local and CI migration proof and the native Supabase Preview
deployment pass. Automatic Preview branching stays on, with limit 3.
[Database deployment](DATABASE-DEPLOYMENT.md) owns the setup and receipts.

The issue #17 Preview database was removed automatically after merge. The legacy
`access-review-5` was deleted separately with the owner's explicit approval.
Main was retained. These [cleanup receipts](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922)
do not establish full Production readiness.

## Next step

Obtain a Member review of PR #30. Only the Instructor merges. After that reviewed
merge, verify the native Production deployment, main's migration history,
Production runtime setup, and deletion of PR #30's ephemeral Preview. Those
post-merge checks remain pending in the deployment guide.
