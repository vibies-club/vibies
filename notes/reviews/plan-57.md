# Plan review: Issue #57 — `notes/plans/57.md`

**Coverage:** The plan defines a narrow `/sign-in` scope and names the key authentication branches, messages, form behavior, privacy copy, and sign-out behavior to preserve. It also includes the required concept-selection checkpoint, four viewport screenshots, and PR review gates.

**Findings**

1. **[P2] Complete the visual-reference requirements.** Step 2 names the home page as a reference, but `docs/CRAFT.md` locks Miro’s DESIGN.md analysis as the external reference and asks the plan to state what to borrow and what stays Vibies. Name that reference and its intended use. Also make the required `$impeccable` use explicit alongside ImageGen when generating the three concepts.

2. **[P2] Add a regression check for shared `AccessShell` callers.** Step 4 promises the optional presentation class leaves other callers unchanged, but the screenshots cover only sign-in states. Require checking the other callers or an equivalent focused regression check, and verify that the opt-in styles cannot affect them.

3. **[P2] State the repository gates explicitly.** The plan names a feature branch and exact-head CI, but should say to create the branch from current `main` and require green `app-check`, `migration-check`, and `links` checks, as required by `AGENTS.md` and `CONTRIBUTING.md`.

4. **[P3] Make mobile and focus checks measurable.** Replace “readable phone copy” and “warm focus outlines” with the craft/design thresholds: body copy at least 15px on phones and a 3px Amber Ink focus outline, offset 4px, on every interactive element.

**Verdict:** Revise before implementation to make these requirements explicit; the remaining plan structure is sound.

I could not independently fetch the GitHub issue: the web fetch returned a cache miss and `gh` could not connect to `api.github.com`. This review uses the local plan and the specified repository documents.
