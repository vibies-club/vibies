import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.VIBIES_TEST_DATABASE_URL;
const hash = (label: string) => createHash("sha256").update(label).digest("hex");

if (!databaseUrl) {
  test("project database checks require an isolated fixture", () => {
    assert.fail("Set VIBIES_TEST_DATABASE_URL to the loopback vibies_access_test database");
  });
} else {
  const target = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol)
      || !["127.0.0.1", "localhost", "::1"].includes(target.hostname)
      || target.pathname.slice(1) !== "vibies_access_test") {
    throw new Error("VIBIES_TEST_DATABASE_URL must name the loopback vibies_access_test database");
  }

  test("the private project API enforces issue 17 phase one", { timeout: 30_000 }, async (t) => {
    const sql = postgres(databaseUrl, { max: 12, onnotice: () => {} });
    const migrationSql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    const migration = await readFile(new URL("../supabase/access.sql", import.meta.url), "utf8");
    const asRuntime = async <T>(run: (tx: any) => Promise<T>) => sql.begin(async (tx) => {
      await tx.unsafe("set local role vibies_runtime");
      return run(tx);
    });
    const call = (query: (tx: any) => Promise<any[]>) => asRuntime(async (tx) => {
      const [row] = await query(tx);
      return row.value;
    });
    const finish = (githubId: string, username: string, session: string) => asRuntime((tx) => tx`
      select vibies_private.finish_sign_in(${githubId}, ${username}, ${session}, null)
    `);
    const change = (session: string, githubId: string, action: string, nickname: string | null = null) =>
      call((tx) => tx`select vibies_private.change_member(${session}, ${githubId}, ${action}, ${nickname}) as value`);
    const actor = (session: string) => call((tx) =>
      tx`select vibies_private.project_actor(${session}) as value`);
    const context = (session: string, id: string) => call((tx) =>
      tx`select vibies_private.project_operation_context(${session}, ${id}::uuid) as value`);
    const connect = (session: string, repositoryId: string, title = "Seedling", summary = "A synthetic project", demoUrl: string | null = null) =>
      call((tx) => tx`select vibies_private.connect_project(${session}, ${repositoryId}, ${title}, ${summary}, ${demoUrl}) as value`);
    const publish = (session: string, id: string, version: string) => call((tx) =>
      tx`select vibies_private.publish_project(${session}, ${id}::uuid, ${version}::bigint) as value`);
    const record = (session: string, id: string, version: string, connected: boolean) => call((tx) =>
      tx`select vibies_private.record_project_connection(${session}, ${id}::uuid, ${version}::bigint, ${connected}) as value`);
    const list = (session: string) => call((tx) =>
      tx`select vibies_private.projects(${session}) as value`);
    const read = (session: string, id: string) => call((tx) =>
      tx`select vibies_private.project(${session}, ${id}::uuid) as value`);

    const sessions = {
      instructor: hash("project-instructor"), owner: hash("project-owner"),
      reader: hash("project-reader"), other: hash("project-other"),
      revoked: hash("project-revoked"), pending: hash("project-pending"),
      expired: hash("project-expired"), race: hash("project-race"), duplicate: hash("project-duplicate"),
    };

    try {
      // This database is name-checked and disposable. Remove only the unpublished
      // local schema shape used before the issue owner chose opaque owner IDs.
      await sql.unsafe("drop table if exists vibies_private.personal_projects");
      await sql.unsafe(`
        do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        end $$;
      `);
      await migrationSql.unsafe(migration);
      await sql`insert into vibies_private.accounts (github_id, github_username) values ('999', 'synthetic-legacy')`;
      await sql.unsafe(`
        drop table vibies_private.personal_projects;
        alter table vibies_private.accounts drop column internal_id;
      `);
      await migrationSql.unsafe(migration);
      const [backfilled] = await sql`select internal_id::text as id from vibies_private.accounts where github_id = '999'`;
      assert.match(backfilled.id, /^[0-9a-f-]{36}$/);
      await migrationSql.unsafe(migration);
      const [stableBackfill] = await sql`select internal_id::text as id from vibies_private.accounts where github_id = '999'`;
      assert.equal(stableBackfill.id, backfilled.id);
      await sql.unsafe(`
        truncate table
          vibies_private.personal_projects,
          vibies_private.sessions,
          vibies_private.sign_in_flows,
          vibies_private.sign_in_attempts,
          vibies_private.instructor_audit,
          vibies_private.accounts
        restart identity;
        update vibies_private.community
           set instructor_github_id = null, instructor_nickname = null;
      `);
      await sql`select vibies_private.designate_instructor('100', 'Guide', 'Synthetic project checks')`;
      await finish("100", "synthetic-guide", sessions.instructor);
      for (const [id, username, session] of [
        ["201", "synthetic-owner", sessions.owner], ["202", "synthetic-reader", sessions.reader],
        ["203", "synthetic-other", sessions.other], ["204", "synthetic-revoked", sessions.revoked],
        ["205", "synthetic-pending", sessions.pending], ["206", "synthetic-expired", sessions.expired],
        ["207", "synthetic-race", sessions.race], ["208", "synthetic-duplicate", sessions.duplicate],
      ]) await finish(id, username, session);
      for (const [id, nickname] of [["201", "Builder"], ["202", "Reader"], ["203", "Other"],
        ["204", "Former"], ["206", "Sleeper"], ["207", "Racer"], ["208", "Twin"]]) {
        assert.deepEqual(await change(sessions.instructor, id, "approve", nickname), { kind: "ok" });
      }
      await change(sessions.instructor, "204", "revoke");
      await sql`update vibies_private.sessions set created_at = clock_timestamp() - interval '25 hours' where session_hash = ${sessions.expired}`;

      await t.test("setup is repeatable and private", async () => {
        await migrationSql.unsafe(migration);
        const [preserved] = await sql`select status from vibies_private.accounts where github_id = '201'`;
        assert.equal(preserved.status, "approved");
        const [identityBefore] = await sql`select internal_id::text as id from vibies_private.accounts where github_id = '205'`;
        await finish("205", "synthetic-pending-renamed", hash("project-pending-renamed"));
        const [identityAfter] = await sql`select internal_id::text as id, github_username from vibies_private.accounts where github_id = '205'`;
        assert.deepEqual(identityAfter, { id: identityBefore.id, github_username: "synthetic-pending-renamed" });
        await assert.rejects(() => asRuntime((tx) => tx`select * from vibies_private.personal_projects`),
          (error: any) => error.code === "42501");
        for (const role of ["anon", "authenticated"]) {
          const [rights] = await sql`
            select has_schema_privilege(${role}, 'vibies_private', 'usage') as schema,
                   has_table_privilege(${role}, 'vibies_private.personal_projects', 'select') as table
          `;
          assert.deepEqual(rights, { schema: false, table: false });
        }
        const [columns] = await sql`
          select jsonb_object_agg(column_name, data_type) as definitions
            from information_schema.columns
           where table_schema = 'vibies_private' and table_name = 'personal_projects'
        `;
        for (const forbidden of ["github_username", "installation_id", "token", "provider_payload", "repository_url"]) {
          assert.equal(forbidden in columns.definitions, false);
        }
        assert.equal("owner_github_id" in columns.definitions, false);
        assert.equal(columns.definitions.owner_account_id, "uuid");
      });

      await t.test("database validation rejects controls and invalid destinations", async () => {
        const formatCharacters: string[] = [];
        for (let code = 0; code <= 0x10ffff; code += 1) {
          const value = String.fromCodePoint(code);
          if (/^\p{Cf}$/u.test(value)) formatCharacters.push(`a${value}b`);
        }
        const [formats] = await sql`
          select bool_and(not vibies_private._valid_project_text(value, 80, false)) as rejected
            from unnest(${sql.array(formatCharacters)}::text[]) as value
        `;
        assert.equal(formats.rejected, true);
        for (const [title, summary, demoUrl] of ([
          ["bad\n", "ok", null], ["ok", "bad\ttext", null], ["ok", "bad\rtext", null],
          ["ok", "bad\u200btext", null], ["ok", "summary", "http://demo.invalid"],
          ["ok", "summary", "https://user:pass@demo.invalid"],
        ] as Array<[string, string, string | null]>)) {
          assert.deepEqual(await connect(sessions.owner, "9999", title, summary, demoUrl), { kind: "invalid" });
        }
        assert.equal((await connect(sessions.owner, "9999", "Unicode 🌱", "Line one\nLine two", "https://demo.invalid/path")).kind, "created");
      });

      let hiddenId = "";
      await t.test("Connect is private, deduplicated, and limited", async () => {
        assert.deepEqual(await actor(sessions.owner), { kind: "ok", githubId: "201", username: "synthetic-owner" });
        for (const session of [hash("signed-out"), sessions.instructor, sessions.pending, sessions.revoked, sessions.expired]) {
          assert.deepEqual(await actor(session), { kind: "forbidden" });
          assert.equal((await connect(session, "8001")).kind, "forbidden");
        }

        const first = await connect(sessions.owner, "1001", "Hidden launch", "Original details");
        assert.equal(first.kind, "created");
        hiddenId = first.id;
        assert.deepEqual(await connect(sessions.owner, "1001", "Replacement", "Must not replace"),
          { kind: "existing", id: hiddenId, version: "1" });
        const [unchanged] = await sql`select title, summary from vibies_private.personal_projects where id = ${hiddenId}::uuid`;
        assert.deepEqual(unchanged, { title: "Hidden launch", summary: "Original details" });
        const [ownerReference] = await sql`
          select p.owner_account_id::text as project_owner, a.internal_id::text as account_owner
            from vibies_private.personal_projects p
            join vibies_private.accounts a on a.internal_id = p.owner_account_id
           where p.id = ${hiddenId}::uuid
        `;
        assert.equal(ownerReference.project_owner, ownerReference.account_owner);
        assert.deepEqual(await connect(sessions.other, "1001"), { kind: "conflict" });

        await connect(sessions.owner, "1002");
        await sql`update vibies_private.personal_projects set publication = 'Archived' where repository_id = '1002'`;
        assert.deepEqual(await connect(sessions.owner, "1003"), { kind: "full" });
        assert.equal((await connect(sessions.owner, "1001")).kind, "existing");

        await connect(sessions.race, "2001");
        await connect(sessions.race, "2002");
        const capacityRace = await Promise.all([
          connect(sessions.race, "2003"), connect(sessions.race, "2004"),
        ]);
        assert.deepEqual(capacityRace.map(value => value.kind).sort(), ["created", "full"]);

        const duplicateRace = await Promise.all([
          connect(sessions.duplicate, "3001", "First race", "First details"),
          connect(sessions.duplicate, "3001", "Second race", "Second details"),
        ]);
        assert.deepEqual(duplicateRace.map(value => value.kind).sort(), ["created", "existing"]);
        const [single] = await sql`select count(*)::int as count from vibies_private.personal_projects where repository_id = '3001'`;
        assert.equal(single.count, 1);
      });

      await t.test("Hidden publication is atomic and Community reads are safe", async () => {
        await sql`update vibies_private.personal_projects set moderation = 'Hidden', version = version + 1 where id = ${hiddenId}::uuid`;
        const before = await context(sessions.owner, hiddenId);
        assert.equal(before.moderation, "Hidden");
        assert.deepEqual(await context(sessions.other, hiddenId), { kind: "forbidden" });
        assert.deepEqual(await publish(sessions.other, hiddenId, before.version), { kind: "forbidden" });
        assert.deepEqual(await publish(sessions.instructor, hiddenId, before.version), { kind: "forbidden" });
        assert.deepEqual(await publish(sessions.owner, "00000000-0000-4000-8000-000000000001", "1"), { kind: "forbidden" });
        assert.deepEqual(await publish(sessions.owner, hiddenId, before.version), { kind: "published" });
        const [saved] = await sql`
          select p.publication, p.connection, p.moderation, a.onboarding_completed
            from vibies_private.personal_projects p join vibies_private.accounts a on a.internal_id = p.owner_account_id
           where p.id = ${hiddenId}::uuid
        `;
        assert.deepEqual(saved, { publication: "Published", connection: "Connected", moderation: "Hidden", onboarding_completed: true });
        assert.equal((await list(sessions.reader)).community.some((item: any) => item.id === hiddenId), false);
        assert.deepEqual(await read(sessions.reader, hiddenId), { kind: "missing" });
        const moderationTarget = await read(sessions.instructor, hiddenId);
        assert.equal(moderationTarget.kind, "ok");
        assert.equal(moderationTarget.project.moderation, "Hidden");

        await sql`update vibies_private.personal_projects set moderation = 'Visible', version = version + 1 where id = ${hiddenId}::uuid`;
        const shared = await read(sessions.reader, hiddenId);
        assert.deepEqual(shared, { kind: "ok", project: {
          id: hiddenId, title: "Hidden launch", summary: "Original details", demoUrl: null,
          nickname: "Builder", isOwner: false,
        } });
        assert.deepEqual(await read(sessions.instructor, hiddenId), shared);
        assert.equal((await list(sessions.instructor)).community.some((item: any) => item.id === hiddenId), true);
        assert.equal(JSON.stringify(shared).includes("synthetic-owner"), false);
        assert.equal(JSON.stringify(shared).includes("repositoryId"), false);
        for (const session of [hash("signed-out"), sessions.pending, sessions.revoked, sessions.expired]) {
          assert.deepEqual(await list(session), { kind: "forbidden" });
          assert.deepEqual(await read(session, hiddenId), { kind: "forbidden" });
        }
      });

      await t.test("Publish rollback and retries have no extra effects", async () => {
        const project = await connect(sessions.other, "4001", "Atomic project", "Rollback proof");
        assert.equal(project.kind, "created");
        const firstContext = await context(sessions.other, project.id);
        await sql.unsafe(`
          create or replace function vibies_private._test_reject_onboarding() returns trigger
          language plpgsql as $$ begin raise exception 'synthetic write failure'; end $$;
          create trigger test_reject_onboarding before update on vibies_private.accounts
          for each row when (new.github_id = '203') execute function vibies_private._test_reject_onboarding();
        `);
        try {
          await assert.rejects(() => publish(sessions.other, project.id, firstContext.version), /synthetic write failure/);
        } finally {
          await sql.unsafe(`
            drop trigger if exists test_reject_onboarding on vibies_private.accounts;
            drop function if exists vibies_private._test_reject_onboarding();
          `);
        }
        const [rolledBack] = await sql`
          select p.publication, p.version::text as version, a.onboarding_completed
            from vibies_private.personal_projects p join vibies_private.accounts a on a.internal_id = p.owner_account_id
           where p.id = ${project.id}::uuid
        `;
        assert.deepEqual(rolledBack, { publication: "Draft", version: firstContext.version, onboarding_completed: false });

        const concurrent = await Promise.all([
          publish(sessions.other, project.id, firstContext.version), publish(sessions.other, project.id, firstContext.version),
        ]);
        assert.deepEqual(concurrent.map(value => value.kind).sort(), ["published", "stale"]);
        const current = await context(sessions.other, project.id);
        assert.deepEqual(await publish(sessions.other, project.id, current.version), { kind: "already_published" });
        assert.deepEqual(await publish(sessions.other, project.id, current.version), { kind: "already_published" });
        const [after] = await sql`select version::text as version from vibies_private.personal_projects where id = ${project.id}::uuid`;
        assert.equal(after.version, current.version);
      });

      await t.test("Connection loss, stale results, and restoration preserve independent state", async () => {
        const project = await connect(sessions.reader, "5001", "Connection project", "Manual check proof");
        assert.equal(project.kind, "created");
        let current = await context(sessions.reader, project.id);
        assert.deepEqual(await publish(sessions.reader, project.id, current.version), { kind: "published" });
        current = await context(sessions.reader, project.id);
        const [before] = await sql`select title, summary, publication, moderation, last_checked_at from vibies_private.personal_projects where id = ${project.id}::uuid`;
        assert.equal((await list(sessions.other)).community.some((item: any) => item.id === project.id), true);

        assert.deepEqual(await record(sessions.reader, project.id, current.version, false), { kind: "disconnected" });
        assert.equal((await list(sessions.other)).community.some((item: any) => item.id === project.id), false);
        const lost = await context(sessions.reader, project.id);
        assert.deepEqual(await publish(sessions.reader, project.id, lost.version), { kind: "invalid" });
        assert.deepEqual(await record(sessions.reader, project.id, current.version, true), { kind: "stale" });
        const [lostRow] = await sql`select title, summary, publication, connection, moderation, last_checked_at from vibies_private.personal_projects where id = ${project.id}::uuid`;
        assert.deepEqual(lostRow, { ...before, connection: "Disconnected" });

        assert.deepEqual(await record(sessions.reader, project.id, lost.version, true), { kind: "connected" });
        assert.equal((await list(sessions.other)).community.some((item: any) => item.id === project.id), true);
        const restored = await context(sessions.reader, project.id);
        await sql`update vibies_private.personal_projects set moderation = 'Hidden', connection = 'Disconnected', version = version + 1 where id = ${project.id}::uuid`;
        const hidden = await context(sessions.reader, project.id);
        assert.deepEqual(await record(sessions.reader, project.id, hidden.version, true), { kind: "connected" });
        assert.deepEqual(await read(sessions.other, project.id), { kind: "missing" });
        assert.equal((await actor(sessions.reader)).kind, "ok");
        assert.equal(Number(restored.version) < Number((await context(sessions.reader, project.id)).version), true);
      });

      await t.test("Archived and Disconnected projects cannot publish", async () => {
        const [archived] = await sql`select id from vibies_private.personal_projects where repository_id = '1002'`;
        const archivedContext = await context(sessions.owner, archived.id);
        assert.deepEqual(await publish(sessions.owner, archived.id, archivedContext.version), { kind: "invalid" });
        const [disconnected] = await sql`select id from vibies_private.personal_projects where repository_id = '2001'`;
        await sql`update vibies_private.personal_projects set connection = 'Disconnected', version = version + 1 where id = ${disconnected.id}`;
        const disconnectedContext = await context(sessions.race, disconnected.id);
        assert.deepEqual(await publish(sessions.race, disconnected.id, disconnectedContext.version), { kind: "invalid" });
        assert.equal((await list(sessions.other)).community.some((item: any) => item.id === archived.id || item.id === disconnected.id), false);
        const [draft] = await sql`select id from vibies_private.personal_projects where repository_id = '3001'`;
        for (const id of [archived.id, disconnected.id, draft.id]) {
          assert.deepEqual(await read(sessions.other, id), { kind: "missing" });
          assert.deepEqual(await read(sessions.instructor, id), { kind: "missing" });
        }
        const [hidden] = await sql`select id from vibies_private.personal_projects where repository_id = '5001'`;
        assert.deepEqual(await read(sessions.other, hidden.id), { kind: "missing" });
        const target = await read(sessions.instructor, hidden.id);
        assert.equal(target.kind, "ok");
        assert.equal(target.project.moderation, "Hidden");
      });
    } finally {
      await migrationSql.end();
      await sql.end();
    }
  });
}
