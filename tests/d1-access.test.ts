import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import { access_state, members, change_member, begin_sign_in, consume_sign_in, finish_sign_in,
  end_session, type AccessDatabase, type D1Statement, type D1Result } from "../lib/d1/access.ts";

const hash = (n: number) => n.toString(16).padStart(64, "0");
class Statement implements D1Statement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly args: SQLInputValue[];
  constructor(db: DatabaseSync, sql: string, args: SQLInputValue[] = []) {
    this.db = db; this.sql = sql; this.args = args;
  }
  bind(...args: unknown[]) { return new Statement(this.db, this.sql, args as SQLInputValue[]); }
  execute<T>(): D1Result<T> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.columns().length ? stmt.all(...this.args) as T[] : (stmt.run(...this.args), []);
    return { success: true, results };
  }
  async all<T>() { return this.execute<T>(); }
  async first<T>() { return this.execute<T>().results[0] ?? null; }
  async run() { return this.execute<Record<string, unknown>>(); }
}
function fixture(configured = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../d1/migrations/0001_application.sql", import.meta.url), "utf8"));
  if (configured) sqlite.exec("UPDATE community SET instructor_github_id='1', instructor_nickname='Tutor', instructor_nickname_key='tutor'");
  const db: AccessDatabase = {
    prepare: (sql) => new Statement(sqlite, sql),
    async batch<T>(statements: D1Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map((stmt) => (stmt as Statement).execute<T>());
        sqlite.exec("COMMIT"); return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, sqlite };
}

test("D1 access preserves Instructor, approval, nickname reservation and revocation", async () => {
  const { db, sqlite } = fixture();
  try {
    await finish_sign_in(db, "1", "teacher", hash(1));
    await finish_sign_in(db, "2", "student", hash(2));
    assert.deepEqual(await access_state(db, hash(1)), { kind: "instructor", nickname: "Tutor" });
    assert.deepEqual(await access_state(db, hash(2)), { kind: "denied" });
    assert.deepEqual(await members(db, hash(2)), { kind: "forbidden" });
    assert.deepEqual(await change_member(db, hash(2), "2", "approve", "Builder"), { kind: "forbidden" });
    assert.deepEqual(await change_member(db, hash(1), "2", "approve", "tUtOr"), { kind: "duplicate" });
    assert.deepEqual(await change_member(db, hash(1), "2", "approve", "  Élan  "), { kind: "ok" });
    assert.deepEqual(await access_state(db, hash(2)), { kind: "member", nickname: "Élan", onboardingComplete: false });
    assert.deepEqual(await change_member(db, hash(1), "2", "approve", "Élan"), { kind: "ok" });
    assert.deepEqual(await change_member(db, hash(1), "2", "approve", "Other"), { kind: "invalid" });
    await change_member(db, hash(1), "2", "revoke");
    assert.deepEqual(await access_state(db, hash(2)), { kind: "denied" });
    await finish_sign_in(db, "3", "other", hash(3));
    assert.deepEqual(await change_member(db, hash(1), "3", "approve", "élan"), { kind: "duplicate" });
    assert.deepEqual(await change_member(db, hash(1), "2", "reapprove"), { kind: "ok" });
    assert.deepEqual(await change_member(db, hash(1), "2", "dismiss"), { kind: "invalid" });
    assert.deepEqual(await change_member(db, hash(1), "3", "dismiss"), { kind: "ok" });
    assert.deepEqual(await access_state(db, hash(3)), { kind: "signed_out" });
    const result = await members(db, hash(1));
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") assert.equal(result.activeCount, 1);
  } finally { sqlite.close(); }
});

test("D1 approval capacity remains eight across competing requests", async () => {
  const { db, sqlite } = fixture();
  try {
    await finish_sign_in(db, "1", "teacher", hash(1));
    for (let i = 2; i <= 10; i++) await finish_sign_in(db, String(i), `student${i}`, hash(i));
    const results = await Promise.all(Array.from({ length: 9 }, (_, i) => change_member(db, hash(1), String(i + 2), "approve", `Builder${i}`)));
    assert.equal(results.filter((r) => r.kind === "ok").length, 8);
    assert.equal(results.filter((r) => r.kind === "full").length, 1);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM accounts WHERE status='approved'").get()?.n, 8);
    await change_member(db, hash(1), "2", "revoke");
    assert.deepEqual(await change_member(db, hash(1), "10", "approve", "Builder8"), { kind: "ok" });
    assert.deepEqual(await change_member(db, hash(1), "2", "reapprove"), { kind: "full" });
  } finally { sqlite.close(); }
});

test("D1 OAuth states are browser-bound, one-use, expiring and rate-limited", async () => {
  const { db, sqlite } = fixture();
  try {
    assert.deepEqual(await begin_sign_in(db, hash(1), hash(20)), { kind: "ok" });
    assert.equal(await consume_sign_in(db, hash(2), hash(20)), false);
    assert.equal(await consume_sign_in(db, hash(1), hash(20)), true);
    assert.equal(await consume_sign_in(db, hash(1), hash(20)), false);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => begin_sign_in(db, hash(1), hash(i + 30))));
    assert.equal(results.filter((r) => r.kind === "ok").length, 9);
    assert.equal(results.filter((r) => r.kind === "limited").length, 1);
    assert.deepEqual(await begin_sign_in(db, hash(2), hash(30)), { kind: "limited" });
    sqlite.exec("UPDATE sign_in_flows SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-11 minutes'); UPDATE sign_in_attempts SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-11 minutes')");
    assert.equal(await consume_sign_in(db, hash(1), hash(30)), false);
    assert.deepEqual(await begin_sign_in(db, hash(1), hash(50)), { kind: "ok" });
  } finally { sqlite.close(); }
});

