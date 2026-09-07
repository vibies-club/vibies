# Progress

[Documentation home](../README.md) · [Decisions](DECISIONS.md) ·
[Roadmap](ROADMAP.md)

**Updated:** 2026-09-07

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

Issue #13 adds the first application slice on the
`feature/supabase-demo-13` branch:

- a minimal Node.js 24, npm, Next.js 16 App Router, and TypeScript application;
- a public `/demo` page that reads the fixed synthetic Supabase row with
  `id = 1`;
- an idempotent demo table setup, metadata proof, and Data API read and
  write-denial check;
- local setup and Vercel deployment instructions.

The demo is separate from the Vibies product domain. It has no real Personal
Projects or Class Projects, member data, authentication, product writes, ORM,
GitHub App configuration, repository import, or synchronization.

Local implementation exists. The `beta-momo/vibies` Vercel project is linked
locally and connected to `vibies-club/vibies` on GitHub. The Supabase CLI applied
the demo SQL twice to the previously empty public schema. One sample row
remains, RLS is enabled, and anonymous grants allow SELECT only.

Tests, type checking, and a build without database configuration pass. The
human-run Data API check passed all ten checks. Local and Preview pages display
the stored sample and show database edits on new requests. Preview empty and
safe error states also pass. The original sample and read grants are restored.

[PR #15](https://github.com/vibies-club/vibies/pull/15) holds the verification
receipts and [Preview link](https://vibies-git-feature-supabase-demo-13-beta-momo.vercel.app/demo).
Vercel access is required to open the protected Preview. Production verification
follows instructor merge.

## Next step

Complete the remaining receipts with the [Supabase setup guide](SUPABASE-SETUP.md)
before merge. Students review the feature PR, and the instructor merges after
the gate passes. Verify Production after merge. Authentication remains pending
in issue #5.
