# Issue 61: Free-plan authentication compute decision

Status: proposed; awaits owner technology choice. No Durable Object resource or binding has been created.

## Evidence

The static Worker architecture preserves private access and D1 semantics, but Google callback CPU remains above the ordinary Workers Free 10 ms allowance. Minimal Better Auth measured 50/60 ms; minification measured 138 ms; pure startup preparation measured 43 ms. Successful responses alone do not establish reliable Free capacity.

## Recommended bounded change

Use a SQLite-backed Cloudflare Durable Object as a per-browser OAuth-flow coordinator. Keep application accounts, approval rules, projects, sessions and Better Auth records authoritative in the existing environment-specific D1 database. Keep hosting and all provider URLs on the existing Worker.

The object must coordinate the real lifecycle of a browser's login attempt, including competing starts/callbacks and cancellation, rather than serve as a renamed stateless proxy or a single global bottleneck. Route using a server-derived opaque browser identifier. Store only minimal expiring flow metadata, never provider tokens or profile details. Preserve D1 one-time state consumption, binding checks, revocation and link authorization independently of object state.

Retain all existing origin, route, method, cookie, PKCE, return-path and activation checks. The thin public Worker routes only the bounded auth operations to the coordinator. Private page data remains in small Worker APIs; do not migrate all app traffic into Durable Objects.

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
