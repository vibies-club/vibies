# Skills

[Agent rules](../AGENTS.md) · [Craft playbook](CRAFT.md)

## Core

| Skill | Install | Use it |
|---|---|---|
| impeccable | `npx impeccable install --providers=codex --scope=project` | Every UI task: `$impeccable shape`, `document`, `critique`, `polish`, `distill`, `bolder`, `quieter`, `animate`. Its hook checks every UI edit for AI design habits. |
| emil-design-eng, animate, review-animations | `npx skills@latest add emilkowalski/skills --skill emil-design-eng --skill animate --skill review-animations -a codex --copy -y` | `$emil-design-eng` for UI craft and detail; `$animate` to add motion with a purpose; `$review-animations` to check curves and timing before a PR. |
| vercel-react-best-practices, web-design-guidelines | `npx skills@latest add vercel-labs/agent-skills --skill vercel-react-best-practices --skill web-design-guidelines -a codex --copy -y` | React and Next.js performance on every component; `$web-design-guidelines` as the accessibility and UI review before every PR. |
| playwright | `$skill-installer playwright` (it expects to live in Codex's own skills folder; do not edit its files) | Open the real page, click through it, take the screenshots at four widths. |
| grill-me, grilling | `npx skills@latest add mattpocock/skills --skill grill-me --skill grilling -a codex --copy -y` (grill-me needs grilling) | The requirement interview for unclear tasks. |
| imagegen | Built into Codex | Comps, hero images, product plates for 3D. |

## On demand

| When the task needs | Install (repo, then skills) | How to use it |
|---|---|---|
| Phone polish, sheets, gestures, native feel | emilkowalski/skills: `mobile-native`, `apple-design` | Run on any screen people use on a phone. |
| Naming a motion effect precisely | emilkowalski/skills: `animation-vocabulary` | Turn "the bouncy thing" into the right term before prompting. |
| Page and list-to-detail transitions | vercel-labs/agent-skills: `vercel-react-view-transitions` | Shared-element morphs between routes. Not for scroll effects. |
| Scroll timelines, pinned sections | greensock/gsap-skills: `gsap-core`, `gsap-react`, `gsap-scrolltrigger`, `gsap-performance` | Only when the scroll sequence is the point of the section. |
| 3D, three.js, React Three Fiber | MengTo/Skills: `threejs`; EnzeD/r3f-skills: `r3f-fundamentals`, `r3f-lighting`, `r3f-materials`, `r3f-loaders`, `r3f-postprocessing` | Follow the 3D rules in docs/CRAFT.md. |
| Video made in code (demos, launch films, captions) | remotion-dev/skills: `remotion-best-practices`, `remotion-create`, `remotion-render` | Write the video as React, render to MP4, then embed it. |
| A design comp as an image, then code from it | Leonxlnx/taste-skill: `imagegen-frontend-web`, `image-to-code` | Generate the comp, analyse it, then implement it. |
| Database, sign-in, storage | supabase/agent-skills: `supabase`, `supabase-postgres-best-practices` | Every Supabase table, policy, query, and auth flow. |
| A hard bug | mattpocock/skills: `diagnosing-bugs` | Reproduce, isolate, fix the cause. |
| Logic that must not break | mattpocock/skills: `tdd` | Test first for money, data, and rules. |
| Search and AI search visibility | coreyhaines31/marketingskills: `seo-audit`, `ai-seo`, `schema` | Before launch and on every public page. |
| Accessibility and speed audits | addyosmani/web-quality-skills: `accessibility`, `core-web-vitals`, `performance` | Before Demo Day and after big UI changes. |
| Handing work to another agent or session | mattpocock/skills: `handoff` | When a task outgrows one session. |

The full on-demand command is `npx skills@latest add <repo> --skill <name> -a codex --copy -y`. Install only the skills a task needs.

Project skills live in `.agents/skills/`. Playwright lives in Codex's own skills folder and imagegen is built in. In a fresh Codespace, install Playwright with `$skill-installer playwright`. New skills load on the next turn; approve the Impeccable hook through `/hooks`.

`grill-me` is an explicit shortcut to `grilling`; use `$grill-me` to invoke it.

## New checkout setup

Run `codex --cd /path/to/vibies` and accept the project trust prompt if it appears.
Project trust permits the project configuration to load. Explicit CLI settings
still take precedence over project settings.

Before the first hook run, run `.agents/skills/impeccable/scripts/impeccable engine-probe`
in a terminal with network access. The launcher fetches the version-pinned engine,
checks its SHA-256 sidecar, and caches it in `~/.impeccable/bin/`. The platform
binary is intentionally excluded from Git. In a restricted environment, provide
a preinstalled engine with `IMPECCABLE_BIN`, or a writable cache with
`IMPECCABLE_HOME`.

In Codex, type `/hooks`, find the Impeccable hooks, and approve them. Hook approval
is separate from project trust and must be done in each environment. Start the
next turn or a new chat to load newly installed skills.

Installed source corrections: grill-me reads its grilling dependency directly
on Codex runtimes without a Skill tool; three React skill links point to their
installed rules directory. The lock file retains the upstream source identity.
