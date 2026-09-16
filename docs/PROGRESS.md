# Progress

[Documentation home](../README.md) · [Decisions](DECISIONS.md) ·
[Roadmap](ROADMAP.md)

**Updated:** 2026-09-16

## Repository setup

The open-source readiness work from issue #8 merged through PR #9 on
2026-09-02, and the move recorded in
[D-011](DECISIONS.md#d-011-open-the-repository-under-vibies-club) is complete:

- The repository is public at `vibies-club/vibies` under the Apache
  License 2.0.
- Main is protected: every change arrives through a PR with one approving
  review from a Member or the review agent `Trident-app`, and passing `links`,
  `app-check`, and `migration-check` checks.
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

[PR #34](https://github.com/vibies-club/vibies/pull/34) merged the issue #32
Vercel Preview cleanup on 2026-09-12; its workflow runs on every merged
same-repository PR, and the final receipt is posted on issue #32. [PR #40](https://github.com/vibies-club/vibies/pull/40)
merged on 2026-09-13 and raised the class to eight Member places with a fourth
migration. [PR #42](https://github.com/vibies-club/vibies/pull/42) merged the
same day and records the Instructor-run review agent account in D-017.
[PR #38](https://github.com/vibies-club/vibies/pull/38) merged the reusable
staging workflow for issue #37 on 2026-09-14; the [deployment guide](DATABASE-DEPLOYMENT.md#reusable-staging)
records its setup receipts and post-merge checks. Staging is live with the
Instructor designated and one Member approved; two Clear runs passed on
2026-09-14 and 2026-09-15, the baseline was updated after the schema merge,
and the first Preview PR selection is pending.
[PR #45](https://github.com/vibies-club/vibies/pull/45) merged on 2026-09-16
and records that automatic Supabase Preview branching is off.
[PR #47](https://github.com/vibies-club/vibies/pull/47) merged the same day and
documents the staging-era workflow for contributors and agents. The 2026-09-16
cleanup deleted the last Supabase preview branch, switched automatic branching
off, and removed 65 stale Vercel preview deployments from both projects; schema
PRs use the full migration proof in CI.

[PR #43](https://github.com/vibies-club/vibies/pull/43) merged the optional
Personal Project Roadmap from issue #20 on 2026-09-15. Production and staging
hold its migration `20260913212638`. The
[Roadmap verification record](ROADMAP-VERIFICATION.md) records the automated
receipts; the P8 and P13 browser receipts on staging are pending.
[D-019](DECISIONS.md#d-019-add-optional-personal-project-roadmaps) records the
accepted design.

## Next step

Record the P8 and P13 browser receipts for
[PR #43](https://github.com/vibies-club/vibies/pull/43) on staging in
[Roadmap verification](ROADMAP-VERIFICATION.md). Approve the eighth student
through the normal flow when they sign in. Bring
[PR #33](https://github.com/vibies-club/vibies/pull/33) and
[PR #36](https://github.com/vibies-club/vibies/pull/36) back to a mergeable
state on current main and answer the PR #33 review; after PR #33 merges, verify
its Production migration before the Error Library app child starts. Run the
first Preview PR selection on staging when an eligible PR exists and record its
receipt. Close issue #32; its final receipt is posted. Complete the live
Production Member publishing check when Builder is available. Only the
Instructor merges.
