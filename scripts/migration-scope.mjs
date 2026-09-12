#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const safeFiles = new Set([
  "app/layout.tsx",
  "app/page.tsx",
  "app/wiki/copy-command.tsx",
  "app/wiki/page.tsx",
  "lib/wiki.ts",
  "tests/wiki.test.ts",
]);
const alwaysFullPaths = [
  "supabase/",
  ".github/workflows/",
  "scripts/",
];

function safePath(path) {
  if (safeFiles.has(path)) return true;
  if (alwaysFullPaths.some((prefix) => path.startsWith(prefix))) return false;
  return path.endsWith(".md")
    || path.endsWith(".css");
}

export function fullMigrationRequired(nameStatus) {
  try {
    const fields = new TextDecoder("utf-8", { fatal: true }).decode(nameStatus).split("\0");
    if (fields.pop() !== "" || fields.length === 0) return true;

    for (let index = 0; index < fields.length;) {
      const status = fields[index++];
      const rename = /^[RC](?:100|\d{1,2})$/.test(status);
      if (!rename && !/^[ADM]$/.test(status)) return true;
      const paths = fields.slice(index, index += rename ? 2 : 1);
      if (paths.length !== (rename ? 2 : 1) || paths.some((path) => !path || !safePath(path))) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function main() {
  let full = true;

  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    try {
      const base = process.env.MIGRATION_BASE;
      const head = process.env.MIGRATION_HEAD;
      if (!/^[0-9a-f]{40}$/i.test(base ?? "") || !/^[0-9a-f]{40}$/i.test(head ?? "")) {
        throw new Error("missing pull request commit SHA");
      }
      const changes = execFileSync("git", [
        "diff", "--name-status", "--find-renames", "-z", `${base}...${head}`, "--",
      ], { encoding: null, stdio: ["ignore", "pipe", "pipe"] });
      full = fullMigrationRequired(changes);
    } catch (error) {
      console.error(`Migration scope could not be classified: ${error.message}`);
    }
  }

  console.log(full ? "Full migration proof required." : "Fast migration checks are sufficient.");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${full}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
