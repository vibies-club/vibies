# Issue 61: source schema fingerprint comparison

Date: 2026-10-15. Production Supabase was queried through the signed-in SQL editor with `BEGIN TRANSACTION READ ONLY`. No application rows, credentials or profile data were selected. The same catalog query ran against a disposable local PostgreSQL database built from the repository schema, including the public demo migration.

| Kind | Production objects | Local objects | Matching fingerprint |
| --- | ---: | ---: | --- |
| Private constraints | 29 | 29 | `9d2ae0e4377c3a3eaa71416817e55c4c` |
| Private functions | 28 | 28 | `8432c97d53e87dc5c38d854682272fe9` |
| Private indexes | 17 | 17 | `c4d77047bb5ed62347252957ca1dce3f` |
| Application tables and column counts | 10 | 10 | `c9b780d2a5a379cceeebe78abac18bf5` |

No custom private triggers were returned. Function fingerprints include full function definitions; constraints include definitions; index fingerprints include definitions. The table fingerprint covers names and column counts only; the earlier column-manifest check remains separate. These MD5 fingerprints are comparison aids, not cryptographic backup integrity proofs. Exact final data reconciliation remains required under the source write barrier. The same read-only query on staging returned all four identical counts and fingerprints. Both source environments match this repository schema.
