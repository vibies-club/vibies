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

Issue #29 added automatic main database migrations and feature Preview cleanup.
[PR #30](https://github.com/vibies-club/vibies/pull/30) merged after Member
review. Its [post-merge receipt](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747)
records main at `a5fabc1`, the three expected migration versions, and removal of
its ephemeral Preview. The [Production follow-up](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630665472)
records three App settings moved to Production and a passing Ready redeploy.
Live Production Member publishing remains pending while Builder is offline.
[Database deployment](DATABASE-DEPLOYMENT.md) owns the detailed receipts.

The issue #17 Preview database was removed automatically after merge. The legacy
`access-review-5` was deleted separately with the owner's explicit approval.
Main was retained. These [cleanup receipts](https://github.com/vibies-club/vibies/issues/29#issuecomment-5626049922)
do not establish full Production readiness.

## Next step

Complete the review process for [PR #33](https://github.com/vibies-club/vibies/pull/33),
which contains the issue #31 database work, and
[PR #34](https://github.com/vibies-club/vibies/pull/34), which contains the issue
#32 Vercel cleanup. Only the Instructor merges. These PRs deploy no new app
feature. After PR #33 merges, verify its Production migration before starting
the Error Library app child. After PR #34 merges, verify its first GitHub Actions run with the
dedicated project token. Complete the live Production Member publishing check
when Builder is available.
