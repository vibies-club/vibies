# Setup proof for issue #55

Verified on 2026-10-08 in a clean checkout of main `0fa98b5` with Node 24.15.0.

- `npm ci`, `npm run typecheck`, and `npm run build`: exit 0.
- `npm test`: 107 passed, zero failed.
- Lychee 0.24.2 with CI's offline fragment-check arguments: 447 total, zero errors.
- TOML/JSON parsing and exact model, reasoning, sandbox, workflow, and skill-table assertions: passed.
- Root PRODUCT.md preserves the original product text, allowing only corrected relative links.
- Portable Impeccable launcher: fresh temporary cache downloaded engine 0.1.11; `engine-probe` and a Stop hook event both exited 0. No sibling, home, or PATH engine was present. User hook approval remains separate.
- The eleven owner-approved local archives retained identical SHA-256 hashes. Private restoration receipt stays outside Git.
- UI and database code are unchanged from main. Screenshots and hosted sign-in proof are not applicable to this setup.

The first clean-checkout attempt used Node 18 and failed. These results replace
that attempt after selecting the supported Node 24 runtime.

GitHub CI and required approving review must cover the final PR head before merge.

## PR review corrections

- Both committed Unix hook commands ran from `docs/` and reached engine 0.1.11. The audit log recorded PostToolUse and Stop; both exited 0. Windows commands use the same Git-root resolution, but Windows execution is not verified on this Mac.
- The grill-me shortcut now reads its installed grilling dependency directly.
- Fixed three upstream relative links in the React skill package.
- Expanded Lychee coverage to hidden skill and design folders: 729 total, zero errors.
- Local Impeccable overrides and hook consent are ignored in fresh clones.

Raw PR review text is preserved byte-for-byte inside a text fence so temporary
checkout source links are recorded as transcript text rather than durable links.

A fresh explicit `$grill-me` invocation read both installed skill entry points
and returned the first numbered interview round without changing files.
The second fresh PR reviewer checked `4ba97d6` and returned `VERDICT: ship`
with no findings. Raw output is in `pr-56-r2.md`. The subsequent commit contains
only these reviewer and proof receipts. Required CI and GitHub approval must
still cover that final head.
