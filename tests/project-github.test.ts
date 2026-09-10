import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { verifyRepository } from "../lib/project-github.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  appId: "42",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const member = { githubId: "200", username: "builder-200" };

const installation = (overrides: Record<string, unknown> = {}) => ({
  id: 700,
  account: { id: 200, type: "User" },
  target_type: "User",
  repository_selection: "selected",
  suspended_at: null,
  permissions: { metadata: "read" },
  ...overrides,
});
const repository = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `project-${id}`,
  private: true,
  owner: { id: 200, type: "User" },
  ...overrides,
});
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers });

function provider(options: {
  direct?: Response | (() => Response);
  installations?: (page: number) => Response;
  repositories?: (page: number) => Response;
  calls?: string[];
} = {}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    options.calls?.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("X-GitHub-Api-Version"), "2026-03-10");
    if (url.pathname === `/users/${member.username}/installation`) {
      return typeof options.direct === "function" ? options.direct() :
        options.direct ?? json(installation());
    }
    if (url.pathname === "/app/installations") {
      return options.installations?.(Number(url.searchParams.get("page"))) ?? json([]);
    }
    if (url.pathname === "/app/installations/700/access_tokens") {
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { permissions: { metadata: "read" } });
      return json({ token: "synthetic-installation-token", permissions: { metadata: "read" } }, 201);
    }
    if (url.pathname === "/installation/repositories") {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-installation-token");
      return options.repositories?.(Number(url.searchParams.get("page"))) ??
        json({ total_count: 1, repositories: [repository(900)] });
    }
    throw new Error(`Unexpected synthetic route: ${url.pathname}`);
  };
}

test("a direct stable account match lists only eligible personal private repositories", async () => {
  const calls: string[] = [];
  const result = await verifyRepository(config, member, undefined, provider({
    calls,
    repositories: () => json({ total_count: 4, repositories: [
      repository(901),
      repository(902, { private: false }),
      repository(903, { owner: { id: 999, type: "User" } }),
      repository(904, { owner: { id: 200, type: "Organization" } }),
    ] }),
  }));
  assert.deepEqual(result, { kind: "verified", repositories: [{ id: "901", name: "project-901" }] });
  assert.equal(calls.some(call => call.startsWith("GET /app/installations?")), false);
});

test("selected verification returns only the decision and uses the stable repository ID", async () => {
  assert.deepEqual(await verifyRepository(config, member, "900", provider()), { kind: "verified" });
});

test("a missing or mismatched username lookup falls back to the bounded installation scan", async () => {
  for (const direct of [new Response(null, { status: 404 }), json(installation({
    id: 701, account: { id: 201, type: "User" },
  }))]) {
    const calls: string[] = [];
    const unrelated = Array.from({ length: 100 }, (_, index) => installation({
      id: 1_000 + index, account: { id: 1_000 + index, type: "User" },
    }));
    const result = await verifyRepository(config, member, "900", provider({
      direct,
      calls,
      installations: page => page === 1
        ? json(unrelated, 200, { Link: `<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"` })
        : json([installation()]),
    }));
    assert.deepEqual(result, { kind: "verified" });
    assert.ok(calls.includes("GET /app/installations?per_page=100&page=2"));
  }
});

test("only a complete installation scan confirms that access is absent", async () => {
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    direct: new Response(null, { status: 404 }),
    installations: () => json([]),
  })), { kind: "lost" });
});

test("a positive direct lookup ignores any number of unrelated installations", async () => {
  const calls: string[] = [];
  assert.deepEqual(await verifyRepository(config, member, "900", provider({ calls })), { kind: "verified" });
  assert.equal(calls.some(call => call.includes("/app/installations?")), false);
});

test("ineligible installations are confirmed lost before a token is requested", async () => {
  const variants = [
    { repository_selection: "all" },
    { suspended_at: "2026-09-10T00:00:00Z" },
    { account: { id: 200, type: "Organization" }, target_type: "Organization" },
  ];
  for (const value of variants) {
    const calls: string[] = [];
    assert.deepEqual(await verifyRepository(config, member, "900", provider({
      direct: json(installation(value)), calls,
    })), { kind: "lost" });
    assert.equal(calls.some(call => call.includes("access_tokens")), false);
  }
});

