No concrete blocker found in the scoped diff.

- `validateSchema: false` disables runtime introspection only; authorization hooks remain unchanged.
- Tests meaningfully verify explicit schema validation, fresh-instance detection of a missing table, and initiation failing closed without issuing a Vibies session.
- All 16 Google-auth tests passed on Node 24.15.0. CI includes them through `test:d1`.

Limit: the wrong-schema test covers a missing verification table, not every possible schema drift. No files edited.
