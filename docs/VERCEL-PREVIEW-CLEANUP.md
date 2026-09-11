# Vercel Preview settings cleanup

[Documentation home](../README.md) · [Issue #32](https://github.com/vibies-club/vibies/issues/32) ·
[Database deployment](DATABASE-DEPLOYMENT.md)

The `Vercel Preview cleanup` GitHub workflow removes branch-specific settings
after a same-repository pull request merges into `main`. It uses trusted code
from protected `main`. It never checks out or runs code from the pull request.

The script rechecks the merged pull request and every open pull request before
it reads Vercel metadata. It requests `decrypt=false`. It selects only rows with
the exact target `["preview"]`, the exact merged source branch, and no custom
environment IDs. It then repeats the GitHub checks and Vercel list before it
deletes each selected row by ID. Production, Development, shared Preview,
custom-environment, fork, main, unmerged, and active-branch settings stay in
place. A provider error stops the job. A retry safely continues after a partial
deletion.

Automatic merged-PR runs apply the cleanup. A manual run accepts an already
merged PR number and starts as a dry-run. Set its `apply` input only after the
reported names are correct. Both paths use the same server-side checks.

## Owner setup

1. Create a dedicated Vercel token scoped to the Vibies project, with a 90-day
   expiry. This uses Vercel's [project-scoped token API](https://vercel.com/docs/rest-api/authentication/create-an-auth-token).
2. Create the GitHub Actions environment `preview-cleanup`. Limit its deployment
   branches to selected branch `main`.
3. Add the environment secret `VERCEL_CLEANUP_TOKEN`.
4. Add the public environment variables `VERCEL_PROJECT_ID` and
   `VERCEL_TEAM_ID` for the existing Vibies Vercel project and team.

Under the owner's scoped approval, the agent created the project-scoped credential and protected
environment on 2026-09-11. The credential expires on 2026-12-10. Do not put the
token in repository files, logs, workflow inputs, or receipts. Rotate or remove
it when it expires or when this cleanup stops.

## Proof status

| Check | Status |
| --- | --- |
| Synthetic guards, exact selection, pagination bound, dry-run, retry, and secret-safe failure | PASS locally on 2026-09-11 with Node.js 24.15.0. `npm test` passed 42 tests with no skips. Typecheck, build, the migration fixture, and the three-file migration history check also passed. |
| Dedicated project-scoped credential and protected GitHub environment | [PASS on 2026-09-11](https://github.com/vibies-club/vibies/issues/32#issuecomment-5630680040). The project-scoped credential expires on 2026-12-10. The `preview-cleanup` environment accepts only `main`, contains the cleanup secret, and contains the public project and team IDs. |
| Guarded script with live GitHub and Vercel metadata | [PASS on 2026-09-11](https://github.com/vibies-club/vibies/issues/32#issuecomment-5630741907) using a temporary native CLI transport and synthetic settings. The dry-run matched one exact merged-branch Preview row and deleted zero. Apply deleted that row. Shared Preview, Production, another branch's row, and the prior metadata inventory stayed unchanged. A repeat matched zero, and final cleanup restored the original inventory. |
| First GitHub Actions run with the dedicated project token | Pending the reviewed cleanup PR. |
| First automatic cleanup after a same-repository feature PR merges | Pending the reviewed cleanup PR and a later feature merge. |

The temporary live transport used an existing CLI session. It did not test the
dedicated token or the GitHub Actions path. A live receipt records only the pull
request, source branch, setting names, counts, result, and time. It must not
contain setting values, provider response bodies, or credentials.
