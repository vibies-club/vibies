No concrete blocker found in the scoped diff.

- `validateSchema: false` disables runtime introspection only; authorization hooks remain unchanged.
- Tests meaningfully verify explicit schema validation, fresh-instance detection of a missing table, and initiation failing closed without issuing a Vibies session.
- All 16 Google-auth tests passed on Node 24.15.0. CI includes them through `test:d1`.

Limit: the wrong-schema test covers a missing verification table, not every possible schema drift. No files edited.

Follow-up: bounded grant-free auth reuse

No concrete blockers found.

The cache snapshots only six configuration fields, compares credentials and database/store identities on every call, and excludes grants and request state. Grant-bearing instances remain fresh; activation checks still precede cache access. This addresses Cloudflare’s [binding-rotation caveat](https://developers.cloudflare.com/workers/runtime-apis/bindings/).

Independently reran all 18 Google-auth tests on Node 24: passed. No edits.
