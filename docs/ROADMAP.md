# Roadmap

[Documentation home](../README.md) · [Progress](PROGRESS.md) ·
[Accepted decisions](DECISIONS.md)

This roadmap sequences work without inventing features that the team has not yet
chosen.

## Now

- Personal Project Roadmaps are defined in the
  [product definition](PRODUCT.md#personal-project-roadmaps). The accepted
  design is in [D-019](DECISIONS.md#d-019-add-optional-personal-project-roadmaps),
  and [Roadmap verification](ROADMAP-VERIFICATION.md) holds the 14 acceptance
  receipts for issue #20.
- Issue #17 merged through [PR #18](https://github.com/vibies-club/vibies/pull/18).
  All P1 to P16 rows have receipts in [Project verification](PROJECT-VERIFICATION.md).
- [PR #30](https://github.com/vibies-club/vibies/pull/30) merged after Member
  review. Its [post-merge checks](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747)
  passed for main at `a5fabc1`, all three migration versions, and Preview
  cleanup. The [Production settings and Ready redeploy](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630665472)
  also passed.
- [PR #34](https://github.com/vibies-club/vibies/pull/34) merged on 2026-09-12,
  [PR #40](https://github.com/vibies-club/vibies/pull/40) on 2026-09-13 with
  eight Member places, and [PR #42](https://github.com/vibies-club/vibies/pull/42)
  on 2026-09-13 with the review agent account.
- [PR #38](https://github.com/vibies-club/vibies/pull/38) merged the reusable
  staging workflow for issue #37. Its first deploy-key ref update, Vercel
  trigger, and exact-commit receipt are post-merge checks.
- Review [PR #33](https://github.com/vibies-club/vibies/pull/33) for issue #31
  and [PR #36](https://github.com/vibies-club/vibies/pull/36) for issue #25.
  Only the Instructor merges.

## Next

- Verify the first Vercel cleanup workflow run with the dedicated project token
  after a later same-repository feature PR merges.
- Verify the PR #40 migration and app deployment, then approve the eighth
  student through the normal flow.
- Complete live Production Member publishing when Builder is available.
- After PR #33 merges, verify its Production migration before starting the
  Error Library app child under issue #27.
- Manual Sync, deliberate owner Disconnect, and Archive actions remain outside
  #17. Resolve their feature plans before implementation.
- Resolve Class Project lifecycle authority or individual Comment and Feedback
  edit/delete behavior before selecting work that depends on either one.

## Later

Discussion, Feedback, stronger sign-in abuse protection, Nickname editing,
account transfer, and other product features need their own approved plans.
