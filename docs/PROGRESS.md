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

Issue #5 is implemented locally on `feature/sign-in-access-5` from the accepted
[issue #14 specification](https://github.com/vibies-club/vibies/issues/14). Its
scope is GitHub sign-in, unapproved access denial, Instructor membership
administration, a minimal protected welcome page, absolute 24-hour Sessions,
sign-out, and owner-run Instructor setup and recovery. The public demo and its
anonymous Supabase client remain separate.

The approved implementation uses direct GitHub OAuth, opaque hashed Sessions,
and a private PostgreSQL API in `vibies_private`. The required human setup is in
[Access setup](ACCESS-SETUP.md). The Skeptic findings and issue checks A1 through
A16 are in [Access verification](ACCESS-VERIFICATION.md). Unit, database, HTTP,
local browser, build, link, and diagram checks pass. Live GitHub, hosted Preview,
and trusted-channel recovery checks remain pending human-owned setup.

## Next step

On a clean staging database, run the access SQL twice and inspect the grants.
Complete the real GitHub Preview and recovery procedures. The automated database
proof runs only against its isolated local fixture database. Record privacy-safe receipts for A1
through A16. Keep the implementation PR draft until the live checks pass, then request Member review. The Instructor merges only after
the six merge-gate checks pass.
