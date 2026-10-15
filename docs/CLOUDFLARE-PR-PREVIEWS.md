# Synthetic Cloudflare PR previews

The automatic preview workflow uses one ordinary Worker per PR (`vibies-pr-N`), not a production version URL or a shared staging Worker. Each deployment creates a new D1 database containing only that PR's schema and synthetic fixtures. No production or staging database is copied or bound. OAuth secrets are absent, so live sign-in is intentionally unavailable.

## Bootstrap and configuration

This workflow and its trusted scripts must first reach `main` through the normal Instructor merge. GitHub runs `pull_request_target` from the trusted base commit; the current migration PR cannot bootstrap its own trusted deployment code. Before that merge, use the existing Instructor-controlled manual staging process for this issue's preview. Do not run candidate scripts with provider credentials to bypass bootstrap.

Create a GitHub environment named `preview`. Set its deployment branch rule to trusted `main`, not arbitrary feature branches. Store `CLOUDFLARE_PREVIEW_API_TOKEN` as an environment secret, with Workers Scripts edit and D1 edit permission in the intended Cloudflare account. These permissions are powerful; only the trusted deploy job receives the token. Set environment variables:

- `CLOUDFLARE_ACCOUNT_ID`: the intended account ID.
- `CLOUDFLARE_WORKERS_SUBDOMAIN`: the existing workers.dev subdomain (without a hostname suffix).
- `PREVIEW_D1_RESERVED_SLOTS`: defaults to `3`. At five existing databases, this allows two stable PR databases while retaining room for production, staging, and replacement. Once production/staging exist, an operator may reduce this reserve based on a fresh inventory; the minimum is `1`.

The workflow builds same-repository PRs into `main` automatically on open, synchronize and reopen. Fork PRs are denied. `workflow_dispatch` on `main` can retry an open same-repository PR by number. Closed PRs trigger cleanup. After deployment identity and live PR head verification, a trusted job posts the preview link directly on the PR and records it in the workflow summary as `https://vibies-pr-N.<subdomain>.workers.dev`.

## Trust boundary

The selection and deployment scripts come from the trusted base/main SHA. Selection verifies the GitHub PR, exact head and migration blob hashes. A separate job checks out and builds the candidate with no Cloudflare credentials or application environment secrets. The deploy job installs only trusted main dependencies with lifecycle scripts disabled, downloads that run's artifact by ID, checks its GitHub run/repository/digest metadata, and verifies its manifest and migration bytes.

The deploy job does not run candidate scripts, bundler plugins, Wrangler configuration or Node options. It constructs a fixed `no_bundle` Worker configuration, binding only static assets, one newly created D1 database, version metadata and synthetic environment values. A trusted wrapper supplies the deployment identity endpoint. The control plane and endpoint must agree before an old owned database is deleted.

## Lifecycle and recovery

PR deployments are globally serialized with `queue: max`, which keeps up to 100 pending runs instead of replacing the previous pending run. At GitHub’s 100-run queue limit, further runs are rejected; use manual dispatch to retry those exceptional overflow failures. Outdated PR-head events fail closed, while the queued event for the current head proceeds. Do not run manual staging or other D1 provisioning concurrently when relying on the reserved-capacity check. Cloudflare's account limit remains the final hard cap.

Each run uses `vibies-pr-N-run-RUN-ATTEMPT`. Replacement borrows one reserved slot and keeps the previous database until the new deployment is verified. Failed/ambiguous uploads or identity probes preserve resources. A new run refuses unexpected secrets/bindings, an unowned prior DB, and exhausted capacity. It never upgrades the plan or substitutes a shared database.

Closing a PR deletes its Worker, confirms that it is absent, then deletes only the bound database after checking its exact PR-specific name and receipt. Unbound databases left by ambiguous failures are deliberately retained for operator inspection; there is no automatic broad-prefix deletion. Inspect the Cloudflare control plane and active bindings before removing an orphan. This also means an orphan consumes quota until resolved.

The existing Instructor-only reusable staging workflow is unchanged. Its exact-head acceptance proof and normal repository review/CI gates still apply independently of an automatic preview.

## Checks and sources

Run `node --test tests/preview-cloudflare.test.mjs`. Tests cover fork/head rejection, run/artifact provenance, post-proof PR link publication, malicious migration metadata, capacity and secret refusal, fixed bindings, ambiguous-upload preservation, and cleanup ownership/order.

- [Cloudflare Builds credentials](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Preview resource isolation](https://developers.cloudflare.com/workers/previews/resources/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [GitHub pull_request_target security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
- [GitHub concurrency behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
