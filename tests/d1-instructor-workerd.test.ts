import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { designateInstructor } from "../scripts/operators/designate-instructor.ts";
import { access_state, change_member, finish_sign_in } from "../lib/d1/access.ts";

const hash = (id: number) => id.toString(16).padStart(64, "0");

test("operator designation bootstraps and recovers the Instructor on local D1/workerd", async (t) => {
  const mf = new Miniflare({ workers: [{
    modules: true, compatibilityDate: "2026-08-06",
    script: "export default { fetch() { return new Response('Synthetic recovery test'); } };",
    d1Databases: { DB: "synthetic-instructor-recovery" },
  }] });
  try {
    const db = await mf.getD1Database("DB");
    for (const file of ["0001_application.sql", "0003_google.sql"]) {
      const sql = readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), "utf8");
      await db.batch(unstable_splitSqlQuery(sql).map(statement => db.prepare(statement)));
    }
    await designateInstructor(db, "1", "  Élan  ", "  Bootstrap  ");
    assert.deepEqual(await db.prepare("SELECT instructor_github_id, instructor_nickname, instructor_nickname_key FROM community").first(),
      { instructor_github_id: "1", instructor_nickname: "Élan", instructor_nickname_key: "élan" });
    assert.deepEqual(await db.prepare("SELECT previous_github_id, new_github_id, reason FROM instructor_audit").first(),
      { previous_github_id: null, new_github_id: "1", reason: "Bootstrap" });

    for (let id = 1; id <= 5; id++) await finish_sign_in(db, String(id), `synthetic${id}`, hash(id));
    await change_member(db, hash(1), "3", "approve", "Builder");
    await change_member(db, hash(1), "4", "approve", "Approved");
    await change_member(db, hash(1), "5", "approve", "Reserved");
    await change_member(db, hash(1), "5", "revoke");
    for (let id = 1; id <= 3; id++) {
      await db.prepare(`INSERT INTO google_users (id,name,email,emailVerified,createdAt,updatedAt)
        VALUES (?1,'Member',?2,1,'2026-10-15','2026-10-15')`).bind(hash(id), `${hash(id)}@vibies.invalid`).run();
      await db.prepare("INSERT INTO google_identity_map(user_id,github_id) VALUES (?,?)").bind(hash(id), String(id)).run();
      await db.prepare(`INSERT INTO google_sessions (id,token,userId,expiresAt,createdAt,updatedAt)
        VALUES (?1,?1,?2,'2099-01-01','2026-10-15','2026-10-15')`).bind(`google-${id}`, hash(id)).run();
      await db.prepare(`INSERT INTO google_link_grants(grant_hash,user_id,session_hash,expires_at)
        VALUES (?,?,?,unixepoch('now')+60)`).bind(hash(10 + id), hash(id), hash(id)).run();
    }
    // Seed a linked provider through its real authorization trigger.
    await db.prepare(`INSERT INTO google_accounts
      (id,userId,accountId,providerId,authorizationHash,createdAt,updatedAt)
      VALUES ('provider-1',?1,'synthetic-subject','google',?2,'2026-10-15','2026-10-15')`)
      .bind(hash(1), hash(11)).run();
    await db.prepare(`INSERT INTO google_sessions(id,token,userId,expiresAt,createdAt,updatedAt)
      VALUES ('google-1','google-1',?,'2099-01-01','2026-10-15','2026-10-15')`).bind(hash(1)).run();
    await db.prepare(`INSERT INTO google_link_grants(grant_hash,user_id,session_hash,expires_at)
      VALUES (?,?,?,unixepoch('now')+60)`).bind(hash(11), hash(1), hash(1)).run();

    const snapshot = async (): Promise<Record<string, unknown>[][]> => {
      const tables = ["community", "accounts", "sessions", "instructor_audit", "google_users",
        "google_identity_map", "google_sessions", "google_link_grants", "google_accounts"];
      return Promise.all(tables.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
    };

    await t.test("invalid inputs, Members and Unicode nickname reservations leave every row untouched", async () => {
      const before = await snapshot();
      for (const [id, name, reason] of [
        [null, "Tutor", "Recovery"], ["0", "Tutor", "Recovery"], ["1".repeat(65), "Tutor", "Recovery"],
        ["2", "X", "Recovery"], ["2", "😀😀", "Recovery"], ["2", "Tutor", null],
        ["2", "Tutor", "   "], ["2", "Tutor", "x".repeat(501)],
        ["4", "Fresh", "Recovery"], ["5", "Fresh", "Recovery"],
        ["2", "bUiLdEr", "Recovery"], ["2", "RESERVED", "Recovery"],
      ]) await assert.rejects(designateInstructor(db, id, name, reason));
      assert.deepEqual(await snapshot(), before);
      // The reserved member nickname is Unicode and uses the same key as approval.
      await finish_sign_in(db, "9", "synthetic9", hash(9));
      await change_member(db, hash(1), "9", "approve", "Ångström");
      const unicodeBefore = await snapshot();
      await assert.rejects(designateInstructor(db, "2", "ångström", "Recovery"));
      assert.deepEqual(await snapshot(), unicodeBefore);
      await change_member(db, hash(1), "9", "revoke");
      // Retain the new revoked Member as evidence that recovery preserves identities.
      assert.deepEqual((await snapshot()).slice(0, 1), before.slice(0, 1));
    });

    await t.test("a failure after cleanup rolls back audit, sessions, grants and the target account", async () => {
      await db.prepare(`CREATE TRIGGER fail_recovery BEFORE UPDATE ON community
        BEGIN SELECT RAISE(ABORT,'synthetic recovery failure'); END`).run();
      const before = await snapshot();
      await assert.rejects(designateInstructor(db, "2", "New Tutor", "Recover"), /synthetic recovery failure/);
      assert.deepEqual(await snapshot(), before);
      await db.prepare("DROP TRIGGER fail_recovery").run();
    });

    await t.test("recovery invalidates both identities and retains unrelated Members and provider ownership", async () => {
      const before = await snapshot();
      await designateInstructor(db, "2", "  New Tutor  ", "  Recover Instructor  ");
      assert.deepEqual(await access_state(db, hash(1)), { kind: "signed_out" });
      assert.deepEqual(await access_state(db, hash(2)), { kind: "signed_out" });
      assert.equal((await access_state(db, hash(3))).kind, "member");
      const after = await snapshot();
      assert.deepEqual(after[1], before[1].filter(row => row.github_id !== "2"));
      assert.deepEqual(after[4], before[4]); // Pseudonymous users remain stable.
      assert.deepEqual(after[5], before[5]); // Immutable GitHub/provider ownership remains stable.
      assert.deepEqual(after[8], before[8]);
      assert.deepEqual(after[6], before[6].filter(row => row.userId === hash(3)));
      assert.deepEqual(after[7], before[7].filter(row => row.user_id === hash(3)));
      assert.deepEqual(after[3].at(-1)?.previous_github_id, "1");
      assert.deepEqual(after[3].at(-1)?.new_github_id, "2");
      assert.deepEqual(after[3].at(-1)?.reason, "Recover Instructor");
      await finish_sign_in(db, "2", "synthetic2", hash(20));
      assert.deepEqual(await access_state(db, hash(20)), { kind: "instructor", nickname: "New Tutor" });
      await finish_sign_in(db, "1", "synthetic1", hash(10));
      assert.deepEqual(await access_state(db, hash(10)), { kind: "denied" });
    });

    await t.test("same-identity recovery still revokes sessions and appends an audit entry", async () => {
      await designateInstructor(db, "2", "Renamed Tutor", "Rotate credentials");
      assert.deepEqual(await access_state(db, hash(20)), { kind: "signed_out" });
      assert.deepEqual(await db.prepare("SELECT previous_github_id,new_github_id,reason FROM instructor_audit ORDER BY id DESC LIMIT 1").first(),
        { previous_github_id: "2", new_github_id: "2", reason: "Rotate credentials" });
    });

    await t.test("competing recovery calls produce one ordered audit chain", async () => {
      await Promise.all([
        designateInstructor(db, "6", "Six Tutor", "First contender"),
        designateInstructor(db, "7", "Seven Tutor", "Second contender"),
      ]);
      const audit: Record<string, unknown>[] = (await db.prepare("SELECT previous_github_id,new_github_id FROM instructor_audit ORDER BY id DESC LIMIT 2").all()).results;
      assert.equal(audit[1].previous_github_id, "2");
      assert.equal(audit[0].previous_github_id, audit[1].new_github_id);
      assert.equal(await db.prepare("SELECT instructor_github_id FROM community").first("instructor_github_id"), audit[0].new_github_id);
      assert.deepEqual(new Set(audit.map(row => row.new_github_id)), new Set(["6", "7"]));
    });

    await t.test("Member approval and recovery cannot claim the same nickname concurrently", async () => {
      const instructor = await db.prepare("SELECT instructor_github_id FROM community").first<string>("instructor_github_id");
      assert(instructor);
      await finish_sign_in(db, instructor, "syntheticTeacher", hash(100));
      await finish_sign_in(db, "8", "synthetic8", hash(8));
      const [recovery, approval] = await Promise.allSettled([
        designateInstructor(db, "10", "Shared Nickname", "Competing with approval"),
        change_member(db, hash(100), "8", "approve", "sHaReD nIcKnAmE"),
      ]);
      assert.equal(approval.status, "fulfilled");
      const owners = await db.prepare(`SELECT 'instructor' owner FROM community WHERE instructor_nickname_key='shared nickname'
        UNION ALL SELECT 'member' owner FROM accounts WHERE nickname_key='shared nickname'`).all();
      assert.equal(owners.results.length, 1);
      if (recovery.status === "fulfilled") {
        assert.deepEqual(approval, { status: "fulfilled", value: { kind: "forbidden" } });
        assert.equal(owners.results[0].owner, "instructor");
      } else {
        assert.deepEqual(approval, { status: "fulfilled", value: { kind: "ok" } });
        assert.equal(owners.results[0].owner, "member");
        assert.equal(await db.prepare("SELECT instructor_github_id FROM community").first("instructor_github_id"), instructor);
      }
    });
  } finally { await mf.dispose(); }
});
