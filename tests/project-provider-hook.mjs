import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

const database = new URL(process.env.VIBIES_DATABASE_URL ?? "http://missing");
const appOrigin = new URL(process.env.VIBIES_APP_ORIGIN ?? "http://missing");
const testOrigin = new URL(process.env.VIBIES_TEST_APP_ORIGIN ?? "http://missing");
assert.equal(process.env.NODE_ENV, "production", "The project provider hook is for the built test server only");
assert.equal(database.protocol, "postgresql:");
assert.equal(database.username, "vibies_web_test");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/vibies_access_web_test");
assert.equal(appOrigin.origin, testOrigin.origin);
assert.equal(appOrigin.protocol, "http:");
assert.equal(appOrigin.hostname, "127.0.0.1");
assert.equal(appOrigin.pathname, "/");
assert.equal(appOrigin.username + appOrigin.password + appOrigin.search + appOrigin.hash, "");
assert.equal(testOrigin.pathname, "/");
assert.equal(testOrigin.username + testOrigin.password + testOrigin.search + testOrigin.hash, "");

const nativeFetch = globalThis.fetch;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.VIBIES_GITHUB_APP_ID = "17001";
process.env.VIBIES_GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.VIBIES_GITHUB_APP_SLUG = "synthetic-vibies-test";

const installation = {
  id: 17100,
  account: { id: 92001, type: "User", private_provider_field: "must-stay-server-side" },
  target_type: "User",
  repository_selection: "selected",
  suspended_at: null,
  permissions: { metadata: "read" },
  private_provider_field: "must-stay-server-side",
};
const repositories = [17101, 17102, 17103, 17104, 17105, 17106].map(id => ({
  id, name: `synthetic-project-${id}`, private: true,
  owner: { id: 92001, type: "User" }, private_provider_field: "must-stay-server-side",
}));
repositories.push(
  { id: 17901, name: "synthetic-public", private: false, owner: { id: 92001, type: "User" }, private_provider_field: "must-stay-server-side" },
  { id: 17902, name: "synthetic-wrong-owner", private: true, owner: { id: 92999, type: "User" }, private_provider_field: "must-stay-server-side" },
  { id: 17903, name: "synthetic-organization", private: true, owner: { id: 92001, type: "Organization" }, private_provider_field: "must-stay-server-side" },
);

const json = (value, status = 200, headers) => Response.json(value, { status, headers });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://api.github.com") return nativeFetch(input, init);

  const method = init.method ?? (input instanceof Request ? input.method : "GET");
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.ok(init.signal);
  assert.equal(headers.get("accept"), "application/vnd.github+json");
  assert.equal(headers.get("x-github-api-version"), "2026-03-10");
  assert.match(headers.get("authorization") ?? "", /^Bearer [A-Za-z0-9._-]+$/);

  const direct = url.pathname.match(/^\/users\/([^/]+)\/installation$/);
  if (method === "GET" && direct && url.search === "") {
    const username = decodeURIComponent(direct[1]);
    if (username === "synthetic-member") return json(installation);
    if (username === "synthetic-member-lost") return new Response(null, { status: 404 });
    if (username === "synthetic-member-unknown") return new Response(null, { status: 503 });
    if (username === "synthetic-member-suspended") {
      return json({ ...installation, suspended_at: "2026-09-10T00:00:00Z" });
    }
    if (username === "synthetic-member-all") {
      return json({ ...installation, repository_selection: "all" });
    }
    return json({ ...installation, account: { ...installation.account, id: 92999 } });
  }

  if (method === "GET" && url.pathname === "/app/installations" &&
      url.search === "?per_page=100&page=1") return json([]);

  if (method === "POST" && url.pathname === "/app/installations/17100/access_tokens" && url.search === "") {
    assert.equal(headers.get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(init.body)), { permissions: { metadata: "read" } });
    return json({ token: "synthetic-installation-token", permissions: { metadata: "read" } }, 201);
  }

  if (method === "GET" && url.pathname === "/installation/repositories" &&
      url.search === "?per_page=100&page=1") {
    assert.equal(headers.get("authorization"), "Bearer synthetic-installation-token");
    return json({ total_count: repositories.length, repositories,
      private_provider_field: "must-stay-server-side" });
  }

  throw new Error(`Unexpected GitHub API request in project proof: ${method} ${url.pathname}${url.search}`);
};
