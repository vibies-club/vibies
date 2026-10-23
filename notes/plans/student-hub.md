# Plan: Vibies Student Hub (v2, after Fable review)

## Goal
Signed-in member opens vibies.club and knows in 5 seconds: next class, what is due, how their product is doing, where to go. All signed-in screens in Hive in Daylight (DESIGN.md), phone first.

## Runway
Mon/Thu slots left: 10-26, 10-29, 11-02, 11-05, 11-09, 11-12, 11-16, Demo Day 11-19 = 8. Target: PR1 + PR2 live before Mon 10-26 class.

## PR1. Shell + Home dashboard + restyle (no behavior change to actions)
- Tokens: one `:root` set in globals.css (palette, type, radius, amber shadows, ease). Do not touch home.css.
- Shell: desktop top bar (logo, mono links). Phone bottom tab bar: Home, Course, Product, Wiki. Instructor overflow: Members, Gates. Hexagon glyphs, Amber Ink active.
- Home (/welcome): 1) Next class card (number, date, one-line goal, Open slides). 2) This week's gate (items as list). 3) Your product (title, progress bar, next milestone, Live badge). 4) Demo Day countdown (mono label). Nothing else. Instructor Home: members waiting, hidden projects.
- Restyle welcome, projects, project, connect, members, wiki, access-denied. Same forms, field names, routes.
- Register up front (avoids later conflicts): paths `/course`, `/course/:n`, `/admin/gates` in services.ts, api.ts, page.ts (instructor redirect for gates), app.tsx stubs, optional PageData fields `course`, `session`, `gates`.

## PR2. Course (members-only slides)
- Private R2 bucket `vibies-course`: `manifest.json`, `decks/sNN.html`, `prompts/*.md`. Binding `COURSE?: R2Bucket` (top-level + production + staging; optional so previews render "Slides not published yet").
- HQ `sessions/course.json` (source of truth: n, title, goal, date, deck, gate items with frozen ids, prompts, phases, Demo Day date) + `ops/publish-course.py`: explicit file list only; hard-refuses `-instructor`, `ai-basics`, `Design-Inspiration`, DRAFT titles; nickname deny-list grep; refuses renamed gate ids; uploads with `wrangler r2 object put --remote`.
- Worker `/course-files/*`: same accessState as pages (member/instructor 200, denied 403, signed out 303 to sign-in with returnTo), `Cache-Control: private, no-store`. No iframe: decks open full screen in a new tab.
- Manifest validated in Worker like `members` (bounds, ids `^[a-z0-9-]{1,40}$`, ISO dates) + unit test.
- `/course`: phase-grouped timeline, hexagon nodes done/today/planned. `/course/:n`: goal, Open slides button, gate table, prompts with copy.

## PR4 (parallel with PR2, project files only). Product
- "Use the course roadmap" button seeds milestones: Core screen, Works on demo data, Data and sign-in, 3 real users, Polish and SEO, Demo Day. Editable.
- Project page: demo link button, roadmap stepper, blocked notes. Empty states with one next action (Install app, Connect, Publish, Use course roadmap). Community folds into Product tab.

## PR3 (only if time remains after PR2). Gates
- Migration 0005 `gate_checks(account_id FK accounts.internal_id, session_no, item_id, state done|needs_work, proof_url https ≤512, note, updated_at)`, unique (account, session, item), upsert, no version. Applied to prod before merge. d1-schema test.
- Member self-ticks on /course/:n. Instructor marks needs-work. `/admin/gates` grid nicknames x sessions, instructor only (page redirect + SQL guard, boundary tests). `gates_mine`, `gates_board` read-only allowed.

## Cut
Iframe deck viewer, verified state, live repo-name fetch, community card grid, separate dashboard PR, Google-linking card on Home.

## Process
PR1 → PR2 (+ PR4 parallel worktree) → PR3. Each: Fable review, fix, checks green, merge = deploy. Browser pass 390px + 1280px on local wrangler dev with seeded member + instructor, screenshots in PR. Real check on vibies.club after merge.

## Decisions (Aref, 2026-10-23)
- Slides members-only. Decks: S1 to S18 plus S11 practical. Instructor guides never.
- Gates: self-tick with optional proof link; instructor can flag needs-work.
- Build all four PRs before students see it: PRs target `feature/student-hub`; one final PR merges it to `main`.

