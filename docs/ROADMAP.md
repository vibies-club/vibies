# Roadmap

[Documentation home](../README.md) · [Progress](PROGRESS.md) ·
[Accepted decisions](DECISIONS.md)

This roadmap sequences work without inventing features that the team has not yet
chosen.

## Now

- Issue #17 merged through [PR #18](https://github.com/vibies-club/vibies/pull/18).
  All P1 to P16 rows have receipts in [Project verification](PROJECT-VERIFICATION.md).
- [PR #30](https://github.com/vibies-club/vibies/pull/30) merged after Member
  review. Its [post-merge checks](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630352747)
  passed for main at `a5fabc1`, all three migration versions, and Preview
  cleanup. The [Production settings and Ready redeploy](https://github.com/vibies-club/vibies/pull/30#issuecomment-5630665472)
  also passed.
- Complete the review process for [PR #33](https://github.com/vibies-club/vibies/pull/33)
  for issue #31 and [PR #34](https://github.com/vibies-club/vibies/pull/34)
  for issue #32. They deploy no new app feature. Only the Instructor merges.

## Next

- After PR #34 merges, verify the first Vercel cleanup workflow run with the
  dedicated project token. Verify the first automatic cleanup after a later
  same-repository feature PR merges.
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
