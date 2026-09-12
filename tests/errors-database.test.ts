import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.VIBIES_TEST_DATABASE_URL;
const hash = (label: string) => createHash("sha256").update(label).digest("hex");

type ErrorFields = {
  title: string;
  errorText: string;
  location: string;
  cause: string;
  fixSteps: string;
  successConfirmation: string;
};

const fields = (label: string): ErrorFields => ({
  title: `${label} error`,
  errorText: `${label} synthetic failure`,
  location: `${label} test fixture`,
  cause: "Cause unknown",
  fixSteps: `Apply the ${label} synthetic fix`,
  successConfirmation: `${label} synthetic check passed`,
});

if (!databaseUrl) {
  test("error database checks require an isolated fixture", () => {
    assert.fail("Set VIBIES_TEST_DATABASE_URL to the loopback vibies_access_test database");
  });
} else {
  const target = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol)
      || !["127.0.0.1", "localhost", "::1"].includes(target.hostname)
      || target.pathname.slice(1) !== "vibies_access_test") {
    throw new Error("VIBIES_TEST_DATABASE_URL must name the loopback vibies_access_test database");
  }

  test("the private Error Library API enforces issue 31", { timeout: 60_000 }, async (t) => {
    const sql = postgres(databaseUrl, { max: 16, onnotice: () => {} });
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
      call((tx) => tx`
        select vibies_private.change_member(${session}, ${githubId}, ${action}, ${nickname}) as value
      `);
    const listErrors = (
      session: string,
      scope: string,
      query = "",
      cursor: { updatedAt: string; id: string } | null = null,
    ) => call((tx) => tx`
      select vibies_private.errors(
        ${session}, ${scope}, ${query},
        ${cursor?.updatedAt ?? null}::timestamptz,
        ${cursor?.id ?? null}::uuid
      ) as value
    `);
    const readError = (session: string, id: string) => call((tx) => tx`
      select vibies_private.error(${session}, ${id}::uuid) as value
    `);
    const createError = (session: string, value: ErrorFields, confirmed: boolean | null = true) =>
      call((tx) => tx`
        select vibies_private.create_error(
          ${session}, ${value.title}, ${value.errorText}, ${value.location},
          ${value.cause}, ${value.fixSteps}, ${value.successConfirmation}, ${confirmed}
        ) as value
      `);
    const editError = (
      session: string,
      id: string,
      version: string,
      value: ErrorFields,
      confirmed: boolean | null = true,
    ) => call((tx) => tx`
      select vibies_private.edit_error(
        ${session}, ${id}::uuid, ${version}::bigint,
        ${value.title}, ${value.errorText}, ${value.location}, ${value.cause},
        ${value.fixSteps}, ${value.successConfirmation}, ${confirmed}
      ) as value
    `);
    const deleteError = (session: string, id: string, version: string, confirmed: boolean | null) =>
      call((tx) => tx`
        select vibies_private.delete_error(
          ${session}, ${id}::uuid, ${version}::bigint, ${confirmed}
        ) as value
      `);
    const moderateError = (
      session: string,
      id: string,
      version: string,
      hidden: boolean,
      keep: string | null,
      improve: string | null,
    ) => call((tx) => tx`
      select vibies_private.moderate_error(
        ${session}, ${id}::uuid, ${version}::bigint, ${hidden}, ${keep}, ${improve}
      ) as value
    `);
    const setHelpful = (session: string, id: string, helpful: boolean) => call((tx) => tx`
      select vibies_private.set_error_helpful(${session}, ${id}::uuid, ${helpful}) as value
    `);
    const stored = async (id: string) => {
      const [row] = await sql`
        select id::text as id, author_actor_id::text as author_actor_id, author_nickname,
               title, error_text, location, cause, fix_steps, success_confirmation,
               moderation, keep_note, improve_note, created_at, updated_at,
               version::text as version
          from vibies_private.error_entries
         where id = ${id}::uuid
      `;
      return row;
    };

    const sessions = {
      firstInstructor: hash("error-first-instructor"),
      instructor: hash("error-current-instructor"),
      author: hash("error-author"),
      member: hash("error-member"),
      revoked: hash("error-revoked"),
      former: hash("error-former"),
      unapproved: hash("error-unapproved"),
      expired: hash("error-expired"),
      signedOut: hash("error-signed-out"),
    };

    try {
      await sql.unsafe(`
        do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon nologin;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin;
          end if;
        end $$;
      `);
      await migrationSql.unsafe(migration);
      await sql.unsafe(`
        truncate table
          vibies_private.error_helpful_reactions,
          vibies_private.error_entries,
          vibies_private.personal_projects,
          vibies_private.sessions,
          vibies_private.sign_in_flows,
          vibies_private.sign_in_attempts,
          vibies_private.instructor_audit,
          vibies_private.accounts
        restart identity;
        update vibies_private.community
           set instructor_github_id = null,
               instructor_nickname = null;
      `);

      let firstInstructorEntry = "";
      await t.test("schema access is private and Instructor actor replacement keeps attribution", async () => {
        await sql`select vibies_private.designate_instructor('100', 'FirstGuide', 'Synthetic initial setup')`;
        await finish("100", "synthetic-first-guide", sessions.firstInstructor);
        const [firstActor] = await sql`
          select instructor_actor_id::text as id from vibies_private.community where singleton
        `;
        assert.match(firstActor.id, /^[0-9a-f-]{36}$/);

        const created = await createError(sessions.firstInstructor, fields("Original guide"));
        assert.equal(created.kind, "created");
        firstInstructorEntry = created.id;
        assert.deepEqual(await setHelpful(sessions.firstInstructor, created.id, true), {
          kind: "ok", helpfulCount: 1,
        });

        await sql`select vibies_private.designate_instructor('100', 'FirstGuide', 'Synthetic repeat setup')`;
        const [sameActor] = await sql`
          select instructor_actor_id::text as id from vibies_private.community where singleton
        `;
        assert.equal(sameActor.id, firstActor.id);

        await sql`select vibies_private.designate_instructor('101', 'Guide', 'Synthetic replacement')`;
        const [replacementActor] = await sql`
          select instructor_actor_id::text as id from vibies_private.community where singleton
        `;
        assert.match(replacementActor.id, /^[0-9a-f-]{36}$/);
        assert.notEqual(replacementActor.id, firstActor.id);
        await finish("101", "synthetic-current-guide", sessions.instructor);

        assert.deepEqual(await listErrors(sessions.firstInstructor, "visible"), { kind: "forbidden" });
        const replacementRead = await readError(sessions.instructor, created.id);
        assert.equal(replacementRead.kind, "ok");
        assert.equal(replacementRead.entry.isAuthor, false);
        assert.equal(replacementRead.entry.helpfulCount, 0);
        assert.equal(replacementRead.entry.helpfulByMe, false);
        const [retainedHelpful] = await sql`
          select count(*)::int as count
            from vibies_private.error_helpful_reactions
           where entry_id = ${created.id}::uuid
        `;
        assert.equal(retainedHelpful.count, 1);
        assert.deepEqual(await editError(sessions.instructor, created.id, "1", fields("Blocked edit")), {
          kind: "forbidden",
        });
        assert.deepEqual(await deleteError(sessions.instructor, created.id, "1", true), {
          kind: "forbidden",
        });
        const hidden = await moderateError(
          sessions.instructor, created.id, "1", true, "Keep the cleaned text", "Improve the steps",
        );
        assert.deepEqual(hidden, { kind: "hidden", version: "2" });
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "2", false, null, null),
          { kind: "restored", version: "3" },
        );
        const retained = await stored(created.id);
        assert.equal(retained.author_actor_id, firstActor.id);
        assert.equal(retained.author_nickname, "FirstGuide");

        for (const role of ["vibies_runtime", "anon", "authenticated", "public"]) {
          const [rights] = await sql`
            select has_table_privilege(${role}, 'vibies_private.error_entries', 'select') as entries,
                   has_table_privilege(${role}, 'vibies_private.error_helpful_reactions', 'select') as reactions
          `;
          assert.deepEqual(rights, { entries: false, reactions: false });
        }
        await assert.rejects(
          () => asRuntime((tx) => tx`select * from vibies_private.error_entries`),
          (error: any) => error.code === "42501",
        );
        const [grants] = await sql`
          select jsonb_agg(
            format('%s(%s)', p.proname, pg_catalog.oidvectortypes(p.proargtypes))
            order by p.proname
          ) as functions
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'vibies_private'
             and p.proname in (
               'errors', 'error', 'create_error', 'edit_error',
               'delete_error', 'moderate_error', 'set_error_helpful'
             )
             and has_function_privilege('vibies_runtime', p.oid, 'execute')
        `;
        assert.deepEqual(grants.functions, [
          "create_error(text, text, text, text, text, text, text, boolean)",
          "delete_error(text, uuid, bigint, boolean)",
          "edit_error(text, uuid, bigint, text, text, text, text, text, text, boolean)",
          "error(text, uuid)",
          "errors(text, text, text, timestamp with time zone, uuid)",
          "moderate_error(text, uuid, bigint, boolean, text, text)",
          "set_error_helpful(text, uuid, boolean)",
        ]);
        const [privateGrant] = await sql`
          select count(*)::int as count
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'vibies_private'
             and left(p.proname, 7) = '_error_'
             and has_function_privilege('vibies_runtime', p.oid, 'execute')
        `;
        assert.equal(privateGrant.count, 0);
        const [publicGrant] = await sql`
          select count(*)::int as count
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'vibies_private'
             and p.proname in (
               'errors', 'error', 'create_error', 'edit_error',
               'delete_error', 'moderate_error', 'set_error_helpful'
             )
             and has_function_privilege('public', p.oid, 'execute')
        `;
        assert.equal(publicGrant.count, 0);
      });

      await finish("201", "synthetic-author", sessions.author);
      await finish("202", "synthetic-member", sessions.member);
      await finish("203", "synthetic-revoked", sessions.revoked);
      await finish("204", "synthetic-pending", sessions.unapproved);
      await finish("205", "synthetic-expired", sessions.expired);
      await finish("206", "synthetic-former", sessions.former);
      for (const [githubId, nickname] of [
        ["201", "Builder"], ["202", "Reader"], ["203", "Paused"],
        ["205", "Sleeper"], ["206", "Former"],
      ]) {
        assert.deepEqual(await change(sessions.instructor, githubId, "approve", nickname), { kind: "ok" });
      }
      assert.deepEqual(await change(sessions.instructor, "203", "revoke"), { kind: "ok" });
      assert.deepEqual(await change(sessions.instructor, "206", "revoke"), { kind: "ok" });
      await sql`update vibies_private.accounts set onboarding_completed = true where github_id = '202'`;
      await sql`
        update vibies_private.sessions
           set created_at = clock_timestamp() - interval '25 hours'
         where session_hash = ${sessions.expired}
      `;

      let roleEntry = "";
      await t.test("only current approved actors can use the Error Library", async () => {
        const onboarding = await createError(sessions.author, fields("Onboarding author"));
        assert.equal(onboarding.kind, "created");
        roleEntry = onboarding.id;
        const memberCreated = await createError(sessions.member, fields("Approved member"));
        const instructorCreated = await createError(sessions.instructor, fields("Current guide"));
        assert.equal(memberCreated.kind, "created");
        assert.equal(instructorCreated.kind, "created");
        assert.deepEqual(
          await editError(sessions.instructor, instructorCreated.id, "1", fields("Guide owned edit")),
          { kind: "edited", version: "2" },
        );
        assert.deepEqual(await deleteError(sessions.instructor, instructorCreated.id, "2", true), {
          kind: "deleted",
        });

        for (const session of [sessions.author, sessions.member, sessions.instructor]) {
          assert.equal((await listErrors(session, "visible")).kind, "ok");
          assert.equal((await readError(session, roleEntry)).kind, "ok");
        }
        for (const session of [
          sessions.signedOut, sessions.unapproved, sessions.revoked, sessions.former, sessions.expired,
        ]) {
          assert.deepEqual(await listErrors(session, "visible"), { kind: "forbidden" });
          assert.deepEqual(await readError(session, roleEntry), { kind: "forbidden" });
          assert.deepEqual(await createError(session, fields("Denied actor")), { kind: "forbidden" });
          assert.deepEqual(await editError(session, roleEntry, "1", fields("Denied edit")), {
            kind: "forbidden",
          });
          assert.deepEqual(await deleteError(session, roleEntry, "1", true), { kind: "forbidden" });
          assert.deepEqual(
            await moderateError(session, roleEntry, "1", true, "Keep note", "Improve note"),
            { kind: "forbidden" },
          );
          assert.deepEqual(await setHelpful(session, roleEntry, true), { kind: "forbidden" });
        }
        assert.deepEqual(
          await readError(sessions.member, "00000000-0000-4000-8000-000000000001"),
          { kind: "missing" },
        );
      });

      let normalizedEntry = "";
      await t.test("field validation, normalization, privacy categories, and duplicate text are atomic", async () => {
        const normalized = {
          title: "  Literal <#*` title  ",
          errorText: "  First line\r\nSecond line\rThird line  ",
          location: "  Local test\rfixture  ",
          cause: "  Cause unknown  ",
          fixSteps: "  Keep <code> literal\r\nRun *synthetic* step  ",
          successConfirmation: "  Exact # synthetic result  ",
        };
        const created = await createError(sessions.author, normalized);
        assert.equal(created.kind, "created");
        normalizedEntry = created.id;
        const saved = await stored(created.id);
        assert.deepEqual({
          title: saved.title,
          errorText: saved.error_text,
          location: saved.location,
          cause: saved.cause,
          fixSteps: saved.fix_steps,
          successConfirmation: saved.success_confirmation,
        }, {
          title: "Literal <#*` title",
          errorText: "First line\nSecond line\nThird line",
          location: "Local test\nfixture",
          cause: "Cause unknown",
          fixSteps: "Keep <code> literal\nRun *synthetic* step",
          successConfirmation: "Exact # synthetic result",
        });
        const rendered = JSON.stringify(await readError(sessions.author, created.id));
        assert.match(rendered, /<#\*` title/);
        assert.equal(/markdown|html|render/i.test(Object.keys(saved).join(" ")), false);

        const safeUrl = await createError(sessions.author, {
          ...fields("Public docs"),
          errorText: "See https://docs.example.com/guide?topic=errors",
        });
        assert.equal(safeUrl.kind, "created");
        const safeEncodedUrl = await createError(sessions.author, {
          ...fields("Encoded public docs"),
          errorText: "See https://docs.example.com/%65rrors?topic=pass%77ord",
        });
        assert.equal(safeEncodedUrl.kind, "created");
        for (const [label, url] of [
          ["Public IPv4 docs", "https://203.0.113.7/docs"],
          ["Public IPv6 docs", "https://[2001:db8::7]/docs"],
          ["Encoded query value", "https://docs.example.com/errors?topic=api%5fkey"],
          ["Public hostname suffix", "https://one.two.localhost.example.com/docs"],
          ["Public hostname prefix", "https://notinternal.example.com/docs"],
          ["Local word in path", "https://docs.example.com/one.two.localhost"],
          ["Local word in query", "https://docs.example.com?host=one.two.local"],
          ["Local word in fragment", "https://docs.example.com#api.dev.internal"],
        ]) {
          const safe = await createError(sessions.author, {
            ...fields(label), errorText: `See ${url}`,
          });
          assert.equal(safe.kind, "created", url);
        }
        const duplicateA = await createError(sessions.author, fields("Duplicate clue"));
        const duplicateB = await createError(sessions.author, fields("Duplicate clue"));
        assert.equal(duplicateA.kind, "created");
        assert.equal(duplicateB.kind, "created");
        assert.notEqual(duplicateA.id, duplicateB.id);

        const minimum = await createError(sessions.author, {
          title: "Title", errorText: "e", location: "ok", cause: "c",
          fixSteps: "f", successConfirmation: "s",
        });
        const maximum = await createError(sessions.author, {
          title: "🌱".repeat(120), errorText: "🌱".repeat(2000), location: "🌱".repeat(200),
          cause: "🌱".repeat(2000), fixSteps: "🌱".repeat(5000),
          successConfirmation: "🌱".repeat(1000),
        });
        assert.equal(minimum.kind, "created");
        assert.equal(maximum.kind, "created");

        const invalidFields: ErrorFields[] = [
          { ...fields("Short title"), title: "four" },
          { ...fields("Long title"), title: "🌱".repeat(121) },
          { ...fields("Empty error"), errorText: "" },
          { ...fields("Long error"), errorText: "🌱".repeat(2001) },
          { ...fields("Short location"), location: "x" },
          { ...fields("Long location"), location: "🌱".repeat(201) },
          { ...fields("Empty cause"), cause: "" },
          { ...fields("Long cause"), cause: "🌱".repeat(2001) },
          { ...fields("Empty fix"), fixSteps: "" },
          { ...fields("Long fix"), fixSteps: "🌱".repeat(5001) },
          { ...fields("Empty success"), successConfirmation: "" },
          { ...fields("Long success"), successConfirmation: "🌱".repeat(1001) },
          { ...fields("Control title"), title: "Bad\ttitle" },
          { ...fields("Control error"), errorText: "Bad\u200btext" },
          { ...fields("Control location"), location: "Bad\u007fplace" },
          { ...fields("Control cause"), cause: "Bad\t cause" },
          { ...fields("Control fix"), fixSteps: "Bad\u2060fix" },
          { ...fields("Control success"), successConfirmation: "Bad\tsuccess" },
        ];
        const countBeforeInvalid = await sql`
          select count(*)::int as count from vibies_private.error_entries
        `;
        for (const invalid of invalidFields) {
          assert.deepEqual(await createError(sessions.author, invalid), { kind: "invalid" });
        }
        assert.deepEqual(await createError(sessions.author, fields("No confirmation"), false), {
          kind: "confirmation",
        });
        assert.deepEqual(await createError(sessions.author, fields("Null confirmation"), null), {
          kind: "confirmation",
        });
        const [countAfterInvalid] = await sql`
          select count(*)::int as count from vibies_private.error_entries
        `;
        assert.equal(countAfterInvalid.count, countBeforeInvalid[0].count);

        assert.deepEqual(await call((tx) => tx`
          select vibies_private.error(${sessions.author}, null) as value
        `), { kind: "invalid" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.create_error(
            ${sessions.author}, null, 'error', 'test', 'Cause unknown', 'fix', 'success', true
          ) as value
        `), { kind: "invalid" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.edit_error(
            ${sessions.author}, null, 1, 'Title', 'error', 'test',
            'Cause unknown', 'fix', 'success', true
          ) as value
        `), { kind: "invalid" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.delete_error(${sessions.author}, null, 1, true) as value
        `), { kind: "invalid" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.moderate_error(
            ${sessions.instructor}, ${normalizedEntry}::uuid, 1, null, null, null
          ) as value
        `), { kind: "invalid" });
        assert.deepEqual(await call((tx) => tx`
          select vibies_private.set_error_helpful(
            ${sessions.author}, ${normalizedEntry}::uuid, null
          ) as value
        `), { kind: "invalid" });

        const privacyProbes: Array<[string, string]> = [
          ["private_key", "-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----"],
          ["private_key", "-----BEGIN ENCRYPTED PRIVATE KEY-----\nsynthetic\n-----END ENCRYPTED PRIVATE KEY-----"],
          ["known_token", `github_pat_${"A".repeat(30)}`],
          ["email", "builder@example.com"],
          ["env_secret", "TOKEN=synthetic"],
          ["env_secret", "SECRET=synthetic"],
          ["env_secret", "PASSWORD=synthetic"],
          ["env_secret", "API_KEY=synthetic"],
          ["env_secret", "VIBIES_API_KEY=synthetic-value"],
          ["database_url", "postgresql://member:synthetic-password@example.com/db"],
          ["url_credentials", "https://name@docs.example.com"],
          ["home_path", "/Users/synthetic/private/file.ts"],
          ["url_credentials", "https://member:synthetic-password@example.com/docs"],
          ["url_token", "https://example.com/docs?token=synthetic-value"],
          ["local_url", "https://127.0.0.1/docs"],
          ["local_url", "https://127.1/docs"],
          ["local_url", "https://2130706433/docs"],
          ["local_url", "https://0x7f.0.0.1/docs"],
          ["local_url", "https://0177.0.0.1/docs"],
          ["local_url", "https://[::ffff:127.0.0.1]/docs"],
          ["local_url", "https://[0:0:0:0:0:0:0:1]/docs"],
          ["local_url", "https://[0::1]/docs"],
          ["local_url", "https://[::ffff:10.0.0.1]/docs"],
          ["local_url", "https://[::ffff:172.16.0.1]/docs"],
          ["local_url", "https://[::ffff:192.168.0.1]/docs"],
          ["local_url", "https://[::ffff:169.254.0.1]/docs"],
          ["local_url", "https://[::ffff:0.0.0.0]/docs"],
          ["local_url", "https://localhost./docs"],
          ["local_url", "https://one.localhost/docs"],
          ["local_url", "https://one.two.localhost/docs"],
          ["local_url", "https://one.two.local/docs"],
          ["local_url", "https://api.dev.internal/docs"],
          ["local_url", "https://ONE.TWO.LOCALHOST.:8443/docs"],
          ["local_url", "https://api.dev.local:8443?topic=errors"],
          ["local_url", "https://api.dev.internal.#errors"],
          ["local_url", "https://10.0.0.1./docs"],
          ["local_url", "https://%6c%6f%63%61%6c%68%6f%73%74/docs"],
          ["local_url", "https://999.999.999.999/docs"],
          ["local_url", "https://[not-an-ip]/docs"],
          ["url_token", "https://example.com/docs?to%6ben=synthetic-value"],
          ["url_token", "https://example.com/docs?api%5fkey=synthetic-value"],
          ["url_token", "https://example.com/docs?pass%77ord=synthetic-value"],
          ["home_path", "cwd=/Users/Synthetic/private/file.ts"],
          ["home_path", "HOME=/home/Synthetic/private/file.ts"],
          ["home_path", "cwd=C:\\Users\\Synthetic\\private\\file.ts"],
          ["unsafe_url", "http://example.com/docs"],
        ];
        const privacyCount = countAfterInvalid.count;
        const baseline = await stored(normalizedEntry);
        for (const [category, probe] of privacyProbes) {
          const unsafe = { ...fields(`Privacy ${category}`), errorText: probe };
          const createResult = await createError(sessions.author, unsafe);
          assert.deepEqual(createResult, { kind: "privacy", category });
          assert.equal(JSON.stringify(createResult).includes(probe), false);
          const editResult = await editError(sessions.author, normalizedEntry, baseline.version, unsafe);
          assert.deepEqual(editResult, { kind: "privacy", category });
          assert.equal(JSON.stringify(editResult).includes(probe), false);
        }
        const [afterPrivacy] = await sql`
          select count(*)::int as count from vibies_private.error_entries
        `;
        assert.equal(afterPrivacy.count, privacyCount);
        assert.deepEqual(await stored(normalizedEntry), baseline);
      });

      await t.test("visible search is literal across all fields with stable 21-row pagination", async () => {
        const searchCases: Array<[keyof ErrorFields, string]> = [
          ["title", "ÉCLAIRZebra"],
          ["errorText", "ErrorQuartz"],
          ["location", "LocationIndigo"],
          ["cause", "CauseViolet"],
          ["fixSteps", "FixAmber"],
          ["successConfirmation", "SuccessCobalt"],
        ];
        const searchIds = new Map<string, string>();
        for (const [field, marker] of searchCases) {
          const value = { ...fields(`Search ${field}`), [field]: `before ${marker} after` };
          const created = await createError(sessions.author, value);
          assert.equal(created.kind, "created");
          searchIds.set(marker, created.id);
        }
        for (const [, marker] of searchCases) {
          const result = await listErrors(sessions.member, "visible", marker.toLowerCase());
          assert.equal(result.kind, "ok");
          assert.equal(result.entries.some((entry: any) => entry.id === searchIds.get(marker)), true);
          const item = result.entries.find((entry: any) => entry.id === searchIds.get(marker));
          assert.match(item.segment.toLowerCase(), new RegExp(marker.toLowerCase()));
          assert.ok([...item.segment].length <= 160);
          assert.deepEqual(Object.keys(item).sort(), [
            "helpfulCount", "id", "nickname", "segment", "title", "updatedAt",
          ]);
        }

        const literal = await createError(sessions.author, {
          ...fields("Literal search"),
          errorText: "percent%value under_score back\\slash",
        });
        assert.equal(literal.kind, "created");
        for (const query of ["%", "_", "\\"]) {
          const result = await listErrors(sessions.member, "visible", query);
          assert.equal(result.kind, "ok");
          assert.equal(result.entries.some((entry: any) => entry.id === literal.id), true);
          assert.equal(result.entries.every((entry: any) => entry.segment.includes(query)), true);
        }
        const empty = await listErrors(sessions.member, "visible", "no-synthetic-result-here");
        assert.deepEqual(empty, { kind: "ok", entries: [], nextCursor: null });

        const longText = `${"a".repeat(100)}Needle${"b".repeat(100)}`;
        const longSegment = await createError(sessions.author, {
          ...fields("Long segment"), errorText: longText,
        });
        assert.equal(longSegment.kind, "created");
        const match = await listErrors(sessions.member, "visible", "needle");
        assert.deepEqual(match.entries.map((entry: any) => entry.id), [longSegment.id]);
        assert.equal(match.entries[0].segment, `${"a".repeat(60)}Needle${"b".repeat(94)}`);

        const pageIds: string[] = [];
        for (let index = 0; index < 21; index += 1) {
          const created = await createError(sessions.author, {
            ...fields(`Page ${String(index).padStart(2, "0")}`),
            errorText: `PageMarker synthetic error ${index}`,
          });
          assert.equal(created.kind, "created");
          pageIds.push(created.id);
        }
        await sql`
          update vibies_private.error_entries
             set updated_at = '2040-01-02T03:04:05Z'::timestamptz
           where id in ${sql(pageIds)}
        `;
        const firstPage = await listErrors(sessions.member, "visible", "pagemarker");
        assert.equal(firstPage.kind, "ok");
        assert.equal(firstPage.entries.length, 20);
        assert.deepEqual(firstPage.nextCursor, {
          updatedAt: firstPage.entries[19].updatedAt,
          id: firstPage.entries[19].id,
        });
        const secondPage = await listErrors(sessions.member, "visible", "PageMarker", firstPage.nextCursor);
        assert.equal(secondPage.kind, "ok");
        assert.equal(secondPage.entries.length, 1);
        assert.equal(secondPage.nextCursor, null);
        const combined = [...firstPage.entries, ...secondPage.entries].map((entry: any) => entry.id);
        assert.equal(new Set(combined).size, 21);
        assert.deepEqual(combined, [...pageIds].sort().reverse());

        await sql`
          update vibies_private.error_entries
             set updated_at = '2050-01-02T03:04:05Z'::timestamptz
           where id = ${longSegment.id}::uuid
        `;
        const blank = await listErrors(sessions.member, "visible", "");
        assert.equal(blank.kind, "ok");
        assert.equal(blank.entries.length, 20);
        assert.equal(blank.entries[0].id, longSegment.id);
        assert.equal(blank.entries[0].segment, longText.slice(0, 160));
        assert.ok(blank.entries.every((entry: any) => [...entry.segment].length <= 160));
        const nullQuery = await call((tx) => tx`
          select vibies_private.errors(${sessions.member}, 'visible', null, null, null) as value
        `);
        assert.deepEqual(nullQuery, { kind: "invalid" });
        assert.deepEqual(await listErrors(sessions.member, "unknown"), { kind: "invalid" });
        const badCursor = await call((tx) => tx`
          select vibies_private.errors(
            ${sessions.member}, 'visible', '', clock_timestamp(), null
          ) as value
        `);
        assert.deepEqual(badCursor, { kind: "invalid" });
      });

      let hiddenEntry = "";
      await t.test("mine and Instructor hidden scopes protect direct reads and moderation notes", async () => {
        const created = await createError(sessions.author, fields("Hidden scope"));
        assert.equal(created.kind, "created");
        hiddenEntry = created.id;
        const original = await stored(created.id);

        for (const session of [sessions.author, sessions.member, sessions.signedOut, sessions.unapproved]) {
          assert.deepEqual(
            await moderateError(session, created.id, "1", true, "Keep note", "Improve note"),
            { kind: "forbidden" },
          );
        }
        for (const [keep, improve, expected] of [
          [null, "Improve note", "invalid"],
          ["Keep note", null, "invalid"],
          ["", "Improve note", "invalid"],
          ["k".repeat(501), "Improve note", "invalid"],
          ["Keep\tnote", "Improve note", "invalid"],
          ["builder@example.com", "Improve note", "privacy"],
        ] as Array<[string | null, string | null, string]>) {
          const result = await moderateError(sessions.instructor, created.id, "1", true, keep, improve);
          assert.equal(result.kind, expected);
          if (expected === "privacy") {
            assert.equal(result.category, "email");
            assert.equal(JSON.stringify(result).includes("builder@example.com"), false);
          }
        }
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "1", true,
            "Keep the useful context", "Remove https://one.two.localhost/docs"),
          { kind: "privacy", category: "local_url" },
        );
        assert.deepEqual(await stored(created.id), original);

        const [hiddenResult, competingResult] = await Promise.all([
          moderateError(
            sessions.instructor, created.id, "1", true,
            "  Keep the useful context\r\nexactly  ", "  Improve the sequence\rfor beginners  ",
          ),
          moderateError(sessions.instructor, created.id, "1", true, "Second keep", "Second improve"),
        ]);
        assert.deepEqual([hiddenResult.kind, competingResult.kind].sort(), ["hidden", "stale"]);
        const hidden = await stored(created.id);
        assert.equal(hidden.moderation, "Hidden");
        assert.equal(hidden.version, "2");
        for (const column of [
          "author_actor_id", "author_nickname", "title", "error_text", "location",
          "cause", "fix_steps", "success_confirmation", "created_at", "updated_at",
        ]) {
          const beforeValue = original[column];
          const afterValue = hidden[column];
          assert.deepEqual(afterValue, beforeValue, column);
        }
        assert.ok([
          "Keep the useful context\nexactly", "Second keep",
        ].includes(hidden.keep_note));
        assert.ok([
          "Improve the sequence\nfor beginners", "Second improve",
        ].includes(hidden.improve_note));
        assert.deepEqual(
          await moderateError(
            sessions.instructor, created.id, "2", true, "Replacement keep", "Replacement improve",
          ),
          { kind: "hidden", version: "2" },
        );
        assert.deepEqual(await stored(created.id), hidden);

        const authorRead = await readError(sessions.author, created.id);
        const instructorRead = await readError(sessions.instructor, created.id);
        assert.equal(authorRead.kind, "ok");
        assert.equal(instructorRead.kind, "ok");
        for (const read of [authorRead, instructorRead]) {
          assert.equal(read.entry.moderation, "Hidden");
          assert.equal(read.entry.keep, hidden.keep_note);
          assert.equal(read.entry.improve, hidden.improve_note);
        }
        assert.deepEqual(await readError(sessions.member, created.id), { kind: "missing" });
        assert.deepEqual(await setHelpful(sessions.member, created.id, true), { kind: "missing" });
        assert.equal(
          (await listErrors(sessions.member, "visible", "Hidden scope")).entries.length,
          0,
        );
        const mine = await listErrors(sessions.author, "mine", "Hidden scope");
        assert.deepEqual(mine.entries.map((entry: any) => entry.id), [created.id]);
        assert.equal(JSON.stringify(mine).includes(hidden.keep_note), false);
        const visibleMine = await listErrors(sessions.author, "mine", "Onboarding author");
        assert.deepEqual(visibleMine.entries.map((entry: any) => entry.id), [roleEntry]);
        assert.equal((await listErrors(sessions.member, "mine", "Hidden scope")).entries.length, 0);
        assert.deepEqual(await listErrors(sessions.member, "hidden"), { kind: "forbidden" });
        const hiddenList = await listErrors(sessions.instructor, "hidden", "Hidden scope");
        assert.deepEqual(hiddenList.entries.map((entry: any) => entry.id), [created.id]);
        assert.deepEqual(
          await moderateError(
            sessions.instructor, "00000000-0000-4000-8000-000000000001", "1", true,
            "Keep note", "Improve note",
          ),
          { kind: "forbidden" },
        );

        const editedFields = fields("Edited while hidden");
        assert.deepEqual(await editError(sessions.author, created.id, "2", editedFields), {
          kind: "edited", version: "3",
        });
        const afterEdit = await stored(created.id);
        assert.equal(afterEdit.moderation, "Hidden");
        assert.equal(afterEdit.keep_note, hidden.keep_note);
        assert.equal(afterEdit.improve_note, hidden.improve_note);
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "2", false, null, null),
          { kind: "stale" },
        );
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "3", false, "not null", null),
          { kind: "invalid" },
        );
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "3", false, null, null),
          { kind: "restored", version: "4" },
        );
        const restored = await stored(created.id);
        assert.deepEqual({
          moderation: restored.moderation,
          keep: restored.keep_note,
          improve: restored.improve_note,
          title: restored.title,
        }, { moderation: "Visible", keep: null, improve: null, title: editedFields.title });
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "4", false, null, null),
          { kind: "restored", version: "4" },
        );
      });

      let reactionEntry = "";
      await t.test("Helpful reactions are private, idempotent, concurrent, and access-aware", async () => {
        const created = await createError(sessions.author, fields("Helpful target"));
        assert.equal(created.kind, "created");
        reactionEntry = created.id;
        const sibling = await createError(sessions.member, fields("Helpful sibling"));
        assert.equal(sibling.kind, "created");
        const orderBefore = (await listErrors(sessions.member, "visible", "Helpful")).entries
          .map((entry: any) => entry.id);
        const before = await stored(created.id);
        assert.equal((await readError(sessions.author, created.id)).entry.helpfulByMe, false);

        const repeated = await Promise.all([
          setHelpful(sessions.author, created.id, true),
          setHelpful(sessions.author, created.id, true),
        ]);
        assert.deepEqual(repeated, [
          { kind: "ok", helpfulCount: 1 },
          { kind: "ok", helpfulCount: 1 },
        ]);
        const competing = await Promise.all([
          setHelpful(sessions.member, created.id, true),
          setHelpful(sessions.instructor, created.id, true),
        ]);
        assert.deepEqual(competing.map(value => value.helpfulCount).sort((a, b) => a - b), [2, 3]);
        for (const session of [sessions.author, sessions.member, sessions.instructor]) {
          const read = await readError(session, created.id);
          assert.equal(read.entry.helpfulCount, 3);
          assert.equal(read.entry.helpfulByMe, true);
          assert.equal(JSON.stringify(read).includes("actor"), false);
          assert.equal(JSON.stringify(read).includes("synthetic-"), false);
        }
        const afterAdds = await stored(created.id);
        assert.equal(afterAdds.version, before.version);
        assert.equal(afterAdds.updated_at.toISOString(), before.updated_at.toISOString());
        assert.deepEqual(
          (await listErrors(sessions.member, "visible", "Helpful")).entries
            .map((entry: any) => entry.id),
          orderBefore,
        );

        assert.deepEqual(await setHelpful(sessions.member, created.id, false), {
          kind: "ok", helpfulCount: 2,
        });
        assert.deepEqual(await setHelpful(sessions.member, created.id, false), {
          kind: "ok", helpfulCount: 2,
        });
        const [reactionRows] = await sql`
          select count(*)::int as count
            from vibies_private.error_helpful_reactions
           where entry_id = ${created.id}::uuid
        `;
        assert.equal(reactionRows.count, 2);

        assert.deepEqual(
          await moderateError(
            sessions.instructor, created.id, "1", true,
            "Keep the reaction context", "Improve the verification detail",
          ),
          { kind: "hidden", version: "2" },
        );
        assert.equal((await readError(sessions.instructor, created.id)).entry.helpfulCount, 2);
        assert.equal(reactionRows.count, 2);
        assert.deepEqual(
          await moderateError(sessions.instructor, created.id, "2", false, null, null),
          { kind: "restored", version: "3" },
        );
        assert.equal((await readError(sessions.member, created.id)).entry.helpfulCount, 2);

        assert.deepEqual(await change(sessions.instructor, "201", "revoke"), { kind: "ok" });
        assert.equal((await readError(sessions.member, created.id)).entry.helpfulCount, 1);
        const [retainedReaction] = await sql`
          select count(*)::int as count
            from vibies_private.error_helpful_reactions
           where entry_id = ${created.id}::uuid
        `;
        assert.equal(retainedReaction.count, 2);
        assert.deepEqual(await setHelpful(sessions.author, created.id, false), { kind: "forbidden" });
        assert.deepEqual(await change(sessions.instructor, "201", "reapprove"), { kind: "ok" });
        const reapprovedRead = await readError(sessions.author, created.id);
        assert.equal(reapprovedRead.entry.helpfulCount, 2);
        assert.equal(reapprovedRead.entry.helpfulByMe, true);

        const visibleList = await listErrors(sessions.member, "visible", "Helpful target");
        assert.equal(visibleList.entries[0].helpfulCount, 2);
        assert.equal("helpfulByMe" in visibleList.entries[0], false);
        assert.equal((await stored(created.id)).version, "3");
      });

      await t.test("author edit and delete protect ownership, versions, retained rows, and cascade cleanup", async () => {
        const created = await createError(sessions.author, fields("Owned lifecycle"));
        assert.equal(created.kind, "created");
        const original = await stored(created.id);
        assert.deepEqual(await editError(sessions.member, created.id, "1", fields("Wrong owner")), {
          kind: "forbidden",
        });
        assert.deepEqual(await editError(sessions.instructor, created.id, "1", fields("Guide rewrite")), {
          kind: "forbidden",
        });
        assert.deepEqual(await editError(sessions.author, created.id, "0", fields("Invalid version")), {
          kind: "invalid",
        });
        assert.deepEqual(await editError(sessions.author, created.id, "1", fields("No privacy"), false), {
          kind: "confirmation",
        });
        assert.deepEqual(await stored(created.id), original);

        const competing = await Promise.all([
          editError(sessions.author, created.id, "1", fields("First competing edit")),
          editError(sessions.author, created.id, "1", fields("Second competing edit")),
        ]);
        assert.deepEqual(competing.map(value => value.kind).sort(), ["edited", "stale"]);
        const edited = await stored(created.id);
        assert.equal(edited.version, "2");
        assert.ok(edited.updated_at > original.updated_at);
        assert.ok(["First competing edit error", "Second competing edit error"].includes(edited.title));
        const winningFields = edited.title === "First competing edit error"
          ? fields("First competing edit")
          : fields("Second competing edit");
        assert.deepEqual({
          title: edited.title,
          errorText: edited.error_text,
          location: edited.location,
          cause: edited.cause,
          fixSteps: edited.fix_steps,
          successConfirmation: edited.success_confirmation,
        }, winningFields);
        assert.deepEqual(await editError(sessions.author, created.id, "1", fields("Repeated stale edit")), {
          kind: "stale",
        });

        assert.deepEqual(await setHelpful(sessions.author, created.id, true), { kind: "ok", helpfulCount: 1 });
        assert.deepEqual(await setHelpful(sessions.member, created.id, true), { kind: "ok", helpfulCount: 2 });
        assert.deepEqual(await deleteError(sessions.author, created.id, "2", false), { kind: "confirmation" });
        assert.deepEqual(await deleteError(sessions.author, created.id, "2", null), { kind: "confirmation" });
        assert.deepEqual(await deleteError(sessions.member, created.id, "2", true), { kind: "forbidden" });
        assert.deepEqual(await deleteError(sessions.instructor, created.id, "2", true), { kind: "forbidden" });
        assert.deepEqual(await deleteError(sessions.author, created.id, "1", true), { kind: "stale" });
        assert.equal((await stored(created.id)).title, edited.title);

        assert.deepEqual(await change(sessions.instructor, "201", "revoke"), { kind: "ok" });
        assert.deepEqual(await editError(sessions.author, created.id, "2", fields("Revoked edit")), {
          kind: "forbidden",
        });
        assert.deepEqual(await deleteError(sessions.author, created.id, "2", true), { kind: "forbidden" });
        assert.ok(await stored(created.id));
        assert.deepEqual(await change(sessions.instructor, "201", "reapprove"), { kind: "ok" });

        const deleted = await Promise.all([
          deleteError(sessions.author, created.id, "2", true),
          deleteError(sessions.author, created.id, "2", true),
        ]);
        assert.deepEqual(deleted.map(value => value.kind).sort(), ["deleted", "forbidden"]);
        assert.equal(await stored(created.id), undefined);
        const [reactions] = await sql`
          select count(*)::int as count
            from vibies_private.error_helpful_reactions
           where entry_id = ${created.id}::uuid
        `;
        assert.equal(reactions.count, 0);
        assert.deepEqual(await deleteError(sessions.author, created.id, "2", true), { kind: "forbidden" });
        assert.deepEqual(await setHelpful(sessions.member, created.id, true), { kind: "missing" });

        const [retained] = await sql`
          select count(*)::int as count
            from vibies_private.error_entries
           where id in (${roleEntry}::uuid, ${hiddenEntry}::uuid, ${reactionEntry}::uuid, ${firstInstructorEntry}::uuid)
        `;
        assert.equal(retained.count, 4);
      });

      await t.test("database constraints and function responses keep identity private", async () => {
        const [columns] = await sql`
          select jsonb_object_agg(column_name, data_type) as definitions
            from information_schema.columns
           where table_schema = 'vibies_private'
             and table_name in ('error_entries', 'error_helpful_reactions')
        `;
        for (const forbidden of [
          "github_id", "github_username", "session_hash", "email", "profile", "repository_url",
        ]) {
          assert.equal(forbidden in columns.definitions, false);
        }
        const indexes = await sql`
          select indexname
            from pg_catalog.pg_indexes
           where schemaname = 'vibies_private'
             and indexname in (
               'error_entries_moderation_updated_idx',
               'error_entries_author_updated_idx'
             )
           order by indexname
        `;
        assert.deepEqual(indexes.map(row => row.indexname), [
          "error_entries_author_updated_idx",
          "error_entries_moderation_updated_idx",
        ]);
        await assert.rejects(() => sql`
          insert into vibies_private.error_entries (
            author_actor_id, author_nickname, title, error_text, location,
            cause, fix_steps, success_confirmation, moderation, keep_note
          ) values (
            gen_random_uuid(), 'Synthetic', 'Invalid state', 'error', 'test',
            'Cause unknown', 'fix', 'success', 'Visible', 'unexpected note'
          )
        `, (error: any) => error.code === "23514");
        await assert.rejects(() => sql`
          insert into vibies_private.error_entries (
            author_actor_id, author_nickname, title, error_text, location,
            cause, fix_steps, success_confirmation, version
          ) values (
            gen_random_uuid(), 'Synthetic', 'Invalid version', 'error', 'test',
            'Cause unknown', 'fix', 'success', 0
          )
        `, (error: any) => error.code === "23514");
        await assert.rejects(() => sql`
          insert into vibies_private.error_entries (
            author_actor_id, author_nickname, title, error_text, location,
            cause, fix_steps, success_confirmation
          ) values (
            gen_random_uuid(), 'Synthetic', 'Unsafe storage', 'builder@example.com', 'test',
            'Cause unknown', 'fix', 'success'
          )
        `, (error: any) => error.code === "23514");
        await assert.rejects(() => sql`
          insert into vibies_private.error_entries (
            author_actor_id, author_nickname, title, error_text, location,
            cause, fix_steps, success_confirmation, created_at, updated_at
          ) values (
            gen_random_uuid(), 'Synthetic', 'Invalid times', 'error', 'test',
            'Cause unknown', 'fix', 'success', clock_timestamp(),
            clock_timestamp() - interval '1 minute'
          )
        `, (error: any) => error.code === "23514");

        const visibleRead = await readError(sessions.author, normalizedEntry);
        assert.equal(visibleRead.kind, "ok");
        assert.deepEqual(Object.keys(visibleRead.entry).sort(), [
          "cause", "createdAt", "errorText", "fixSteps", "helpfulByMe", "helpfulCount",
          "id", "isAuthor", "location", "nickname", "successConfirmation", "title",
          "updatedAt", "version",
        ]);
        assert.equal(visibleRead.entry.isAuthor, true);
        const outputs = [
          await listErrors(sessions.author, "mine"),
          visibleRead,
          await readError(sessions.instructor, firstInstructorEntry),
        ];
        const serialized = JSON.stringify(outputs);
        for (const privateValue of [
          "synthetic-author", "synthetic-current-guide",
          sessions.author, sessions.instructor,
        ]) {
          assert.equal(serialized.includes(privateValue), false);
        }
        const actorRows = await sql`
          select author_actor_id::text as id from vibies_private.error_entries
          union all
          select actor_id::text as id from vibies_private.error_helpful_reactions
        `;
        for (const row of actorRows) assert.equal(serialized.includes(row.id), false);
      });
    } finally {
      await migrationSql.end();
      await sql.end();
    }
  });
}