test("public, organization-owned, wrong-owner, and absent selected repositories are lost", async () => {
  const variants = [
    [repository(900, { private: false })],
    [repository(900, { owner: { id: 200, type: "Organization" } })],
    [repository(900, { owner: { id: 999, type: "User" } })],
    [repository(901)],
  ];
  for (const repositories of variants) {
    assert.deepEqual(await verifyRepository(config, member, "900", provider({
      repositories: () => json({ total_count: repositories.length, repositories }),
    })), { kind: "lost" });
  }
});

test("selected repositories on later pages verify without exposing the picker list", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => repository(1_000 + index));
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    repositories: page => json({
      total_count: 101,
      repositories: page === 1 ? firstPage : [repository(900)],
    }),
  })), { kind: "verified" });
});

test("incomplete installation and repository scans are unknown", async () => {
  const unrelated = Array.from({ length: 100 }, (_, index) => installation({
    id: 1_000 + index, account: { id: 1_000 + index, type: "User" },
  }));
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    direct: new Response(null, { status: 404 }),
    installations: page => json(unrelated, 200, {
      Link: `<https://api.github.com/app/installations?per_page=100&page=${page + 1}>; rel="next"`,
    }),
  })), { kind: "unknown" });

  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    repositories: page => json({ total_count: 1_001, repositories:
      Array.from({ length: 100 }, (_, index) => repository(page * 1_000 + index)) }),
  })), { kind: "unknown" });
});

test("a repeated installation across pages cannot prove absence", async () => {
  const repeated = installation({ id: 701, account: { id: 201, type: "User" } });
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    direct: new Response(null, { status: 404 }),
    installations: page => page === 1
      ? json([repeated], 200, {
          Link: `<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"`,
        })
      : json([repeated]),
  })), { kind: "unknown" });
});

test("malformed pagination, configuration, provider, and contradictory counts are unknown", async () => {
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    direct: new Response(null, { status: 404 }),
    installations: () => json([installation({ account: { id: 201, type: "User" } })],
      200, { Link: "untrusted pagination" }),
  })), { kind: "unknown" });
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    direct: json(installation({ permissions: { metadata: "read", contents: "read" } })),
  })), { kind: "unknown" });
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    repositories: () => json({ total_count: 0, repositories: [repository(900)] }),
  })), { kind: "unknown" });
  assert.deepEqual(await verifyRepository(config, member, "900", provider({
    repositories: () => new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }),
  })), { kind: "unknown" });

  for (const direct of [
    new Response(null, { status: 401 }),
    new Response(null, { status: 403 }),
    new Response(null, { status: 429 }),
    json({ account: { id: 200 } }),
  ]) {
    assert.deepEqual(await verifyRepository(config, member, "900", provider({ direct })), { kind: "unknown" });
  }
  assert.deepEqual(await verifyRepository(config, member, "900", async () => {
    throw new Error("synthetic provider failure");
  }), { kind: "unknown" });
  assert.deepEqual(await verifyRepository({ ...config, privateKey: "invalid" }, member, "900", provider()),
    { kind: "unknown" });
  assert.deepEqual(await verifyRepository(config, member, "bad-id", provider()), { kind: "unknown" });
});

test("the App JWT uses RS256 and bounded claims without leaking the key", async () => {
  let authorization = "";
  const fetcher = provider({ direct: () => {
    throw new Error("unreachable");
  } });
  await verifyRepository(config, member, "900", async (input, init) => {
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return fetcher(input, init);
  });
  const [header, payload, signature] = authorization.replace("Bearer ", "").split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.iss, config.appId);
  assert.equal(claims.exp - claims.iat, 600);
  assert.ok(signature.length > 100);
  assert.equal(authorization.includes(config.privateKey.slice(0, 20)), false);
});