## Shared contract (all PRs use these names)
```ts
// lib/course.ts
type GateItem = { id: string; text: string };            // id ^[a-z0-9-]{1,40}$, frozen after first publish
type CourseSession = { n: number; title: string; goal: string; date: string | null; // YYYY-MM-DD
  phase: string; deck: string | null;                     // R2 key under decks/, e.g. "s18.html"
  gate: GateItem[]; prompts: { file: string; label: string }[] };
type CourseManifest = { version: 1; demoDay: string; phases: { id: string; title: string }[]; sessions: CourseSession[] };
// frontend/contracts.ts PageData additions (all optional)
course?: CourseManifest;        // /welcome, /course
session?: CourseSession;        // /course/:n
gates?: { mine: { sessionNo: number; itemId: string; state: "done" | "needs_work"; proofUrl: string | null; note: string | null }[] }; // /welcome, /course, /course/:n
gateBoard?: { members: { nickname: string; checks: { sessionNo: number; itemId: string; state: "done" | "needs_work" }[] }[] }; // /admin/gates
```

# Addendum: Collaborate (student-proposed feature, 2026-10-23)

New tab **Collaborate** (nav: Home, Course, Product, Collaborate, Wiki). Members-only. Money is recorded, never moved: every amount is a promise settled outside the site; the site keeps the receipt.

## A. Ideas (brainstorm)
- Post an idea: title, problem, who it is for, what help is wanted (checkboxes: co-founder, designer, builder, tester, funding), stage (Idea, Exploring, Building).
- Others: comment, "I'm interested" with a role, "I'd back this" pledge (amount + currency + note, intent only).
- Owner can turn an idea into a project (links to an existing personal project) and invite interested people into its team.
- Feed sorted by recent activity, filter by help wanted.

## B. Teams and shares (per project)
- Project owner invites members as teammates with a role.
- Share agreement: a table of member, role, percent, what they bring. Percents must total 100. Owner proposes a version; every listed teammate accepts or declines; only a fully accepted version is "Active". Changes create a new version; history kept.
- Helper: "Suggest a split" with plain guidance (equal split, weighted by role and time) shown as a starting point the team edits. Clear label: a team record, not a legal contract.
- Share grants from jobs (see C) appear as pending lines that join the next agreement version.

## C. Jobs (bounties)
- Anyone (member or instructor) posts a job: title, description, acceptance criteria (checklist), deliverable type (link to PR, live URL, file link), optional link to their project and milestone, time window in days, compensation: money (amount + currency) and/or share (percent of a project the poster owns), skills tags.
- Payout schedule, default from Aref: delivered within the window = 100%; within 2x the window = 50%; later = 0%. Poster may set custom tiers (up to 3).
- Lifecycle: Open → Claimed (one claimant; clock starts at claim; due dates shown) → Delivered (link + note; delivery time locks the payout tier) → Accepted (poster checks criteria) or Changes requested (claimant resubmits; tier stays locked if resubmitted within 3 days) → Paid (poster marks paid outside; claimant confirms receipt). Claimant can abandon (job reopens); poster can cancel only while Open. Missed final tier auto-expires the claim and reopens the job.
- Instructor can hide any job, and resolve disputes (set final state and tier) with an audit entry.
- Two views: "Open jobs" board (filter: money, share, instructor-funded, skill), "My jobs" (posted / claimed / history). Profile line: jobs completed, on-time rate.
- Instructor-funded jobs are badged "Funded by Aref" (instructor posts them like anyone).

## D. Funding
- On ideas and projects: "Seeking funding" toggle with goal amount + currency. Members pledge (amount, note). Totals shown to members. Owner marks a pledge as received (outside). No payments on site.

## Data (D1, migration 0006)
ideas, idea_interest, idea_comments, pledges (target idea|project), project_team, share_agreements, share_agreement_lines, share_agreement_acceptances, jobs, job_criteria, job_tiers, job_claims, job_deliveries, job_events (audit). All owner/role checks in SQL guards + boundary tests, like projects.

## PRs
PR5 Collaborate: Ideas + Funding + Teams/Shares. PR6 Jobs. Both after PR1 (shell), parallel to PR2/PR4, before the final merge to main.

## Collaborate decisions (Aref, 2026-10-23)
- Currency: USD only.
- Jobs go live immediately; instructor can hide and settle disputes.
- Payout tier locks at first delivery if the claimant resubmits within 3 days of a change request.
- Share splits: owner proposes, every teammate accepts, versioned history, labeled a team record (not a legal contract).

