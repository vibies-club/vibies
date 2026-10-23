# Issue 61: Free-plan authentication compute decision

Status: owner approved the Durable Object option on 2026-10-15. Fresh plan review completed; requirements below are accepted. The isolated compatibility Worker now has its own SQLite coordinator; production remains unchanged.

## Evidence

The static Worker architecture preserves private access and D1 semantics, but Google callback CPU remains above the ordinary Workers Free 10 ms allowance. Minimal Better Auth measured 50/60 ms; minification measured 138 ms; pure startup preparation measured 43 ms. Successful responses alone do not establish reliable Free capacity.

## Recommended bounded change

Use a SQLite-backed Cloudflare Durable Object as a per-browser OAuth-flow coordinator. Keep application accounts, approval rules, projects, sessions and Better Auth records authoritative in the existing environment-specific D1 database. Keep hosting and all provider URLs on the existing Worker.

The object must coordinate the real lifecycle of a browser's login attempt, including competing starts/callbacks and cancellation, rather than serve as a renamed stateless proxy or a single global bottleneck. Route using a server-derived opaque browser identifier. Store only minimal expiring flow metadata, never provider tokens or profile details. Preserve D1 one-time state consumption, binding checks, revocation and link authorization independently of object state.

Retain all existing origin, route, method, cookie, PKCE, return-path and activation checks. The thin public Worker routes only the bounded auth operations to the coordinator. Private page data remains in small Worker APIs; do not migrate all app traffic into Durable Objects.

## Reviewed lifecycle requirements

- Route Google starts, linking, callbacks and sign-out for each validated browser through its own object. Reject missing/invalid browser cookies, origins, routes and methods before allocating a stub. No shared global coordinator.
- Use a per-object promise queue across provider awaits. Use synchronous SQLite state updates for durable attempt identity, phase, state hash and expiry. Do not hold blockConcurrencyWhile across external I/O.
- Persist starting and processing claims before external work. Never automatically replay an interrupted provider exchange or an ambiguous session issuance. Require a new browser flow after interruption or expiry.
- Record pending link-grant references before creating them in D1. Record the candidate Vibies session hash before its final D1 insertion. Store no raw session cookie, provider token, profile or credential. A queued sign-out revokes tracked session/grant references as well as those in the incoming request, closing the old-cookie race.
- Keep all existing D1 constraints, atomic state consumption, recent GitHub linking authorization and approval/revocation checks authoritative. The existing implementation uses the pinned stock Kysely adapter; this amendment does not replace it or claim a native custom adapter.
- Persist terminal state before returning a result. Failed metadata writes must not emit a new session cookie. Unreachable sessions from an interrupted operation expire normally; never recover them by reissuing cookies.
- Register the SQLite class separately on each Worker. Trusted preview tooling permits only the exact same-script coordinator binding and re-exports the class without trusting candidate configuration. Reject foreign script/namespace bindings.

## Free-only and proof gates

Cloudflare documents SQLite Durable Objects on Free with 30-second CPU allowance, 100,000 requests/day and 13,000 GB-s/day. Free overages fail rather than enable a paid upgrade. Verify the existing account remains Free and stop if onboarding demands a card. Do not change the plan.

Create isolated compatibility resources first. Prove cold and warm login, rejected unlinked/revoked identities, competing callbacks, sign-out and save/refresh. Measure both the forwarding Worker's CPU and the coordinator. Preserve separate preview and production resources; update trusted artifact validation and migration manifests as required. Re-review security and quota handling before any private import.

Existing Instructor merge/current-head review, trusted staging, source write barrier, encrypted snapshot/import/reconciliation, activation and domain gates remain mandatory.

## Alternatives

1. Continue replacing heavy auth internals with a custom native D1 adapter. No new Cloudflare service, but higher SQL correctness risk and no demonstrated CPU guarantee.
2. Keep current production and leave migration pending. No production changes, but does not fulfill the requested Cloudflare move.

## Sources

- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://www.cloudflare.com/products/durable-objects/
