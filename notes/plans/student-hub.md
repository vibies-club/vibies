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
