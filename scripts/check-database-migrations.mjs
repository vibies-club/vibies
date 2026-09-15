import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const migrationDirectory = join(root, "supabase", "migrations");
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
const migrations = migrationFiles.map((name) => name.slice(0, 14));
const deployedMigrations = [
  "20260910065142_remote_schema.sql",
  "20260910220000_demo_projects.sql",
  "20260910220001_access.sql",
];
const capacityMigration = "20260913192500_access.sql";
const roadmapMigration = "20260913212638_access.sql";
assert.equal(migrationFiles[0], "20260910065142_remote_schema.sql");
assert.ok(migrationFiles.includes(capacityMigration), `${capacityMigration} must exist`);
assert.ok(migrationFiles.includes(roadmapMigration), `${roadmapMigration} must exist`);
assert.equal(new Set(migrations).size, migrations.length, "migration versions must be unique");

function supabase(args, shouldFail = false) {
  const result = spawnSync("supabase", args, { encoding: "utf8", timeout: 180_000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  assert.equal(result.error, undefined, `supabase ${args.join(" ")} failed to run`);
  if (shouldFail) assert.notEqual(result.status, 0, "the broken migration unexpectedly passed");
  else assert.equal(result.status, 0, `supabase ${args.join(" ")} failed\n${output}`);
  return output;
}

async function usingDatabase(run) {
  const sql = postgres(databaseUrl, { connect_timeout: 5, max: 1, onnotice: () => {} });
  try { return await run(sql); }
  finally { await sql.end({ timeout: 1 }); }
}

async function history(sql) {
  const [{ present }] = await sql`
    select to_regclass('supabase_migrations.schema_migrations') is not null as present
  `;
  if (!present) return [];
  return (await sql`
    select version from supabase_migrations.schema_migrations order by version
  `).map(({ version }) => version);
}

async function makeProject(label, files) {
  const project = await mkdtemp(join(tmpdir(), `vibies-migrations-${label}-`));
  await mkdir(join(project, "supabase", "migrations"), { recursive: true });
  await copyFile(join(root, "supabase", "config.toml"), join(project, "supabase", "config.toml"));
  for (const name of files) {
    await copyFile(join(migrationDirectory, name), join(project, "supabase", "migrations", name));
  }
  await assert.rejects(access(join(project, "supabase", ".temp", "project-ref")),
    (error) => error.code === "ENOENT");
  return project;
}

async function checkBoundaries(sql, runtimeFunctions = 22) {
  const [role] = await sql`
    select rolcanlogin, rolinherit from pg_roles where rolname = 'vibies_runtime'
  `;
  assert.deepEqual(role, { rolcanlogin: false, rolinherit: false });
  const [privileges] = await sql`
    select
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'vibies_private'
          and has_function_privilege('vibies_runtime', p.oid, 'EXECUTE')) as runtime_functions,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'vibies_private' and c.relkind in ('r', 'p', 'v', 'm', 'f')
          and (has_table_privilege('vibies_runtime', c.oid, 'SELECT')
            or has_table_privilege('vibies_runtime', c.oid, 'INSERT')
            or has_table_privilege('vibies_runtime', c.oid, 'UPDATE')
            or has_table_privilege('vibies_runtime', c.oid, 'DELETE'))) as runtime_tables,
      has_schema_privilege('anon', 'vibies_private', 'USAGE') as anon_private,
      has_schema_privilege('authenticated', 'vibies_private', 'USAGE') as authenticated_private,
      has_table_privilege('anon', 'public.demo_projects', 'SELECT') as anon_demo,
      has_table_privilege('anon', 'public.demo_projects', 'INSERT') as anon_demo_write,
      has_table_privilege('authenticated', 'public.demo_projects', 'SELECT') as authenticated_demo
  `;
  assert.deepEqual(privileges, {
    runtime_functions: runtimeFunctions, runtime_tables: 0, anon_private: false,
    authenticated_private: false, anon_demo: true, anon_demo_write: false,
    authenticated_demo: false,
  });
}

async function retainedRows(sql) {
  return {
    account: await sql`select to_jsonb(a) as row from vibies_private.accounts a
      where github_id = '200'`,
    session: await sql`select to_jsonb(s) as row from vibies_private.sessions s
      where session_hash = ${"a".repeat(64)}`,
    project: await sql`select to_jsonb(p) as row from vibies_private.personal_projects p
      where repository_id = '9001'`,
    demo: await sql`select to_jsonb(d) as row from public.demo_projects d where id = 1`,
    community: await sql`select to_jsonb(c) as row from vibies_private.community c`,
    audit: await sql`select to_jsonb(a) as row from vibies_private.instructor_audit a order by id`,
  };
}

async function capacityRows(sql) {
  return {
    ...await retainedRows(sql),
    accounts: await sql`select to_jsonb(a) as row from vibies_private.accounts a order by github_id`,
    sessions: await sql`select to_jsonb(s) as row from vibies_private.sessions s order by session_hash`,
  };
}

let cleanProject;
let upgradeProject;
let legacyProject;
let capacityProject;
try {
  const config = await readFile(join(root, "supabase", "config.toml"), "utf8");
  assert.match(config, /^project_id = "vibies-migrations"$/m);
  assert.match(config, /^port = 54322$/m);
  assert.match(config, /^major_version = 17$/m);
  assert.match(supabase(["--version"]), /^2\.109\.1\s*$/m);

  await usingDatabase(async (sql) => {
    const [server] = await sql`select current_database() as database,
      current_setting('server_version_num')::int / 10000 as major`;
    assert.deepEqual(server, { database: "postgres", major: 17 });
    assert.ok((await history(sql)).every((version) => migrations.includes(version)),
      "the local stack contains unrelated migration history");
    for (const table of ["accounts", "sessions", "personal_projects", "project_milestones"]) {
      const [{ present }] = await sql`
        select to_regclass(${`vibies_private.${table}`}) is not null as present
      `;
      if (present) {
        const [{ count }] = await sql.unsafe(`select count(*)::int as count from vibies_private.${table}`);
        assert.equal(count, 0, `refusing to reset a local database containing ${table} rows`);
      }
    }
  });

  cleanProject = await makeProject("clean", migrationFiles);
  supabase(["db", "reset", "--local", "--workdir", cleanProject]);
  await usingDatabase(async (sql) => {
    assert.deepEqual(await history(sql), migrations);
    await checkBoundaries(sql);
  });
  const noOp = supabase(["db", "push", "--local", "--yes", "--workdir", cleanProject]);
  assert.match(noOp, /Local database is up to date\./);
  await usingDatabase(async (sql) => assert.deepEqual(await history(sql), migrations));

  // The first automatic deployment upgrades main from before Personal Projects.
  legacyProject = await makeProject("legacy", [migrationFiles[0]]);
  supabase(["db", "reset", "--local", "--workdir", legacyProject]);
  const legacy = spawnSync("git", ["show",
    "39fda5a9f38c40aba8cbd4e7a7bf935eef24cb31:supabase/access.sql"],
  { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.equal(legacy.status, 0, "the pre-Personal-Projects migration fixture must exist in Git history");
  const legacyBefore = await usingDatabase(async (sql) => {
    await sql.unsafe(legacy.stdout);
    await sql`insert into vibies_private.accounts
      (github_id, github_username, nickname, status, onboarding_completed)
      values ('300', 'synthetic-legacy', 'Returning', 'approved', true)`;
    await sql`insert into vibies_private.sessions (session_hash, github_id)
      values (${"b".repeat(64)}, '300')`;
    return {
      account: (await sql`select to_jsonb(a) as row from vibies_private.accounts a where github_id = '300'`)[0].row,
      session: await sql`select to_jsonb(s) as row from vibies_private.sessions s where github_id = '300'`,
    };
  });
  for (const name of migrationFiles.slice(1)) {
    await copyFile(join(migrationDirectory, name), join(legacyProject, "supabase", "migrations", name));
  }
  supabase(["db", "push", "--local", "--yes", "--workdir", legacyProject]);
  await usingDatabase(async (sql) => {
    const [account] = await sql`select to_jsonb(a) as row from vibies_private.accounts a where github_id = '300'`;
    assert.match(account.row.internal_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    delete account.row.internal_id;
    assert.deepEqual(account.row, legacyBefore.account);
    assert.deepEqual(await sql`select to_jsonb(s) as row from vibies_private.sessions s where github_id = '300'`, legacyBefore.session);
    assert.deepEqual(await history(sql), migrations);
    await checkBoundaries(sql);
  });

  // Upgrade the exact deployed seven-place schema through the native runner.
  capacityProject = await makeProject("capacity", deployedMigrations);
  supabase(["db", "reset", "--local", "--workdir", capacityProject]);
  const instructorSession = "c".repeat(64);
  await usingDatabase(async (sql) => {
    assert.deepEqual(await history(sql), deployedMigrations.map((name) => name.slice(0, 14)));
    await sql`select vibies_private.designate_instructor('100', 'Mentor', 'Synthetic capacity upgrade')`;
    await sql`insert into vibies_private.accounts
      (internal_id, github_id, github_username, nickname, status, onboarding_completed)
      values ('11111111-1111-4111-8111-111111111111', '200', 'synthetic-200',
        'Member 200', 'approved', true)`;
    for (let id = 201; id <= 206; id += 1) {
      await sql`insert into vibies_private.accounts
        (github_id, github_username, nickname, status)
        values (${String(id)}, ${`synthetic-${id}`}, ${`Member ${id}`}, 'approved')`;
    }
    await sql`insert into vibies_private.accounts (github_id, github_username)
      values ('207', 'synthetic-207'), ('208', 'synthetic-208')`;
    await sql`insert into vibies_private.sessions (session_hash, github_id)
      values (${"a".repeat(64)}, '200'), (${instructorSession}, '100')`;
    await sql`insert into vibies_private.personal_projects
      (id, owner_account_id, repository_id, title, summary, demo_url, publication)
      values ('22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', '9001', 'Retained project',
        'Synthetic capacity upgrade proof.', 'https://example.test/demo', 'Published')`;
    await sql`update public.demo_projects set title = 'Retained demo',
      summary = 'Synthetic capacity upgrade row.' where id = 1`;
    const [{ value }] = await sql`select vibies_private.change_member(
      ${instructorSession}, '207', 'approve', 'Member 207'
    ) as value`;
    assert.deepEqual(value, { kind: "full" });
    await checkBoundaries(sql, 17);
  });
  const capacityBefore = await usingDatabase(capacityRows);
  await copyFile(join(migrationDirectory, capacityMigration),
    join(capacityProject, "supabase", "migrations", capacityMigration));
  supabase(["db", "push", "--local", "--yes", "--workdir", capacityProject]);
  await usingDatabase(async (sql) => {
    assert.deepEqual(await history(sql), [...deployedMigrations, capacityMigration]
      .map((name) => name.slice(0, 14)));
    assert.deepEqual(await capacityRows(sql), capacityBefore);
    await checkBoundaries(sql, 17);
    const [{ value: eighth }] = await sql`select vibies_private.change_member(
      ${instructorSession}, '207', 'approve', 'Member 207'
    ) as value`;
    const [{ value: ninth }] = await sql`select vibies_private.change_member(
      ${instructorSession}, '208', 'approve', 'Member 208'
    ) as value`;
    assert.deepEqual(eighth, { kind: "ok" });
    assert.deepEqual(ninth, { kind: "full" });
    const [{ active_count, instructor_accounts }] = await sql`
      select
        count(*) filter (where status = 'approved')::int as active_count,
        count(*) filter (where github_id = '100')::int as instructor_accounts
      from vibies_private.accounts
    `;
    assert.deepEqual({ active_count, instructor_accounts }, { active_count: 8, instructor_accounts: 0 });
  });
  const capacityBeforeRoadmap = await usingDatabase(capacityRows);
  await copyFile(join(migrationDirectory, roadmapMigration),
    join(capacityProject, "supabase", "migrations", roadmapMigration));
  supabase(["db", "push", "--local", "--yes", "--workdir", capacityProject]);
  await usingDatabase(async (sql) => {
    assert.deepEqual(await history(sql), [...deployedMigrations, capacityMigration, roadmapMigration]
      .map((name) => name.slice(0, 14)));
    assert.deepEqual(await capacityRows(sql), capacityBeforeRoadmap);
    const [{ milestone_table }] = await sql`
      select to_regclass('vibies_private.project_milestones') is not null as milestone_table
    `;
    assert.equal(milestone_table, true);
    await checkBoundaries(sql);
  });

  upgradeProject = await makeProject("upgrade", [migrationFiles[0]]);
  supabase(["db", "reset", "--local", "--workdir", upgradeProject]);
  await usingDatabase(async (sql) => {
    await sql.unsafe(await readFile(join(root, "supabase", "demo-projects.sql"), "utf8"));
    await sql.unsafe(await readFile(join(root, "supabase", "access.sql"), "utf8"));
    await sql`insert into vibies_private.accounts
      (internal_id, github_id, github_username, nickname, status, onboarding_completed)
      values ('11111111-1111-4111-8111-111111111111', '200', 'synthetic-member',
        'Member One', 'approved', true)`;
    await sql`insert into vibies_private.sessions (session_hash, github_id)
      values (${"a".repeat(64)}, '200')`;
    await sql`insert into vibies_private.personal_projects
      (id, owner_account_id, repository_id, title, summary, demo_url, publication)
      values ('22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', '9001', 'Retained project',
        'Synthetic upgrade proof.', 'https://example.test/demo', 'Published')`;
    await sql`update public.demo_projects set title = 'Retained demo',
      summary = 'Synthetic upgrade row.' where id = 1`;
    await sql`update vibies_private.community set instructor_github_id = '100',
      instructor_nickname = 'Mentor' where singleton`;
    await sql`insert into vibies_private.instructor_audit
      (previous_github_id, new_github_id, reason) values (null, '100', 'Synthetic setup')`;
  });
  const before = await usingDatabase(retainedRows);
  for (const name of migrationFiles.slice(1)) {
    await copyFile(join(migrationDirectory, name),
      join(upgradeProject, "supabase", "migrations", name));
  }
  supabase(["db", "push", "--local", "--yes", "--workdir", upgradeProject]);
  await usingDatabase(async (sql) => {
    assert.deepEqual(await history(sql), migrations);
    assert.deepEqual(await retainedRows(sql), before);
    await checkBoundaries(sql);
  });

  const retryVersion = String(BigInt(migrations.at(-1)) + 1n);
  const retryFile = join(upgradeProject, "supabase", "migrations", `${retryVersion}_failure_rehearsal.sql`);
  await writeFile(retryFile, "create table public.vibies_migration_rehearsal (id bigint);\nselect 1 / 0;\n");
  supabase(["db", "push", "--local", "--yes", "--workdir", upgradeProject], true);
  await usingDatabase(async (sql) => {
    assert.equal((await sql`select to_regclass('public.vibies_migration_rehearsal') as table_name`)[0].table_name, null);
    assert.equal((await history(sql)).filter((version) => version === retryVersion).length, 0);
  });
  await writeFile(retryFile, "create table public.vibies_migration_rehearsal (id bigint);\ndrop table public.vibies_migration_rehearsal;\n");
  supabase(["db", "push", "--local", "--yes", "--workdir", upgradeProject]);
  await usingDatabase(async (sql) => {
    assert.equal((await history(sql)).filter((version) => version === retryVersion).length, 1);
    assert.equal((await sql`select to_regclass('public.vibies_migration_rehearsal') as table_name`)[0].table_name, null);
  });
  supabase(["db", "reset", "--local", "--workdir", cleanProject]);
  console.log("Database migration proof passed: clean chain, no-op, legacy and capacity upgrades, retained adoption, grants, rollback, and retry.");
} finally {
  await Promise.all([cleanProject, legacyProject, capacityProject, upgradeProject].filter(Boolean)
    .map((project) => rm(project, { recursive: true, force: true })));
}