test("D1 sessions rotate, expire absolutely, preserve account identity and roll back on failure", async () => {
  const { db, sqlite } = fixture();
  try {
    await finish_sign_in(db, "2", "student", hash(2));
    const id = sqlite.prepare("SELECT internal_id FROM accounts WHERE github_id='2'").get()?.internal_id;
    await finish_sign_in(db, "2", "renamed", hash(3), hash(2));
    assert.equal(sqlite.prepare("SELECT internal_id FROM accounts WHERE github_id='2'").get()?.internal_id, id);
    assert.deepEqual(await access_state(db, hash(2)), { kind: "signed_out" });
    assert.equal(sqlite.prepare("SELECT auth_provider FROM sessions WHERE session_hash=?").get(hash(3))?.auth_provider, "github");
    await assert.rejects(finish_sign_in(db, "3", "other", hash(3), hash(99)));
    assert.equal(sqlite.prepare("SELECT count(*) n FROM accounts WHERE github_id='3'").get()?.n, 0);
    sqlite.exec("UPDATE sessions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 hours')");
    assert.deepEqual(await access_state(db, hash(3)), { kind: "signed_out" });
    await end_session(db, hash(3));
    assert.equal(sqlite.prepare("SELECT count(*) n FROM sessions").get()?.n, 0);
  } finally { sqlite.close(); }
  const empty = fixture(false);
  try {
    assert.deepEqual(await begin_sign_in(empty.db, hash(1), hash(2)), { kind: "unconfigured" });
    await assert.rejects(finish_sign_in(empty.db, "2", "student", hash(2)));
    assert.equal(empty.sqlite.prepare("SELECT count(*) n FROM accounts").get()?.n, 0);
  } finally { empty.sqlite.close(); }
});


test("D1 membership writes deny expired authorization and preserve invalid targets", async () => {
  const { db, sqlite } = fixture();
  try {
    await finish_sign_in(db, "1", "teacher", hash(1));
    await finish_sign_in(db, "2", "student", hash(2));
    assert.deepEqual(await change_member(db, hash(1), "2", "unknown"), { kind: "invalid" });
    assert.deepEqual(await change_member(db, hash(1), "0", "approve", "Builder"), { kind: "invalid" });
    assert.deepEqual(await change_member(db, hash(1), "99", "approve", "Builder"), { kind: "missing" });
    for (const name of ["X", "😀😀", "hello\tthere", "a".repeat(31)])
      assert.deepEqual(await change_member(db, hash(1), "2", "approve", name), { kind: "nickname" });
    assert.deepEqual(await change_member(db, hash(1), "2", "approve", "Ⅷ_۱۲"), { kind: "ok" });
    sqlite.prepare("UPDATE sessions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours') WHERE session_hash=?").run(hash(1));
    assert.deepEqual(await change_member(db, hash(1), "2", "revoke"), { kind: "forbidden" });
    assert.deepEqual(await members(db, hash(1)), { kind: "forbidden" });
    assert.equal((await access_state(db, hash(2))).kind, "member");
  } finally { sqlite.close(); }
});

test("D1 matches SQL GitHub-ID bounds, nullable actions and targeted expiry cleanup", async () => {
  const { db, sqlite } = fixture();
  try {
    await finish_sign_in(db, "1", "teacher", hash(1));
    for (const digits of [20, 21, 64]) {
      const id = "1".repeat(digits);
      await finish_sign_in(db, id, "student", hash(digits));
      assert.deepEqual(await change_member(db, hash(1), id, "approve", `Member ${digits}`), { kind: "ok" });
    }
    await assert.rejects(finish_sign_in(db, "1".repeat(65), "student", hash(65)), /Invalid sign-in result/);
    assert.deepEqual(await change_member(db, hash(1), "1".repeat(65), "approve", "Member 65"), { kind: "invalid" });
    assert.deepEqual(await change_member(db, hash(1), "1".repeat(20), null), { kind: "invalid" });
    sqlite.prepare("UPDATE sessions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours') WHERE session_hash IN (?,?)").run(hash(20), hash(21));
    assert.deepEqual(await access_state(db, hash(20)), { kind: "signed_out" });
    assert.equal(sqlite.prepare("SELECT count(*) n FROM sessions WHERE session_hash=?").get(hash(20))?.n, 0);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM sessions WHERE session_hash=?").get(hash(21))?.n, 1);
  } finally { sqlite.close(); }
  const empty = fixture(false);
  try {
    empty.sqlite.prepare("INSERT INTO sign_in_flows(state_hash,browser_hash,created_at) VALUES(?,?,?)").run(hash(40), hash(41), "2000-01-01T00:00:00Z");
    empty.sqlite.prepare("INSERT INTO sign_in_attempts(browser_hash,created_at) VALUES(?,?)").run(hash(41), "2000-01-01T00:00:00Z");
    assert.deepEqual(await begin_sign_in(empty.db, hash(41), hash(42)), { kind: "unconfigured" });
    assert.equal(empty.sqlite.prepare("SELECT count(*) n FROM sign_in_flows").get()?.n, 1);
    assert.equal(empty.sqlite.prepare("SELECT count(*) n FROM sign_in_attempts").get()?.n, 1);
  } finally { empty.sqlite.close(); }
});
