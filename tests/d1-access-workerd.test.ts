import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { access_state, begin_sign_in, change_member, consume_sign_in, end_session, finish_sign_in,
  members, type AccessDatabase } from "../lib/d1/access.ts";

const hash = (n: number) => n.toString(16).padStart(64, "0");

test("access operations preserve atomicity and authorization on local D1/workerd", async (t) => {
  const mf = new Miniflare({ workers: [{
    modules: true, compatibilityDate: "2026-08-06",
    script: "export default { fetch() { return new Response('Synthetic D1 test'); } };",
    d1Databases: { DB: "synthetic-access-parity" },
  }] });
  try {
    const binding = await mf.getD1Database("DB");
    const db: AccessDatabase = binding;
    const schema = readFileSync(new URL("../d1/migrations/0001_application.sql", import.meta.url), "utf8");
    const statements = schema.replace(/^--.*$/gm, "").split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
    await binding.batch(statements.map(sql => binding.prepare(sql)));
    await binding.prepare("UPDATE community SET instructor_github_id='1',instructor_nickname='Tutor',instructor_nickname_key='tutor'").run();
    await finish_sign_in(db, "1", "teacher", hash(1));

    await t.test("batch changes() preserves ten-start limit under concurrent requests", async () => {
      const outcomes = await Promise.all(Array.from({ length: 15 }, (_, n) => begin_sign_in(db, hash(100), hash(200 + n))));
      assert.equal(outcomes.filter(result => result.kind === "ok").length, 10);
      assert.equal(outcomes.filter(result => result.kind === "limited").length, 5);
      assert.equal(await binding.prepare("SELECT count(*) n FROM sign_in_attempts WHERE browser_hash=?").bind(hash(100)).first("n"), 10);
      assert.equal(await binding.prepare("SELECT count(*) n FROM sign_in_flows WHERE browser_hash=?").bind(hash(100)).first("n"), 10);
      const stored = await binding.prepare("SELECT state_hash FROM sign_in_flows WHERE browser_hash=? LIMIT 1").bind(hash(100)).first<{ state_hash: string }>();
      assert(stored);
      const consumed = await Promise.all(Array.from({ length: 5 }, () => consume_sign_in(db, hash(100), stored.state_hash)));
      assert.equal(consumed.filter(Boolean).length, 1);
      assert.equal(await consume_sign_in(db, hash(999), stored.state_hash), false);
    });

    await t.test("state collisions consume an attempt without creating another flow", async () => {
      assert.deepEqual(await begin_sign_in(db, hash(101), hash(400)), { kind: "ok" });
      assert.deepEqual(await begin_sign_in(db, hash(101), hash(400)), { kind: "limited" });
      assert.equal(await binding.prepare("SELECT count(*) n FROM sign_in_attempts WHERE browser_hash=?").bind(hash(101)).first("n"), 2);
      assert.equal(await binding.prepare("SELECT count(*) n FROM sign_in_flows WHERE state_hash=?").bind(hash(400)).first("n"), 1);
      await binding.prepare("UPDATE sign_in_flows SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-11 minutes') WHERE state_hash=?").bind(hash(400)).run();
      assert.equal(await consume_sign_in(db, hash(101), hash(400)), false);
    });

    await t.test("competing approvals cannot overfill eight places or bypass nickname reservation", async () => {
      for (let n = 2; n <= 10; n++) await finish_sign_in(db, String(n), `student${n}`, hash(n));
      const outcomes = await Promise.all(Array.from({ length: 9 }, (_, n) => change_member(db, hash(1), String(n + 2), "approve", `Builder ${n}`)));
      assert.equal(outcomes.filter(result => result.kind === "ok").length, 8);
      assert.equal(outcomes.filter(result => result.kind === "full").length, 1);
      assert.equal(await binding.prepare("SELECT count(*) n FROM accounts WHERE status='approved'").first("n"), 8);
      const approved = await binding.prepare("SELECT github_id,nickname FROM accounts WHERE status='approved' LIMIT 1").first<{github_id: string; nickname: string}>();
      const unapproved = await binding.prepare("SELECT github_id FROM accounts WHERE status='unapproved' LIMIT 1").first<{github_id: string}>();
      assert(approved && unapproved);
      assert.deepEqual(await change_member(db, hash(1), approved.github_id, "revoke"), { kind: "ok" });
      assert.deepEqual(await access_state(db, hash(Number(approved.github_id))), { kind: "denied" });
      assert.deepEqual(await change_member(db, hash(1), unapproved.github_id, "approve", approved.nickname.toUpperCase()), { kind: "duplicate" });
      assert.deepEqual(await change_member(db, hash(1), approved.github_id, "reapprove"), { kind: "ok" });
    });

    await t.test("failed session insertion rolls back account upsert and old-session deletion", async () => {
      await finish_sign_in(db, "20", "original", hash(20));
      await assert.rejects(finish_sign_in(db, "20", "changed", hash(1), hash(20)));
      assert.equal(await binding.prepare("SELECT github_username FROM accounts WHERE github_id='20'").first("github_username"), "original");
      assert.deepEqual(await access_state(db, hash(20)), { kind: "denied" });
      await assert.rejects(finish_sign_in(db, "21", "another", hash(1), hash(20)));
      assert.equal(await binding.prepare("SELECT count(*) n FROM accounts WHERE github_id='21'").first("n"), 0);
      assert.deepEqual(await access_state(db, hash(20)), { kind: "denied" });
      await end_session(db, hash(20));
      assert.deepEqual(await access_state(db, hash(20)), { kind: "signed_out" });
    });

    await t.test("session expiry denies reads and every membership mutation", async () => {
      await binding.prepare("UPDATE sessions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours') WHERE session_hash=?").bind(hash(1)).run();
      assert.deepEqual(await access_state(db, hash(1)), { kind: "signed_out" });
      assert.deepEqual(await members(db, hash(1)), { kind: "forbidden" });
      for (const action of ["approve", "reapprove", "revoke", "dismiss"])
        assert.deepEqual(await change_member(db, hash(1), "20", action, action === "approve" ? "Builder" : null), { kind: "forbidden" });
      assert.equal(await binding.prepare("SELECT status FROM accounts WHERE github_id='20'").first("status"), "unapproved");
    });
  } finally { await mf.dispose(); }
});
