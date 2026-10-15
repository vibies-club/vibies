import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { artifactFiles } from "./staging-cloudflare.mjs";

export function packArtifact({ source, destination, sha }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("invalid source SHA");
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
  if (actual !== sha) throw new Error("build checkout does not match selected SHA");
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", "."], { cwd: source, stdio: "ignore" });
  mkdirSync(destination, { recursive: false });
  for (const name of ["server", "client"])
    cpSync(join(source, "dist", name), join(destination, name), { recursive: true,
      filter: path => !basename(path).startsWith(".env") && basename(path) !== ".git" && !path.endsWith(".map") && !path.endsWith("/wrangler.json") });
  mkdirSync(join(destination, "migrations"));
  for (const name of readdirSync(join(source, "d1/migrations"))) {
    if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error("invalid migration path");
    cpSync(join(source, "d1/migrations", name), join(destination, "migrations", name));
  }
  const files = artifactFiles(destination);
  const artifactHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  writeFileSync(join(destination, "manifest.json"), JSON.stringify({ format: 1, sha, files, artifactHash }));
  return artifactHash;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  packArtifact({ source: process.env.STAGING_SOURCE_DIRECTORY, destination: process.env.STAGING_ARTIFACT_DIRECTORY, sha: process.env.STAGING_SOURCE_SHA });
}
