**Verdict: revise before implementation.** The approved architecture is suitable, but `notes/plans/61-free-auth.md:13–21` needs these concrete lifecycle requirements:

1. **Serialize each browser’s auth operations.** Route starts, callbacks and sign-out through the same per-browser object. Use an instance-local promise queue across provider awaits, with durable `generation`, `phase`, `expiresAt` and `stateHash`. Persist claims before external work. A queue alone is insufficient after interruption because in-memory state is lost. [Cloudflare state guidance](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/)

2. **Close the callback/sign-out race.** A generation check after callback execution cannot undo an issued D1 session. Persist the newly issued Vibies session hash **before returning its cookie**; queued sign-out must revoke that tracked session even when its incoming cookie names the previous session. Persist enough information to cancel outstanding linking grants as well. Keep provider credentials and profile data out of object storage. This approach avoids adding a D1 generation fence if every relevant operation uses the queue and ambiguous callbacks are never resumed.

3. **Specify crash and retry behavior.** An interrupted `starting` or `processing` claim must fail closed and require a fresh flow; never retry provider code exchange or replay session issuance automatically. If recording a newly issued session fails, attempt revocation and return no session cookie. An unreachable session left by a crash can expire normally. Expired metadata must be cleaned without resetting a generation while live work remains.

4. **Preserve independent D1 authorization.** Object claims supplement existing one-use state consumption, browser/PKCE checks, linking grants, approval checks and account-insertion guards. Test duplicate callbacks against D1 itself. The current checkout uses `kyselyAdapter`; I found no `BetterAuthD1` or `consumeVerification` implementation, so native-adapter parity needs explicit verification.

5. **Reject before allocating and isolate deployment resources.** Validate browser token, route, method and origin before obtaining an object stub. Missing or malformed browser cookies must not allocate objects. Add SQLite class migrations and separate preview/staging/production namespaces; update trusted staging’s binding allowlist, artifact verification and deployed-binding checks.

Required proof: concurrent starts; duplicate callbacks; sign-out during provider exchange; sign-out carrying the old session cookie; linking cancellation; interruption before/after D1 issuance; object restart; expired flow; missing browser without allocation; and preview isolation. Measure both forwarding Worker and object CPU.

Also update line 3: technology approval is already granted.
