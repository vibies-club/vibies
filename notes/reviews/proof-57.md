# Sign-in redesign proof

Issue: https://github.com/vibies-club/vibies/issues/57

## Selected design and scope

The user selected concept 1 on 2026-10-08 before any application code changed. The three generated concepts and exact prompt sidecars are retained locally under `.impeccable/mocks/sign-in-57/`. The approved composition adopts DESIGN.md's existing identity; no new raster assets were needed. Existing bee, key icon, logo and local fonts are reused. DESIGN.md and its sidecar now record the sign-in extension. Follow-up alignment issue: https://github.com/vibies-club/vibies/issues/58.

No OAuth, database, membership, session or rate-limit code changed. AccessShell's new optional presentation props keep its default class and brand markup identical for other callers. All sign-in selectors are scoped to `.sign-in`. Existing unrelated working-tree changes are excluded.

## Verification

- `npm run build`: passed after the implementation and final typography changes.
- `npm run typecheck`: passed.
- `npm test`: 107 passed, zero failures.
- `npm run check:migrations`: checked all five migration files successfully.
- The built app ran at `http://127.0.0.1:3100` with database and OAuth configuration explicitly disabled. Browser cookies and the lookup-failure session are synthetic. No real account, database or OAuth provider was used for this proof.
- Loopback HTTP checks passed: missing browser token redirects to `/auth/browser`; browser initialization returns to sign-in; all five status messages render with `role="status"`; `__proto__`, `constructor`, `toString` and an unknown message are ignored; the form remains native `POST /auth/start`; lookup failure keeps Retry and sign-out; an unrelated welcome lookup failure uses the original shell; cross-origin sign-in POST returns 403.
- The existing guard code still redirects Member/Instructor to welcome and denied access to access-denied. Those live membership decisions and a complete GitHub OAuth cycle were not exercised locally. The repository's full database and built-server suites remain CI gates.

## Screenshots and interaction

The root opened and inspected every screenshot in the normal, status and retry sets at all four widths. The first visual pass found headline wrapping and mascot scale differences; a bounded polish pass corrected them. A critique then identified uneven retry-only wrapping at 1440; it was capped at 64px and the retry set recaptured and inspected.

Local screenshot paths, relative to the repository:

- `notes/shots/57/normal-390.png`, `normal-768.png`, `normal-1280.png`, `normal-1440.png`.
- `notes/shots/57/status-390.png`, `status-768.png`, `status-1280.png`, `status-1440.png`.
- `notes/shots/57/retry-390.png`, `retry-768.png`, `retry-1280.png`, `retry-1440.png`.
- `notes/shots/57/focus-390.png`, `narrow-320.png`, `sibling-retry-320.png`.

Measurements are in `measurements-57.json`. Normal, status and retry have no horizontal overflow at 390, 768, 1280 or 1440. Phone introduction copy is 19px and privacy copy 16px. Desktop introduction is 22px and privacy copy 17px. The local font runtime uses the generated `display` alias for Bricolage Grotesque.

Keyboard Tab reached the brand, Sign in, Continue with GitHub and public demo link in order. Every focused control measured a 3px solid `rgb(154, 86, 11)` outline with 4px offset. Under reduced motion, hovered CTA and arrow transforms were `none` and transition duration was `0s`. At 320px, no horizontal overflow was measured. Navigating from sign-in to a sibling welcome retry retained `class="access"`, its original Arial font and `rgb(246, 245, 239)` ground, with no sign-in content.

The only browser console error was the existing missing `/favicon.ico`; no sign-in image, font or application errors were observed. Screenshots and concepts remain local verification artifacts; only assets the app uses are committed.

## Critique and polish reconciliation

Two independent default agents performed Impeccable Assessment A and B under the allowed agent-type rule. Their raw outputs are saved verbatim in `critique-57-a.txt` and `critique-57-b.txt`.

- A confirmed approved-comp fit, readable layouts and task hierarchy. Its retry-wrap finding was fixed and recaptured. Its suggestion to disable sign-in in the rate-limit state was declined because the user explicitly requires unchanged sign-in behavior; the existing server limit remains authoritative. No new help flow, cancellation, loading logic or retry timer was added.
- B found the behavior, scope, focus CSS and reduced-motion CSS sound. Live focus and reduced-motion measurements now satisfy its requested proof. Its reported missing headers are contradicted by the root's opened full-page screenshots, which show the brand and account navigation at the top of every required-width capture; the retry confirmation also records header top as zero.
- The hook found no deterministic issues in the changed sign-in page, shell and CSS. Its Arial finding belongs to unchanged global styling and is left standing without suppression. The unrelated orphaned errors brief remains unchanged. The design sidecar was updated narrowly with the documented sign-in extension.
- The installed Impeccable phase CLI found the previous landing build state and did not create a separate state for the supplied session ID. That unrelated state was preserved. This receipt does not claim its previous landing `ship` verdict as sign-in approval; the independent PR review supplies the sign-in verdict.

## PR review correction

Round 1 requested the documented deeper warm shadow and matching lift/arrow feedback on hover and keyboard focus. The scoped CSS now provides those states and explicitly removes their movement under reduced motion. The final build passed and interaction measurements were repeated; raw review is in `pr-59-r1.md`.

## Remaining repository gates

Exact-head `app-check`, `migration-check`, `links`, an approving Member or Trident-app review, and Instructor-run hosted staging proof are required before merge. A preview deployment alone is not hosted behavior proof. The Instructor alone merges.
