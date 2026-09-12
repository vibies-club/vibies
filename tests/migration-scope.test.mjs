import assert from "node:assert/strict";
import { test } from "node:test";
import { fullMigrationRequired } from "../scripts/migration-scope.mjs";

const diff = (...fields) => Buffer.from(`${fields.join("\0")}\0`);

test("migration scope skips only known database-independent changes", () => {
  for (const changes of [
    diff("M", "README.md", "A", "docs/STAGING.md"),
    diff("M", "app/globals.css", "A", "app/projects/projects.css", "A", "app/wiki/page.tsx", "A", "lib/wiki.ts", "A", "tests/wiki.test.ts"),
    diff("M", "app/layout.tsx", "M", "app/page.tsx"),
    diff("R100", "docs/OLD.md", "docs/NEW.md", "D", "app/wiki/page.tsx"),
  ]) assert.equal(fullMigrationRequired(changes), false);

  for (const changes of [
    diff("M", "supabase/migrations/20260913000000_example.sql"),
    diff("M", "scripts/check-database-migrations.mjs"),
    diff("M", "package-lock.json"),
    diff("M", "package.json"),
    diff("M", ".nvmrc"),
    diff("M", ".github/workflows/app.yml"),
    diff("M", "next.config.ts"),
    diff("A", "app/wiki/route.ts"),
    diff("A", "scripts/guide.md"),
    diff("A", "docs/example.sql"),
    diff("D", "lib/access.ts"),
    diff("R100", "docs/SCHEMA.md", "supabase/SCHEMA.md"),
    diff("A", "public/logo.svg"),
    diff("T", "README.md"),
    diff("R", "docs/OLD.md", "docs/NEW.md"),
    diff("Q", "docs/invalid.md"),
    Buffer.from("M\0README.md"),
    Buffer.alloc(0),
  ]) assert.equal(fullMigrationRequired(changes), true);
});
