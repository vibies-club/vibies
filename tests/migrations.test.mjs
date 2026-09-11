import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repository = fileURLToPath(new URL("..", import.meta.url));
const checker = join(repository, "scripts/check-migrations.mjs");

test("migration snapshots and committed history stay immutable", () => {
  const fixture = mkdtempSync(join(tmpdir(), "vibies-migrations-"));
  let base;
  const run = () => spawnSync(process.execPath, [checker, "--base", base], { cwd: fixture, encoding: "utf8" });

  try {
    mkdirSync(join(fixture, "supabase", "migrations"), { recursive: true });
    cpSync(join(repository, "supabase", "access.sql"), join(fixture, "supabase", "access.sql"));
    cpSync(join(repository, "supabase", "demo-projects.sql"), join(fixture, "supabase", "demo-projects.sql"));
    execFileSync("git", ["init", "--quiet"], { cwd: fixture });
    execFileSync("git", ["add", "supabase"], { cwd: fixture });
    execFileSync("git", ["-c", "user.name=Vibies Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture"], { cwd: fixture });
    base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture, encoding: "utf8" }).trim();
    cpSync(join(repository, "supabase", "migrations"), join(fixture, "supabase", "migrations"), { recursive: true });

    const missingBase = spawnSync(process.execPath, [checker], { cwd: fixture, encoding: "utf8", env: { CI: "true" } });
    assert.match(missingBase.stderr, /CI requires --base SHA or MIGRATION_BASE_SHA/);

    const success = run();
    assert.equal(success.status, 0, success.stderr);

    const earlyMigration = join(fixture, "supabase", "migrations", "20260910000000_access.sql");
    writeFileSync(earlyMigration, "select 1;\n");
    assert.match(run().stderr, /must be later than 20260910065142/);
    unlinkSync(earlyMigration);

    execFileSync("git", ["add", "supabase/migrations"], { cwd: fixture });
    execFileSync("git", ["-c", "user.name=Vibies Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "migrations"], { cwd: fixture });
    base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture, encoding: "utf8" }).trim();
    assert.equal(run().status, 0);

    const baselineMigration = join(fixture, "supabase", "migrations", "20260910065142_remote_schema.sql");
    const originalBaseline = readFileSync(baselineMigration);
    writeFileSync(baselineMigration, Buffer.concat([originalBaseline, Buffer.from("\n")]));
    assert.match(run().stderr, /baseline migration changed/);
    writeFileSync(baselineMigration, originalBaseline);

    const demoMigration = join(fixture, "supabase", "migrations", "20260910220000_demo_projects.sql");
    const originalDemo = readFileSync(demoMigration);
    writeFileSync(demoMigration, Buffer.concat([originalDemo, Buffer.from("\n")]));
    assert.match(run().stderr, /committed migration changed/);
    writeFileSync(demoMigration, originalDemo);

    const accessMigration = join(fixture, "supabase", "migrations", "20260910220001_access.sql");
    unlinkSync(accessMigration);
    assert.match(run().stderr, /committed migration was removed or renamed/);
    cpSync(join(repository, "supabase", "migrations", "20260910220001_access.sql"), accessMigration);

    const duplicateMigration = join(fixture, "supabase", "migrations", "20260910220001_demo_projects.sql");
    writeFileSync(duplicateMigration, "select 1;\n");
    assert.match(run().stderr, /duplicate migration version: 20260910220001/);
    unlinkSync(duplicateMigration);

    const unsupportedMigration = join(fixture, "supabase", "migrations", "20260910230000_other.sql");
    writeFileSync(unsupportedMigration, "select 1;\n");
    assert.match(run().stderr, /migration has no canonical SQL source/);
    unlinkSync(unsupportedMigration);

    const accessSource = join(fixture, "supabase", "access.sql");
    const originalAccessSource = readFileSync(accessSource);
    const nextAccessMigration = join(fixture, "supabase", "migrations", "20260910230000_access.sql");
    writeFileSync(nextAccessMigration, originalAccessSource.subarray("begin;\n".length, -"commit;\n".length));
    const nextSnapshot = run();
    assert.equal(nextSnapshot.status, 0, nextSnapshot.stderr);

    writeFileSync(accessSource, Buffer.concat([
      originalAccessSource.subarray(0, -"commit;\n".length),
      Buffer.from("\ncommit;\n"),
    ]));
    assert.match(run().stderr, /latest access migration does not match/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
