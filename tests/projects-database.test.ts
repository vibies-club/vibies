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

  test("the private project API enforces issue 17", { timeout: 30_000 }, async (t) => {
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
    const edit = (session: string, id: string, version: string, title: string, summary: string, demoUrl: string | null = null) => call((tx) =>
      tx`select vibies_private.edit_project(${session}, ${id}::uuid, ${version}::bigint, ${title}, ${summary}, ${demoUrl}) as value`);
    const remove = (session: string, id: string, version: string) => call((tx) =>
      tx`select vibies_private.delete_project(${session}, ${id}::uuid, ${version}::bigint) as value`);
    const moderate = (session: string, id: string, hidden: boolean) => call((tx) =>
      tx`select vibies_private.moderate_project(${session}, ${id}::uuid, ${hidden}) as value`);
    const list = (session: string) => call((tx) =>
      tx`select vibies_private.projects(${session}) as value`);
    const read = (session: string, id: string) => call((tx) =>
      tx`select vibies_private.project(${session}, ${id}::uuid) as value`);
    const stored = async (id: string) => {
      const [row] = await sql`
        select p.owner_account_id::text as owner_account_id,
               p.repository_id, p.title, p.summary, p.demo_url,
               p.publication, p.connection, p.moderation,
               p.last_checked_at, p.created_at, p.updated_at,
               p.version::text as version, a.onboarding_completed
          from vibies_private.personal_projects p
          join vibies_private.accounts a on a.internal_id = p.owner_account_id
         where p.id = ${id}::uuid
      `;
      return row;
    };

    const sessions = {
      instructor: hash("project-instructor"), owner: hash("project-owner"),
      reader: hash("project-reader"), other: hash("project-other"),
      revoked: hash("project-revoked"), pending: hash("project-pending"),
      expired: hash("project-expired"), race: hash("project-race"), duplicate: hash("project-duplicate"),
      editor: hash("project-editor"),
      instructorExpired: hash("project-instructor-expired"),
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
        ["209", "synthetic-editor", sessions.editor],
      ]) await finish(id, username, session);
      for (const [id, nickname] of [["201", "Builder"], ["202", "Reader"], ["203", "Other"],
        ["204", "Former"], ["206", "Sleeper"], ["207", "Racer"], ["208", "Twin"]]) {
        assert.deepEqual(await change(sessions.instructor, id, "approve", nickname), { kind: "ok" });
      }
      await change(sessions.instructor, "204", "revoke");
      assert.deepEqual(await change(sessions.instructor, "209", "approve", "Editor"), { kind: "ok" });
      await finish("100", "synthetic-guide", sessions.instructorExpired);
      await sql`update vibies_private.sessions set created_at = clock_timestamp() - interval '25 hours' where session_hash = ${sessions.instructorExpired}`;
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
        const [runtime] = await sql`
          select jsonb_agg(
            format('%s(%s)', p.proname, pg_catalog.oidvectortypes(p.proargtypes))
            order by p.proname, pg_catalog.oidvectortypes(p.proargtypes)
          ) as functions
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'vibies_private'
             and has_function_privilege('vibies_runtime', p.oid, 'execute')
        `;
        assert.deepEqual(runtime.functions, [
          "access_state(text)",
          "begin_sign_in(text, text)",
          "change_member(text, text, text, text)",
          "connect_project(text, text, text, text, text)",
          "consume_sign_in(text, text)",
          "delete_project(text, uuid, bigint)",
          "edit_project(text, uuid, bigint, text, text, text)",
          "end_session(text)",
          "finish_sign_in(text, text, text, text)",
          "members(text)",
          "moderate_project(text, uuid, boolean)",
          "project(text, uuid)",
          "project_actor(text)",
          "project_operation_context(text, uuid)",
          "projects(text)",
          "publish_project(text, uuid, bigint)",
          "record_project_connection(text, uuid, bigint, boolean)",
        ]);
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

      let editorId = "";
      await t.test("Edit validates details and preserves every other field in all retained states", async () => {
        const project = await connect(sessions.editor, "6001", "Draft project", "Draft summary");
        assert.equal(project.kind, "created");
        editorId = project.id;

        const assertEdit = async (title: string, summary: string, demoUrl: string | null) => {
          const before = await stored(editorId);
          const current = await context(sessions.editor, editorId);
          assert.deepEqual(await edit(sessions.editor, editorId, current.version, title, summary, demoUrl),
            { kind: "edited" });
          const after = await stored(editorId);
          assert.deepEqual({
            owner_account_id: after.owner_account_id,
            repository_id: after.repository_id,
            publication: after.publication,
            connection: after.connection,
            moderation: after.moderation,
            last_checked_at: after.last_checked_at,
            created_at: after.created_at,
            onboarding_completed: after.onboarding_completed,
          }, {
            owner_account_id: before.owner_account_id,
            repository_id: before.repository_id,
            publication: before.publication,
            connection: before.connection,
            moderation: before.moderation,
            last_checked_at: before.last_checked_at,
            created_at: before.created_at,
            onboarding_completed: before.onboarding_completed,
          });
          assert.deepEqual({ title: after.title, summary: after.summary, demo_url: after.demo_url },
            { title, summary, demo_url: demoUrl });
          assert.equal(after.version, String(Number(before.version) + 1));
          assert.ok(after.updated_at > before.updated_at);
          return { before, after };
        };

        const draftEdit = await assertEdit("Edited Draft", "Unicode summary 🌱\nSecond line", "https://demo.invalid/draft");
        assert.deepEqual(await record(sessions.editor, editorId, draftEdit.before.version, false), { kind: "stale" });
        assert.deepEqual(await publish(sessions.editor, editorId, draftEdit.before.version), { kind: "stale" });

        let current = await context(sessions.editor, editorId);
        assert.deepEqual(await publish(sessions.editor, editorId, current.version), { kind: "published" });
        await assertEdit("Edited Published", "Published summary", null);

        await sql`update vibies_private.personal_projects set moderation = 'Hidden', version = version + 1 where id = ${editorId}::uuid`;
        await assertEdit("Edited Hidden", "Hidden summary", "https://demo.invalid/hidden");

        await sql`update vibies_private.personal_projects set publication = 'Archived', version = version + 1 where id = ${editorId}::uuid`;
        await assertEdit("Edited Archived", "Archived summary", null);

        await sql`update vibies_private.personal_projects set connection = 'Disconnected', version = version + 1 where id = ${editorId}::uuid`;
        await assertEdit("Edited Disconnected", "Disconnected summary", "https://demo.invalid/disconnected");

        current = await context(sessions.editor, editorId);
        const beforeInvalid = await stored(editorId);
        for (const [title, summary, demoUrl] of ([
          ["", "summary", null], ["x".repeat(81), "summary", null],
          ["Title", "", null], ["Title", "x".repeat(501), null],
          ["Bad\nTitle", "summary", null], ["Title", "bad\tsummary", null],
          ["Title", "summary", "http://demo.invalid"],
          ["Title", "summary", "https://user:pass@demo.invalid"],
        ] as Array<[string, string, string | null]>)) {
          assert.deepEqual(await edit(sessions.editor, editorId, current.version, title, summary, demoUrl),
            { kind: "invalid" });
        }
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.edit_project(${sessions.editor}, null, 1, 'Title', 'Summary', null) as value
        `), { kind: "invalid" });
        assert.deepEqual(await edit(sessions.editor, editorId, "0", "Title", "Summary"), { kind: "invalid" });

        for (const session of [hash("signed-out"), sessions.instructor, sessions.other,
          sessions.pending, sessions.revoked, sessions.expired]) {
          assert.deepEqual(await edit(session, editorId, current.version, "Blocked", "Blocked"),
            { kind: "forbidden" });
        }
        assert.deepEqual(await edit(sessions.editor, "00000000-0000-4000-8000-000000000001",
          current.version, "Missing", "Missing"), { kind: "forbidden" });
        assert.deepEqual(await edit(sessions.editor, editorId, String(Number(current.version) - 1),
          "Stale", "Stale"), { kind: "stale" });
        assert.deepEqual(await stored(editorId), beforeInvalid);
      });

      await t.test("Delete is private, concurrent, frees capacity, and creates a new ID on reconnect", async () => {
        const current = await context(sessions.editor, editorId);
        assert.deepEqual(await remove(sessions.other, editorId, current.version), { kind: "forbidden" });
        assert.deepEqual(await remove(sessions.instructor, editorId, current.version), { kind: "forbidden" });
        assert.deepEqual(await remove(sessions.editor, "00000000-0000-4000-8000-000000000001", current.version),
          { kind: "forbidden" });
        assert.deepEqual(await remove(sessions.editor, editorId, String(Number(current.version) - 1)),
          { kind: "stale" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.delete_project(${sessions.editor}, null, 1) as value
        `), { kind: "invalid" });
        assert.deepEqual(await remove(sessions.editor, editorId, "0"), { kind: "invalid" });

        const concurrent = await Promise.all([
          remove(sessions.editor, editorId, current.version),
          remove(sessions.editor, editorId, current.version),
        ]);
        assert.deepEqual(concurrent.map(value => value.kind).sort(), ["deleted", "forbidden"]);
        assert.equal(await stored(editorId), undefined);
        assert.deepEqual(await remove(sessions.editor, editorId, current.version), { kind: "forbidden" });

        const [onboarding] = await sql`
          select onboarding_completed from vibies_private.accounts where github_id = '209'
        `;
        assert.equal(onboarding.onboarding_completed, true);

        const replacement = await connect(sessions.editor, "6001", "Reconnected", "Fresh row");
        assert.equal(replacement.kind, "created");
        assert.notEqual(replacement.id, editorId);
        assert.deepEqual(await record(sessions.editor, editorId, current.version, true), { kind: "forbidden" });
        assert.deepEqual(await publish(sessions.editor, editorId, current.version), { kind: "forbidden" });
        assert.deepEqual(await edit(sessions.editor, editorId, current.version, "Late edit", "Late edit"),
          { kind: "forbidden" });
        assert.equal((await stored(replacement.id)).title, "Reconnected");

        const [capacityBefore] = await sql`
          select count(*)::int as count from vibies_private.personal_projects p
          join vibies_private.accounts a on a.internal_id = p.owner_account_id
          where a.github_id = '207'
        `;
        assert.equal(capacityBefore.count, 3);
        const [capacityTarget] = await sql`
          select p.id::text as id, p.version::text as version
            from vibies_private.personal_projects p
            join vibies_private.accounts a on a.internal_id = p.owner_account_id
           where a.github_id = '207' order by p.repository_id desc limit 1
        `;
        const [deleted, connected] = await Promise.all([
          remove(sessions.race, capacityTarget.id, capacityTarget.version),
          connect(sessions.race, "2999", "Capacity replacement", "Capacity proof"),
        ]);
        assert.deepEqual(deleted, { kind: "deleted" });
        assert.ok(["created", "full"].includes(connected.kind));
        if (connected.kind === "full") {
          assert.equal((await connect(sessions.race, "2999", "Capacity replacement", "Capacity proof")).kind,
            "created");
        }
        const [capacityAfter] = await sql`
          select count(*)::int as count from vibies_private.personal_projects p
          join vibies_private.accounts a on a.internal_id = p.owner_account_id
          where a.github_id = '207'
        `;
        assert.equal(capacityAfter.count, 3);
      });

      await t.test("Newer checks and Membership revocation serialize with owner writes", async () => {
        const [replacement] = await sql`
          select id::text as id from vibies_private.personal_projects where repository_id = '6001'
        `;
        const oldContext = await context(sessions.editor, replacement.id);
        assert.deepEqual(await record(sessions.editor, replacement.id, oldContext.version, false),
          { kind: "disconnected" });
        assert.deepEqual(await edit(sessions.editor, replacement.id, oldContext.version, "Old edit", "Old edit"),
          { kind: "stale" });
        assert.deepEqual(await remove(sessions.editor, replacement.id, oldContext.version), { kind: "stale" });

        const disconnected = await context(sessions.editor, replacement.id);
        assert.deepEqual(await record(sessions.editor, replacement.id, disconnected.version, true),
          { kind: "connected" });
        assert.deepEqual(await publish(sessions.editor, replacement.id, disconnected.version), { kind: "stale" });

        let current = await context(sessions.editor, replacement.id);
        const [edited, revoked] = await Promise.all([
          edit(sessions.editor, replacement.id, current.version, "Concurrent edit", "Revocation race"),
          change(sessions.instructor, "209", "revoke"),
        ]);
        assert.deepEqual(revoked, { kind: "ok" });
        assert.ok(["edited", "forbidden"].includes(edited.kind));
        assert.equal((await stored(replacement.id)).title,
          edited.kind === "edited" ? "Concurrent edit" : "Reconnected");
        assert.deepEqual(await context(sessions.editor, replacement.id), { kind: "forbidden" });
        assert.equal((await stored(replacement.id)).onboarding_completed, true);

        assert.deepEqual(await change(sessions.instructor, "209", "reapprove"), { kind: "ok" });
        current = await context(sessions.editor, replacement.id);
        const [removed, revokedAgain] = await Promise.all([
          remove(sessions.editor, replacement.id, current.version),
          change(sessions.instructor, "209", "revoke"),
        ]);
        assert.deepEqual(revokedAgain, { kind: "ok" });
        assert.ok(["deleted", "forbidden"].includes(removed.kind));
        assert.equal((await stored(replacement.id) === undefined), removed.kind === "deleted");

        const [afterRevocation] = await sql`
          select onboarding_completed from vibies_private.accounts where github_id = '209'
        `;
        assert.equal(afterRevocation.onboarding_completed, true);
        assert.deepEqual(await change(sessions.instructor, "209", "reapprove"), { kind: "ok" });
        const [afterReapproval] = await sql`
          select onboarding_completed from vibies_private.accounts where github_id = '209'
        `;
        assert.equal(afterReapproval.onboarding_completed, true);
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

      await t.test("Instructor moderation changes only moderation and protects unavailable targets", async () => {
        const projectRows = await sql`
          select repository_id, id::text as id
            from vibies_private.personal_projects
           where repository_id in ('1001', '1002', '3001', '4001')
        `;
        const ids = new Map(projectRows.map(row => [row.repository_id, row.id]));
        const availableId = ids.get("1001");
        const archivedId = ids.get("1002");
        const draftId = ids.get("3001");
        const disconnectedId = ids.get("4001");
        assert.ok(availableId && archivedId && draftId && disconnectedId);

        await sql`
          update vibies_private.personal_projects
             set connection = 'Disconnected', version = version + 1
           where id = ${disconnectedId}::uuid
        `;
        for (const id of [archivedId, draftId, disconnectedId]) {
          const before = await stored(id);
          assert.deepEqual(await moderate(sessions.instructor, id, true), { kind: "forbidden" });
          assert.deepEqual(await moderate(sessions.instructor, id, false), { kind: "forbidden" });
          assert.deepEqual(await stored(id), before);
        }

        const availableBefore = await stored(availableId);
        for (const session of [hash("signed-out"), sessions.owner, sessions.reader,
          sessions.pending, sessions.revoked, sessions.expired, sessions.instructorExpired]) {
          assert.deepEqual(await moderate(session, availableId, true), { kind: "forbidden" });
        }
        assert.deepEqual(await moderate(sessions.instructor,
          "00000000-0000-4000-8000-000000000001", true), { kind: "forbidden" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.moderate_project(${sessions.instructor}, null, true) as value
        `), { kind: "invalid" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.moderate_project(${sessions.instructor}, ${availableId}::uuid, null) as value
        `), { kind: "invalid" });
        assert.deepEqual(await stored(availableId), availableBefore);

        const ownerContext = await context(sessions.owner, availableId);
        assert.deepEqual(await moderate(sessions.instructor, availableId, true), { kind: "hidden" });
        const hidden = await stored(availableId);
        assert.deepEqual({ ...hidden, moderation: availableBefore.moderation, version: availableBefore.version },
          availableBefore);
        assert.equal(hidden.moderation, "Hidden");
        assert.equal(hidden.version, String(Number(availableBefore.version) + 1));
        assert.deepEqual(await read(sessions.reader, availableId), { kind: "missing" });
        assert.equal((await read(sessions.instructor, availableId)).kind, "ok");

        assert.deepEqual(await moderate(sessions.instructor, availableId, true), { kind: "hidden" });
        assert.deepEqual(await stored(availableId), hidden);
        assert.deepEqual(await record(sessions.owner, availableId, ownerContext.version, false), { kind: "stale" });

        assert.deepEqual(await moderate(sessions.instructor, availableId, false), { kind: "restored" });
        const restored = await stored(availableId);
        assert.deepEqual({ ...restored, moderation: hidden.moderation, version: hidden.version }, hidden);
        assert.equal(restored.moderation, "Visible");
        assert.equal(restored.version, String(Number(hidden.version) + 1));
        assert.deepEqual(await moderate(sessions.instructor, availableId, false), { kind: "restored" });
        assert.deepEqual(await stored(availableId), restored);
        assert.equal((await read(sessions.reader, availableId)).kind, "ok");
        assert.equal((await list(sessions.reader)).community.some((item: any) => item.id === availableId), true);

        for (const id of [draftId, archivedId, disconnectedId]) {
          await sql`
            update vibies_private.personal_projects
               set moderation = 'Hidden', version = version + 1
             where id = ${id}::uuid
          `;
          const before = await stored(id);
          assert.equal((await read(sessions.instructor, id)).kind, "ok");
          assert.deepEqual(await moderate(sessions.owner, id, false), { kind: "forbidden" });
          assert.deepEqual(await moderate(sessions.instructor, id, true), { kind: "hidden" });
          assert.deepEqual(await stored(id), before);

          assert.deepEqual(await moderate(sessions.instructor, id, false), { kind: "restored" });
          const after = await stored(id);
          assert.deepEqual({ ...after, moderation: before.moderation, version: before.version }, before);
          assert.equal(after.moderation, "Visible");
          assert.equal(after.version, String(Number(before.version) + 1));
          assert.deepEqual(await read(sessions.reader, id), { kind: "missing" });
          assert.deepEqual(await read(sessions.instructor, id), { kind: "missing" });
        }
      });
    } finally {
      await migrationSql.end();
      await sql.end();
    }
  });
}
