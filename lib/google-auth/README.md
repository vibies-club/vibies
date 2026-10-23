# Google identity subsystem

Pinned dependency: Better Auth **1.7.9**. No real provider credentials were used.
The adapter uses the native D1 dialect. The shadow tables use ISO text timestamps,
matching this version's SQLite adapter transformation. The schema deliberately
rejects persisted profile fields, provider tokens, IP addresses and user agents.

## Routes and configuration

The server adapter enables Google only with D1 and all three values:
`VIBIES_GOOGLE_CLIENT_ID`, `VIBIES_GOOGLE_CLIENT_SECRET`, and
`VIBIES_GOOGLE_AUTH_SECRET` (a random secret of at least 32 characters).
`VIBIES_APP_ORIGIN` supplies the trusted origin. Register exactly
`<VIBIES_APP_ORIGIN>/auth/google/provider/callback/google` with Google.

- POST `/auth/google/start` starts Google sign-in after the existing browser
  throttle and same-origin form check.
- POST `/auth/google/link` additionally requires an approved GitHub-authenticated
  session created within five minutes. The random grant cookie and its hashed
  database authorization expire within five minutes.
- GET `/auth/google/provider/callback/google` delegates only that exact callback
  to Better Auth, verifies its fixed success destination, and completes the
  application handoff immediately. No generic Better Auth HTTP router is mounted.
  Link success preserves the GitHub session; login consumes the Better Auth
  session and issues the ordinary 24-hour Vibies session with Google provenance.
- `endGoogleBrowserSession(request, response)` must run in the existing sign-out
  handler in addition to ending the ordinary Vibies session. It clears Better
  Auth and grant cookies even when provider-session cleanup fails.

All authorization is repeated in D1 writes. The account insertion trigger
rechecks and consumes the exact grant; provider identity is immutable. No
email-match linking, public signup, password or generic account-management
routes are enabled. Factory state is request-local; do not cache a factory with
a request's grant or session hash.

## Evidence and limits

`tests/google-auth.test.ts` exercises the actual native D1 dialect using a
SQLite-backed D1 facade, real Better Auth bridge and OAuth callback endpoints,
and an isolated synthetic token endpoint. It covers stored-row privacy,
unlinked denial, replay, approval and expiry checks, concurrent starts, wrong
account, trigger bypass rejection, immutability and one-use application-session
exchange. The synthetic token endpoint is a test fixture, not live Google proof.
Cloudflare workerd binding and browser authorization still need root validation. Do not describe this subsystem alone as a completed live sign-in.

Source references:
- https://github.com/better-auth/better-auth/tree/v1.7.9
- https://better-auth.com/docs/reference/options
- https://better-auth.com/docs/adapters/sqlite
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
