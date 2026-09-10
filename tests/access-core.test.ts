import assert from "node:assert/strict";
import { test } from "node:test";
import { appOrigin, authorizationURL, challenge, digest, exchangeGitHub, githubAccount, nickname, readAccess, sameOriginPost, token, validToken } from "../lib/access-core.ts";

const config = { origin: "https://example.test", clientId: "synthetic-client", clientSecret: "synthetic-test-value" };

test("unknown access results fail closed and extra identity fields never escape", () => {
  for (const value of [null, {}, {kind:"admin"}, {kind:"member"}, {kind:"member",nickname:"Builder"}]) assert.deepEqual(readAccess(value), {kind:"error"});
  assert.deepEqual(readAccess({kind:"member",nickname:"Builder",onboardingComplete:false,email:"discard"}), {kind:"member",nickname:"Builder",onboardingComplete:false});
  assert.deepEqual(readAccess({kind:"denied",nickname:"discard"}), {kind:"denied"});
});

test("opaque session values, PKCE, and fixed redirect origin", () => {
  const a = token();
  assert.ok(validToken(a));
  assert.notEqual(a, token());
  assert.equal(digest(a).length, 64);
  assert.notEqual(digest(a), a);
  assert.equal(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const url = authorizationURL(config, a, a);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("scope"), "");
  assert.equal(url.searchParams.get("state"), a);
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/auth/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  for (const invalid of [undefined, "http://example.test", "https://example.test/elsewhere", "https://user:pass@example.test", "https://example.test?next=evil"]) {
    assert.throws(() => appOrigin(invalid));
  }
  assert.equal(appOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
});

test("mutations require a same-origin form POST", () => {
  const request = (method: string, origin: string, type = "application/x-www-form-urlencoded") => new Request(config.origin, { method, headers: { origin, "content-type": type } });
  assert.ok(sameOriginPost(request("POST", config.origin), config.origin));
  assert.equal(sameOriginPost(request("GET", config.origin), config.origin), false);
  assert.equal(sameOriginPost(request("POST", "https://other.test"), config.origin), false);
  assert.equal(sameOriginPost(request("POST", "null"), config.origin), false);
  assert.equal(sameOriginPost(request("POST", config.origin, "text/plain"), config.origin), false);
});

test("nickname validation counts Unicode code points and trims only outer spaces", () => {
  assert.equal(nickname("  Builder_7-Blue  "), "Builder_7-Blue");
  assert.equal(nickname("سازنده"), "سازنده");
  assert.equal(nickname("Éclair"), "Éclair");
  assert.equal(nickname("NⅧ"), "NⅧ");
  assert.equal(nickname("a".repeat(30)), "a".repeat(30));
  for (const value of [null, "a", "a".repeat(31), "  ", "hi@example.test", "a\nb", "a\tb", "🙂🙂", "<script>", "N²", "N½"]) assert.equal(nickname(value), null);
});

test("GitHub account projection drops profile fields and uses stable ID", () => {
  assert.deepEqual(githubAccount({ id: 42, login: "builder-42", name: "private", email: "private", avatar_url: "private", bio: "private" }), { githubId: "42", username: "builder-42" });
  assert.equal(githubAccount({id:42, login:"renamed"}).githubId, "42");
  for (const value of [null, {}, {id: "42", login: "builder"}, {id: -1, login:"builder"}, {id: Number.MAX_SAFE_INTEGER + 1, login:"builder"}, {id:42, login:"<script>"}]) assert.throws(() => githubAccount(value));
});

test("OAuth exchanges PKCE and imports only ID/login, without profile or token persistence", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (input, init) => {
    requests++;
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (requests === 1) {
      assert.equal(String(input), "https://github.com/login/oauth/access_token");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("code_verifier"), "verifier");
      assert.equal(body.get("redirect_uri"), `${config.origin}/auth/callback`);
      return Response.json({ access_token: "synthetic-token", token_type: "bearer", scope: "" });
    }
    assert.equal(String(input), "https://api.github.com/user");
    return Response.json({ id: 42, login: "builder", name: "discard", email: "discard", avatar_url: "discard" });
  };
  assert.deepEqual(await exchangeGitHub(config, "code", "verifier", fetcher), { githubId: "42", username: "builder" });
  assert.equal(requests, 2);
});

test("GitHub HTTP-200 errors, invalid tokens, extra scopes and network failure grant no identity", async () => {
  for (const result of [{error:"bad_verification_code"}, {access_token:"", token_type:"bearer"}, {access_token:"synthetic",token_type:"other"}, {access_token:"synthetic",token_type:"bearer",scope:"repo"}]) {
    let calls = 0;
    await assert.rejects(exchangeGitHub(config, "code", "verifier", async () => { calls++; return Response.json(result); }));
    assert.equal(calls, 1);
  }
  await assert.rejects(exchangeGitHub(config, "code", "verifier", async () => { throw new Error("private network detail"); }));
  await assert.rejects(exchangeGitHub(config, "code", "verifier", async () => new Response("", {status:500})));
});