## Collaborate v2 (after Fable review; supersedes A to D where they differ)
Nav: Collaborate tab with sub-tabs Jobs (default), Ideas, Teams. Phone bottom bar: Home, Course, Product, Collaborate, More (Wiki, + Members/Gates for instructor).

**Instructor as actor.** Instructor has no account row. jobs: `poster_account_id NULL FK accounts`, `poster_is_instructor`, CHECK exactly one. Instructor may post jobs and comment; instructor never claims. Events store actor kind + id.

**Jobs rules.**
- Post: title, description, 1 to 10 criteria, window 1 to 30 days, compensation money (USD integer 1 to 1,000,000) and/or share (whole percent of a project the poster owns), optional project + milestone link, skill tags. Editable and cancellable only while Open.
- Tiers fixed: delivered within window 100%, within 2x window 50%, later 0%. Applies to money and share alike.
- Claim: one claimant; not the poster; not the instructor; max 2 active claims per member. Clock starts at claim.
- Deliver: https link plus note. First delivery locks the tier (computed in SQL, never from form data).
- Review: Accept; Changes requested (names failed criteria; claimant resubmits within 3 days to keep the locked tier, max 2 rounds, then dispute); Reject once when no criterion is met (returns to Claimed, tier unlocked, clock running); second reject = dispute.
- After 1x window without delivery the poster may Release the claim. After 2x it expires by itself.
- No cancel after claim.
- Poster silent 7 days after delivery = auto-accepted.
- Paid: poster marks paid (amount, date, note); claimant confirms or flags not received (opens dispute). Money never moves on the site.
- Dispute: instructor sets final state and tier with a reason; the audit line is visible to both sides, also when the instructor is the poster.
- Derived state, no cron: `effective_state` computed in SQL from claimed_at, delivered_at, window, review timestamps, claimant status (revoked claimant = job reopens). Used by every read and every mutation guard; works in read-only mode.
- Visibility: all members see all jobs, prices and pledge totals. Profile shows jobs completed only (no on-time rate).

**Teams and shares.**
- Project team: owner invites approved members with a role; invitee accepts.
- Agreement lines: whole percents 1 to 100; activation only when lines sum to 100 and every listed person accepted. One pending version at a time; new proposal replaces it and clears acceptances; owner auto-accepts; any decline voids. Active stays until a replacement is fully accepted. History read-only. Leaving: owner proposes a version without the person; freed percent goes to owner by default, editable.
- No agreement yet = owner holds 100% implicitly.
- Share-paid jobs come only from the poster's own active line: at post and at accept, SQL checks poster line >= x (`insufficient_share`). On accept, version N+1 (poster minus x times tier, claimant plus same) activates immediately; nobody else's line changes.
- Copy: "This is the team's own record of what was agreed. It helps you remember and settle fairly. It is not a legal contract and Vibies does not enforce it." Hint: "Equal split is the usual start. Change it when roles differ."
- The agreement lives on the project page under the roadmap; Teams sub-tab lists invitations, pending acceptances, and your teams.

**Ideas and funding.**
- Ideas: title, problem, for whom, help wanted (co-founder, designer, builder, tester, funding), stage. Interest with role + note. Comments (generic `comments` table with target idea; project comments can reuse it later). Owner converts an idea into a project link; interested people get a team invite prompt.
- Funding: "Seeking funding" goal (USD) on projects; members and instructor pledge (amount, note); owner marks received. Totals visible to members.

**Data (migration 0006):** ideas, idea_interest, comments, pledges, project_team, share_agreements, share_agreement_lines, share_agreement_acceptances, jobs (claim + delivery fields inline), job_criteria, job_events. `version` + stale check on jobs, ideas, share_agreements. job_events and share_agreement_acceptances immutable (abort triggers).

**Essential boundary tests:** own-job claim, instructor claim, second claim `taken`, non-poster accept 403, `tier`/`state` fields 400, https-only delivery, expiry and auto-accept via backdated timestamps, `insufficient_share`, accept activates N+1 summing 100, non-listed acceptance 403, sum<>100 activation aborts, hidden job invisible to members, read-only blocks all collaborate POSTs, revoked claimant reopens job.

**PRs:** PR6 Jobs + Teams/Shares (one PR, they interlock). PR5 Ideas + Comments + Funding. Both after PR1, parallel with PR2/PR4 where files allow; all land on feature/student-hub before one merge to main.
