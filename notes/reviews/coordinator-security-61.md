Found one high-priority logout recovery gap, now fixed and re-reviewed: incoming session/grant references are persisted before cleanup, preserving revocation after failure or restart.

No remaining concrete blockers found in the assigned files. The new regression covers interrupted logout and cold recovery. Final test rerun is with the implementing worker; I made no edits.

Checked persistence assumptions against [Cloudflare’s storage documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
