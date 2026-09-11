#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const migrationDirectory = "supabase/migrations";
const baseline = "20260910065142_remote_schema.sql";
const baselineSha256 = "85873b79e9f68d6a39bf487807c1e577ffab89040e7cfcdcfaa6598c22ed88d1";
const snapshots = [
  ["supabase/demo-projects.sql", "demo_projects"],
  ["supabase/access.sql", "access"],
];

function git(...args) {
  return execFileSync("git", args, { encoding: null, stdio: ["ignore", "pipe", "pipe"] });
}

function migrationFiles() {
  const seen = new Set();

  return readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith(".sql"))
    .map((entry) => {
      if (!entry.isFile()) throw new Error(`migration must be a regular file: ${entry.name}`);
      const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(entry.name);
      if (!match) throw new Error(`invalid migration filename: ${entry.name}`);
      if (seen.has(match[1])) throw new Error(`duplicate migration version: ${match[1]}`);
      seen.add(match[1]);
      if (entry.name !== baseline && !snapshots.some(([, name]) => entry.name.endsWith(`_${name}.sql`))) {
        throw new Error(`migration has no canonical SQL source: ${entry.name}`);
      }
      return { name: entry.name, version: match[1], content: readFileSync(join(migrationDirectory, entry.name)) };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

function snapshot(sourcePath) {
  const source = readFileSync(sourcePath);
  const begin = Buffer.from("begin;\n");
  const commit = Buffer.from("commit;\n");
  if (!source.subarray(0, begin.length).equals(begin) || !source.subarray(-commit.length).equals(commit)) {
    throw new Error(`${sourcePath} must start with begin; and end with commit;`);
  }
  return source.subarray(begin.length, -commit.length);
}

function checkHistory(files, base) {
  if (!/^[0-9a-f]{7,40}$/i.test(base)) throw new Error("--base must be a Git commit SHA");
  git("cat-file", "-e", `${base}^{commit}`);

  const basePaths = git("ls-tree", "-r", "--name-only", base, "--", migrationDirectory)
    .toString("utf8")
    .trim()
    .split("\n")
    .filter((path) => path.endsWith(".sql"));
  const current = new Map(files.map((file) => [`${migrationDirectory}/${file.name}`, file]));

  for (const path of basePaths) {
    const file = current.get(path);
    if (!file) throw new Error(`committed migration was removed or renamed: ${path}`);
    if (!file.content.equals(git("show", `${base}:${path}`))) {
      throw new Error(`committed migration changed: ${path}`);
    }
  }

  const baseNames = new Set(basePaths.map((path) => basename(path)));
  const latestExistingVersion = [
    baseline.slice(0, 14),
    ...basePaths.map((path) => basename(path).slice(0, 14)),
  ].sort().at(-1);
  const earlier = files.find((file) =>
    file.name !== baseline && !baseNames.has(file.name) && file.version <= latestExistingVersion
  );
  if (earlier) throw new Error(`new migration ${earlier.name} must be later than ${latestExistingVersion}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--base")) {
    throw new Error("usage: node scripts/check-migrations.mjs [--base SHA]");
  }

  const files = migrationFiles();
  const baselineFile = files.find((file) => file.name === baseline);
  if (!baselineFile) throw new Error(`required baseline migration is missing: ${baseline}`);
  const digest = createHash("sha256").update(baselineFile.content).digest("hex");
  if (digest !== baselineSha256) throw new Error(`baseline migration changed: ${baseline}`);

  const base = args[1] ?? process.env.MIGRATION_BASE_SHA;
  if (base) checkHistory(files, base);
  else if (process.env.CI) throw new Error("CI requires --base SHA or MIGRATION_BASE_SHA");

  for (const [sourcePath, name] of snapshots) {
    const latest = files.filter((file) => file.name.endsWith(`_${name}.sql`)).at(-1);
    if (!latest) throw new Error(`no ${name} migration snapshot exists`);
    if (!latest.content.equals(snapshot(sourcePath))) {
      throw new Error(`latest ${name} migration does not match ${sourcePath}: ${latest.name}`);
    }
  }

  console.log(`Checked ${files.length} migration files${base ? ` against ${base}` : ""}.`);
}

try {
  main();
} catch (error) {
  console.error(`Migration check failed: ${error.message}`);
  process.exitCode = 1;
}
