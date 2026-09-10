import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.VIBIES_TEST_DATABASE_URL;

function hash(label: string) {
  return createHash("sha256").update(label).digest("hex");
}

if (!databaseUrl) {
  test("access database checks", { skip: "VIBIES_TEST_DATABASE_URL is not set" }, () => {});
} else {
  const target = new URL(databaseUrl);
  const database = target.pathname.slice(1);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol)
    || !["127.0.0.1", "localhost", "::1"].includes(target.hostname)
    || database !== "vibies_access_test"
  ) {
    throw new Error("VIBIES_TEST_DATABASE_URL must name the loopback vibies_access_test database");
  }

  test("the private access API enforces issue 14", { timeout: 30_000 }, async (t) => {
    const sql = postgres(databaseUrl, { max: 12, onnotice: () => {} });
    const migrationSql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    const migration = await readFile(new URL("../supabase/access.sql", import.meta.url), "utf8");
    const asRuntime = async <T>(run: (tx: any) => Promise<T>) => sql.begin(async (tx) => {
      await tx.unsafe("set local role vibies_runtime");
      return run(tx);
    });
    const accessState = (session: string) => asRuntime(async (tx) => {
      const [row] = await tx`select vibies_private.access_state(${session}) as value`;
      return row.value;
    });
    const members = (session: string) => asRuntime(async (tx) => {
      const [row] = await tx`select vibies_private.members(${session}) as value`;
      return row.value;
    });
    const changeMember = (
      session: string,
      githubId: string,
      action: string | null,
      nickname: string | null = null,
    ) => asRuntime(async (tx) => {
      const [row] = await tx`
        select vibies_private.change_member(
          ${session}, ${githubId}, ${action}, ${nickname}
        ) as value
      `;
      return row.value;
    });
    const finishSignIn = (
      githubId: string,
      username: string,
      session: string,
      oldSession: string | null = null,
    ) => asRuntime(async (tx) => {
      await tx`
        select vibies_private.finish_sign_in(
          ${githubId}, ${username}, ${session}, ${oldSession}
        )
      `;
    });

    try {
      await migrationSql.unsafe(migration);
      await sql.unsafe(`
        truncate table
          vibies_private.sessions,
          vibies_private.sign_in_flows,
          vibies_private.sign_in_attempts,
          vibies_private.instructor_audit,
          vibies_private.accounts
        restart identity;
        update vibies_private.community
           set instructor_github_id = null, instructor_nickname = null;
      `);

      await t.test("the complete migration works without superuser privileges", async () => {
        const probe = await sql.reserve();
        await probe.unsafe("begin");
        try {
          await probe.unsafe("create role vibies_migration_probe createrole");
          await probe.unsafe("grant create on database vibies_access_test to vibies_migration_probe");
          await probe.unsafe("set local role vibies_migration_probe");
          const scoped = migration.replace(/^begin;\s*/i, "").replace(/commit;\s*$/i, "")
            .replaceAll("vibies_private", "vibies_private_probe")
            .replaceAll("vibies_runtime", "vibies_runtime_probe");
          await probe.unsafe(scoped);
          await probe.unsafe(scoped);
        } finally { await probe.unsafe("rollback"); probe.release(); }
      });

      await t.test("setup is explicit, private, and repeatable", async () => {
        const browser = hash("browser-before-setup");
        const state = hash("state-before-setup");
        const before = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.begin_sign_in(${browser}, ${state}) as value
          `;
          return row.value;
        });
        assert.deepEqual(before, { kind: "unconfigured" });

        await sql`
          select vibies_private.designate_instructor(
            ${"100"}, ${"  Mentor_۱  "}, ${"Initial synthetic setup"}
          )
        `;
        const instructorSession = hash("instructor-session-1");
        await finishSignIn("100", "synthetic-instructor", instructorSession);
        assert.deepEqual(await accessState(instructorSession), {
          kind: "instructor",
          nickname: "Mentor_۱",
        });

        const [instructorAccount] = await sql`
          select count(*)::int as count from vibies_private.accounts
           where github_id = '100'
        `;
        assert.equal(instructorAccount.count, 0);

        await finishSignIn("200", "synthetic-member", hash("preserved-session"));
        await migrationSql.unsafe(migration);
        const [preserved] = await sql`
          select status from vibies_private.accounts where github_id = '200'
        `;
        assert.equal(preserved.status, "unapproved");

        const [role] = await sql`
          select rolcanlogin, rolinherit from pg_roles where rolname = 'vibies_runtime'
        `;
        assert.deepEqual(role, { rolcanlogin: false, rolinherit: false });
        await assert.rejects(
          () => asRuntime((tx) => tx`select * from vibies_private.accounts`),
          (error: any) => error.code === "42501",
        );
        await assert.rejects(
          () => asRuntime((tx) => tx`
            select vibies_private.designate_instructor('999', 'Blocked', 'Blocked')
          `),
          (error: any) => error.code === "42501",
        );
      });

      const instructorSession = hash("instructor-session-1");

      await t.test("nickname rules match Unicode letters and decimal numbers", async () => {
        const samples = [
          "Éclair", "دانشجو_۱", "学生_1", "BuilderⅣ", "A𐅀", "A\u{16FF4}", "N²", "N½",
          "e\u0301", "A\u0345", "A\u05b0", "A\u00a0B", "A😀", "a", "a".repeat(31),
        ];
        for (const value of samples) {
          const trimmed = value.replace(/^ +| +$/g, "");
          const jsAllowed = [...trimmed].length >= 2 && [...trimmed].length <= 30
            && /^[\p{L}\p{Nl}\p{Nd} _-]+$/u.test(trimmed);
          const [row] = await sql`
            select vibies_private._normalized_nickname(${value}) is not null as allowed
          `;
          assert.equal(row.allowed, jsAllowed, JSON.stringify(value));
        }
      });

      await t.test("OAuth state is bound, one-use, expiring, and rate limited", async () => {
        const browser = hash("rate-browser");
        for (let index = 0; index < 10; index += 1) {
          const result = await asRuntime(async (tx) => {
            const [row] = await tx`
              select vibies_private.begin_sign_in(
                ${browser}, ${hash(`rate-state-${index}`)}
              ) as value
            `;
            return row.value;
          });
          assert.deepEqual(result, { kind: "ok" });
        }
        const limited = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.begin_sign_in(
              ${browser}, ${hash("rate-state-10")}
            ) as value
          `;
          return row.value;
        });
        assert.deepEqual(limited, { kind: "limited" });

        const oneUseBrowser = hash("one-use-browser");
        const oneUseState = hash("one-use-state");
        const started = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.begin_sign_in(${oneUseBrowser}, ${oneUseState}) as value
          `;
          return row.value;
        });
        assert.deepEqual(started, { kind: "ok" });
        const duplicate = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.begin_sign_in(${oneUseBrowser}, ${oneUseState}) as value
          `;
          return row.value;
        });
        assert.deepEqual(duplicate, { kind: "limited" });

        const wrongBrowser = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.consume_sign_in(
              ${hash("wrong-browser")}, ${oneUseState}
            ) as value
          `;
          return row.value;
        });
        assert.equal(wrongBrowser, false);
        const consumed = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.consume_sign_in(${oneUseBrowser}, ${oneUseState}) as value
          `;
          return row.value;
        });
        assert.equal(consumed, true);
        const replayed = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.consume_sign_in(${oneUseBrowser}, ${oneUseState}) as value
          `;
          return row.value;
        });
        assert.equal(replayed, false);

        const expiredBrowser = hash("expired-browser");
        const expiredState = hash("expired-state");
        await sql`
          insert into vibies_private.sign_in_flows (
            browser_hash, state_hash, created_at
          ) values (
            ${expiredBrowser}, ${expiredState}, clock_timestamp() - interval '11 minutes'
          )
        `;
        const expired = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.consume_sign_in(${expiredBrowser}, ${expiredState}) as value
          `;
          return row.value;
        });
        assert.equal(expired, false);

        await sql`
          update vibies_private.sign_in_attempts
             set created_at = clock_timestamp() - interval '11 minutes'
           where browser_hash = ${browser}
        `;
        const afterWindow = await asRuntime(async (tx) => {
          const [row] = await tx`
            select vibies_private.begin_sign_in(
              ${browser}, ${hash("rate-after-window")}
            ) as value
          `;
          return row.value;
        });
        assert.deepEqual(afterWindow, { kind: "ok" });

        const concurrentBrowser = hash("concurrent-rate-browser");
        const starts = await Promise.all(Array.from({ length: 11 }, (_, index) =>
          asRuntime(async (tx) => {
            const [row] = await tx`
              select vibies_private.begin_sign_in(
                ${concurrentBrowser}, ${hash(`concurrent-state-${index}`)}
              ) as value
            `;
            return row.value.kind;
          })));
        assert.deepEqual(starts.sort(), ["limited", ...Array(10).fill("ok")]);
      });

      await t.test("member approval preserves identity and onboarding state", async () => {
        const oldSession = hash("preserved-session");
        const memberSession = hash("member-session-200");
        await finishSignIn("200", "renamed-member", memberSession, oldSession);
        assert.deepEqual(await accessState(oldSession), { kind: "signed_out" });
        assert.deepEqual(await accessState(memberSession), { kind: "denied" });
        assert.deepEqual(await members(memberSession), { kind: "forbidden" });
        assert.deepEqual(
          await changeMember(memberSession, "200", "approve", "Member One"),
          { kind: "forbidden" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "200", null, "Member One"),
          { kind: "invalid" },
        );

        for (const nickname of ["x", "bad!", "a\nb", " ".repeat(4)]) {
          assert.deepEqual(
            await changeMember(instructorSession, "200", "approve", nickname),
            { kind: "nickname" },
          );
        }
        assert.deepEqual(
          await changeMember(instructorSession, "200", "approve", "  دانشجو_۱  "),
          { kind: "ok" },
        );
        assert.deepEqual(await accessState(memberSession), {
          kind: "member",
          nickname: "دانشجو_۱",
          onboardingComplete: false,
        });
        assert.deepEqual(
          await changeMember(instructorSession, "200", "approve", "دانشجو_۱"),
          { kind: "ok" },
        );

        await sql`
          update vibies_private.accounts set onboarding_completed = true
           where github_id = '200'
        `;
        const refreshedSession = hash("member-session-200-refreshed");
        await finishSignIn("200", "latest-private-username", refreshedSession, memberSession);
        assert.deepEqual(await accessState(refreshedSession), {
          kind: "member",
          nickname: "دانشجو_۱",
          onboardingComplete: true,
        });
        const listing = await members(instructorSession);
        assert.equal(listing.kind, "ok");
        const account = listing.accounts.find((item: any) => item.githubId === "200");
        assert.deepEqual(account, {
          githubId: "200",
          username: "latest-private-username",
          nickname: "دانشجو_۱",
          status: "approved",
        });

        await assert.rejects(
          () => finishSignIn("201", "collision", refreshedSession),
          (error: any) => error.code === "23505",
        );
        await assert.rejects(
          () => finishSignIn("200", "latest-private-username", refreshedSession, refreshedSession),
          /Invalid sign-in result/,
        );
        assert.equal((await accessState(refreshedSession)).nickname, "دانشجو_۱");
      });

      await t.test("nickname reservation and capacity are atomic", async () => {
        for (let id = 201; id <= 207; id += 1) {
          await finishSignIn(String(id), `synthetic-${id}`, hash(`session-${id}`));
        }
        assert.deepEqual(
          await changeMember(instructorSession, "201", "approve", "دانشجو_۱"),
          { kind: "duplicate" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "201", "approve", "Éclair"),
          { kind: "ok" },
        );
        await finishSignIn("208", "synthetic-208", hash("session-208"));
        assert.deepEqual(
          await changeMember(instructorSession, "208", "approve", "éCLAIR"),
          { kind: "duplicate" },
        );

        for (let id = 202; id <= 205; id += 1) {
          assert.deepEqual(
            await changeMember(instructorSession, String(id), "approve", `Member ${id}`),
            { kind: "ok" },
          );
        }
        const race = await Promise.all([
          changeMember(instructorSession, "206", "approve", "Member 206"),
          changeMember(instructorSession, "207", "approve", "Member 207"),
        ]);
        assert.deepEqual(
          race.map((result) => result.kind).sort(),
          ["full", "ok"],
        );
        const listing = await members(instructorSession);
        assert.equal(listing.activeCount, 7);
      });

      await t.test("revocation, reapproval, and dismissal are safe to retry", async () => {
        const memberSession = hash("member-session-200-refreshed");
        assert.deepEqual(
          await changeMember(instructorSession, "200", "revoke"),
          { kind: "ok" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "200", "dismiss"),
          { kind: "invalid" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "200", "revoke"),
          { kind: "ok" },
        );
        assert.deepEqual(await accessState(memberSession), { kind: "denied" });
        const [preserved] = await sql`
          select nickname, onboarding_completed from vibies_private.accounts
           where github_id = '200'
        `;
        assert.deepEqual(preserved, { nickname: "دانشجو_۱", onboarding_completed: true });
        assert.deepEqual(
          await changeMember(instructorSession, "208", "approve", "دانشجو_۱"),
          { kind: "duplicate" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "208", "approve", "Replacement"),
          { kind: "ok" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "200", "reapprove"),
          { kind: "full" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "208", "revoke"),
          { kind: "ok" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "200", "reapprove"),
          { kind: "ok" },
        );
        assert.deepEqual(
          await changeMember(instructorSession, "200", "reapprove"),
          { kind: "ok" },
        );
        assert.equal((await accessState(memberSession)).onboardingComplete, true);

        const dismissedSession = hash("dismissed-session");
        await finishSignIn("209", "synthetic-dismissed", dismissedSession);
        assert.deepEqual(
          await changeMember(instructorSession, "209", "dismiss"),
          { kind: "ok" },
        );
        assert.deepEqual(await accessState(dismissedSession), { kind: "signed_out" });
        assert.deepEqual(
          await changeMember(instructorSession, "209", "dismiss"),
          { kind: "missing" },
        );
        const recreatedSession = hash("recreated-session");
        await finishSignIn("209", "synthetic-recreated", recreatedSession);
        assert.deepEqual(await accessState(recreatedSession), { kind: "denied" });
      });

      await t.test("sessions expire absolutely and sign-out is local", async () => {
        const memberSession = hash("member-session-200-refreshed");
        await sql`
          update vibies_private.sessions
             set created_at = clock_timestamp() - interval '24 hours 1 second'
           where session_hash = ${memberSession}
        `;
        assert.deepEqual(await accessState(memberSession), { kind: "signed_out" });

        const localSession = hash("local-signout-session");
        await finishSignIn("201", "synthetic-201", localSession);
        await asRuntime(async (tx) => {
          await tx`select vibies_private.end_session(${localSession})`;
        });
        assert.deepEqual(await accessState(localSession), { kind: "signed_out" });
        assert.equal((await accessState(instructorSession)).kind, "instructor");
      });

      await t.test("Instructor recovery rejects members and preserves capacity", async () => {
        await assert.rejects(
          () => sql`
            select vibies_private.designate_instructor(
              '201', 'Wrong', 'Must reject an active Member'
            )
          `,
          /existing Member/,
        );
        await changeMember(instructorSession, "200", "revoke");
        await assert.rejects(
          () => sql`
            select vibies_private.designate_instructor(
              '200', 'Wrong', 'Must reject a Former Member'
            )
          `,
          /existing Member/,
        );

        const newInstructorPendingSession = hash("new-instructor-pending");
        await finishSignIn("300", "synthetic-new-instructor", newInstructorPendingSession);
        const before = await members(instructorSession);
        await sql`
          select vibies_private.designate_instructor(
            '300', 'New Mentor', 'Synthetic recovery check'
          )
        `;
        assert.deepEqual(await accessState(instructorSession), { kind: "signed_out" });
        assert.deepEqual(await accessState(newInstructorPendingSession), { kind: "signed_out" });
        const [noMemberEntry] = await sql`
          select count(*)::int as count from vibies_private.accounts
           where github_id = '300'
        `;
        assert.equal(noMemberEntry.count, 0);

        const newInstructorSession = hash("new-instructor-session");
        await finishSignIn("300", "synthetic-new-instructor", newInstructorSession);
        assert.deepEqual(await accessState(newInstructorSession), {
          kind: "instructor",
          nickname: "New Mentor",
        });
        const after = await members(newInstructorSession);
        assert.equal(after.activeCount, before.activeCount);
        const [audit] = await sql`
          select previous_github_id, new_github_id, reason
            from vibies_private.instructor_audit
           order by id desc limit 1
        `;
        assert.deepEqual(audit, {
          previous_github_id: "100",
          new_github_id: "300",
          reason: "Synthetic recovery check",
        });
      });
    } finally {
      await migrationSql.end();
      await sql.end();
    }
  });
}
