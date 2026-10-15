# Roadmap

[Documentation home](../README.md) · [Progress](PROGRESS.md) ·
[Accepted decisions](DECISIONS.md)

This roadmap sequences work without inventing features that the team has not yet
chosen.

## Now

- Complete [issue #61](https://github.com/vibies-club/vibies/issues/61): migrate
  hosting and all application data to Cloudflare Workers/D1 on the Free plan,
  preserve GitHub approval and private access, and add explicitly linked Google
  sign-in. PR #62 implements the approved static React/Vite frontend and small
  authenticated, fetch-native Worker APIs after live vinext SSR exceeded the
  Free 10 ms CPU allowance and an isolated OpenNext comparison was slower.
  Preserve D1, the restricted Better Auth integration, and existing access rules.
  Verify the public home prerender and empty private shell, authenticated API
  and OAuth CPU suitability, browser parity, automatic preview/staging receipts,
  and current-head CI and review. Complete production data reconciliation and
  cutover only after the release gates and Instructor merge. Static page and
  private API browser proof passed, but Google authentication still exceeds the
  nominal Free CPU allowance after schema and initialization optimizations.
  The draft migration is blocked on Free-plan auth suitability; a proposed Durable Object OAuth coordinator awaits the owner’s technology choice; keep Vercel and
  Supabase available until their retirement is authorized.

- Record the P8 and P13 browser receipts for issue #20 on staging in
  [Roadmap verification](ROADMAP-VERIFICATION.md).
- Approve the eighth student through the normal flow when they sign in.
- Bring [PR #33](https://github.com/vibies-club/vibies/pull/33) for issue #31
  and [PR #36](https://github.com/vibies-club/vibies/pull/36) for issue #25
  back to a mergeable state. Both are behind main with conflicts, and PR #33
  has changes requested. Only the Instructor merges.
- Complete the live Production Member publishing check when Builder is
  available.

## Next

- Run the first staging Preview PR selection on an eligible PR and record its
  receipt in the [deployment guide](DATABASE-DEPLOYMENT.md#reusable-staging).
- After PR #33 merges, verify its Production migration before starting the
  Error Library app child under issue #27.
- Close issue #32; its final receipt is posted.
- Manual Sync, deliberate owner Disconnect, and Archive actions remain outside
  #17. Resolve their feature plans before implementation.
- Resolve Class Project lifecycle authority or individual Comment and Feedback
  edit and delete behavior before selecting work that depends on either one.

## Later

Discussion, Feedback, stronger sign-in abuse protection, Nickname editing,
account transfer, and other product features need their own approved plans.
