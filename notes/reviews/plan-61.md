VERDICT: approve with changes

1. **Major: define Better Auth’s data-retention policy before implementation** (`notes/plans/61.md`, Gate 4). The proposed settings prevent implicit linking but do not specify what Better Auth stores. Its schema includes provider tokens, profile fields, IP addresses, and user agents; provider tokens are not encrypted by default. This conflicts with the existing minimal-data policy unless explicitly constrained. Require synthetic shadow profiles, removal of real profile fields, and suppression of unnecessary access/refresh/ID-token storage after verification. Define protection and lifetime for bridge-session credentials. Test the actual stored rows after linking, login, refresh, and failure; test that account-management endpoints cannot bypass these restrictions. Sources: [Better Auth schema](https://better-auth.com/docs/concepts/database), [token storage](https://better-auth.com/docs/concepts/users-accounts).

2. **Major: separate automatic deployment from permission to activate production writes** (`notes/plans/61.md:70–78`). Gate 5 correctly requires a final snapshot and write barrier, but Gate 6 also enables automatic deployment on merge without defining their ordering. A merge could deploy the D1 application before its final import is reconciled, while Vercel may simultaneously deploy the same changed code against the old configuration. Add a deployment-state sequence: deploy Cloudflare with production access/writes disabled; keep a pinned, working source deployment; impose and verify the source barrier; import and reconcile; explicitly activate the destination; then change traffic. State how both hosting integrations behave on this PR’s merge and subsequent rollback. Test that an automatic build cannot open destination writes prematurely.

3. **Major: make replacement of hosted staging explicit** (`notes/plans/61.md:76–82`). The plan preserves check names but leaves the existing hosted-proof mechanism unresolved. `.github/workflows/staging.yml`, `scripts/staging.mjs`, and `lib/staging.ts` require a Vercel project, the `staging` ref, and a Supabase baseline; they cannot certify the proposed Worker/D1 environment. Add concrete replacement or retirement tasks, including the trusted deployment entrypoint, exact commit and D1 migration receipts, schema-compatibility rules, concurrency, and Clear/reset behavior. Update `CONTRIBUTING.md` and D-018 accordingly, and prove the replacement with issue #61. Preserve the Instructor gate and prohibition on agent pushes to `staging`.

The inventory, reconciliation, conditional-write requirements, OAuth binding checks, and explicit Free-plan stop conditions otherwise cover the central migration risks. Approval remains conditional on resolving these three design gaps before private imports or production activation.

<oai-mem-citation>
<citation_entries>
MEMORY.md:899-907|note=[prior auth preservation and visual proof conventions rechecked against current repository]
</citation_entries>
<rollout_ids>
01a11b5b-1591-7b91-a2da-a5f58f5be99e
</rollout_ids>
</oai-mem-citation>