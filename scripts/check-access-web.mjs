import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { checkProjectsWeb } from "./check-projects-web.mjs";

// This script uses synthetic accounts in a separate, disposable local database.
const address = new URL(process.env.VIBIES_TEST_DATABASE_URL ?? "http://missing");
const origin = new URL(process.env.VIBIES_TEST_APP_ORIGIN ?? "http://127.0.0.1:3105");
if (address.hostname !== "127.0.0.1" || address.pathname !== "/vibies_access_web_test" ||
    origin.hostname !== "127.0.0.1") throw new Error("Use the isolated loopback web-test database and app");
const sql = postgres(address.toString(), { max: 1, onnotice: () => {} });
const hash = value => createHash("sha256").update(value).digest("hex");
const sessions = { instructor: "a".repeat(64), member: "b".repeat(64), unapproved: "c".repeat(64), revoked: "d".repeat(64) };
const ids = { instructor: "91001", member: "92001", unapproved: "92002", revoked: "92003" };

try {
  if (process.argv.includes("--prepare")) {
    await sql.unsafe("drop schema if exists vibies_private cascade");
    await sql.unsafe(await readFile(new URL("../supabase/access.sql", import.meta.url), "utf8"));
    await sql`select vibies_private.designate_instructor(${ids.instructor}, 'Guide', 'Synthetic local exercise')`;
    for (const role of Object.keys(sessions)) await sql`select vibies_private.finish_sign_in(${ids[role]}, ${`synthetic-${role}`}, ${hash(sessions[role])}, null)`;
    await sql`select vibies_private.change_member(${hash(sessions.instructor)}, ${ids.member}, 'approve', 'Builder')`;
    await sql`select vibies_private.change_member(${hash(sessions.instructor)}, ${ids.revoked}, 'approve', 'Returning')`;
    await sql`select vibies_private.change_member(${hash(sessions.instructor)}, ${ids.revoked}, 'revoke', null)`;
    await sql.unsafe("do $$ begin if not exists(select 1 from pg_roles where rolname = 'vibies_web_test') then create role vibies_web_test login inherit; end if; end $$");
    await sql.unsafe("grant vibies_runtime to vibies_web_test");
    console.log("Synthetic web fixtures ready. No real accounts or credentials used.");
  } else {
    let checks = 0;
    const check = (condition, description) => { assert.ok(condition, description); checks++; console.log(`PASS ${description}`); };
    const get = (path, role) => fetch(new URL(path, origin), { redirect: "manual", headers: role ? {Cookie: `__Host-vibies-session=${sessions[role]}`} : {} });
    const post = (path, role, body, requestOrigin = origin.origin, extraCookie = "") => fetch(new URL(path, origin), {
      method: "POST", redirect: "manual", headers: { Origin: requestOrigin, "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${role ? `__Host-vibies-session=${sessions[role]};` : ""}${extraCookie}` }, body: new URLSearchParams(body),
    });
    const browser = "e".repeat(64);
    for (const [message, expected] of [["__proto__"], ["constructor"], ["toString"], ["unknown"],
      ["failed", "Sign-in did not finish. Please try again."]]) {
      const response = await fetch(new URL(`/sign-in?message=${encodeURIComponent(message)}`, origin), { redirect: "manual",
        headers: {Cookie: `__Host-vibies-browser=${browser}`} });
      const body = await response.text();
      check(response.status === 200 && (expected ? body.includes('role="status"') && body.includes(expected) : !body.includes('role="status"')),
        `sign-in ${expected ? "renders the known" : "ignores the unrecognized"} ${message} message`);
    }
    for (const [message, expected] of [["__proto__"], ["constructor"], ["toString"], ["unknown"], ["ok", "Access updated."]]) {
      const response = await get(`/admin/members?message=${encodeURIComponent(message)}`, "instructor");
      const body = await response.text();
      check(response.status === 200 && (expected ? body.includes('role="status"') && body.includes(expected) : !body.includes('role="status"')),
        `administration ${expected ? "renders the known" : "ignores the unrecognized"} ${message} message`);
    }
    for (const role of [undefined, "member", "unapproved", "revoked"]) {
      const response = await get("/admin/members", role);
      const body = await response.text();
      check(response.status === 307 && !body.includes("synthetic-"), `administration page denies ${role ?? "signed-out"}`);
      const action = await post("/admin/members/action", role, {action:"approve",githubId:ids.unapproved,nickname:"Sneaky"});
      check(action.status === 403, `direct administration action denies ${role ?? "signed-out"}`);
    }
    for (const [role, location] of [[undefined, "/sign-in?message=expired"], ["unapproved", "/access-denied"], ["revoked", "/access-denied"]]) {
      const response = await get("/wiki", role);
      check(response.status === 307 && response.headers.get("location") === location,
        `command wiki denies ${role ?? "signed-out"} exactly like welcome`);
    }
    const wiki = await get("/wiki", "member");
    const wikiText = await wiki.text();
    const instructorWiki = await get("/wiki", "instructor");
    check(wiki.status === 200 && instructorWiki.status === 200 && wikiText.includes("<h1>Command wiki</h1>"),
      "approved Member before onboarding and Instructor can read the command wiki");
    check(wiki.headers.get("cache-control")?.includes("no-store"), "command wiki response cannot be cached");
    check(/<form(?=[^>]*\baction="\/wiki")(?=[^>]*\bmethod="get")[^>]*>/.test(wikiText) &&
      /<input(?=[^>]*\bname="q")[^>]*>/.test(wikiText) && /<select(?=[^>]*\bname="topic")[^>]*>/.test(wikiText),
    "command wiki exposes a GET search form with query and topic controls");
    check(["git-status", "git-switch-feature", "tmux-split-pane", "npm-run-dev"].every(id =>
      wikiText.includes(`id="${id}"`) && wikiText.includes(`href="/wiki#${id}"`)) &&
      /<article[^>]*\bid="git-status"[^>]*>[\s\S]*?Copy command[\s\S]*?<\/article>/.test(wikiText),
    "command wiki exposes stable entry links and a labeled command copy control");
    const [onboarding] = await sql`select onboarding_completed from vibies_private.accounts where github_id = ${ids.member}`;
    check(onboarding.onboarding_completed === false, "command wiki proof starts with the Member before onboarding");
    await sql`update vibies_private.accounts set onboarding_completed = true where github_id = ${ids.member}`;
    try {
      const afterOnboarding = await get("/wiki", "member");
      check(afterOnboarding.status === 200, "approved Member can still read the command wiki after onboarding");
    } finally {
      await sql`update vibies_private.accounts set onboarding_completed = ${onboarding.onboarding_completed} where github_id = ${ids.member}`;
    }
    const searchedText = await (await get("/wiki?q=git%20status", "member")).text();
    check(searchedText.includes('id="git-status"') && !searchedText.includes('id="npm-run-dev"') &&
      searchedText.includes('href="/wiki"'), "command wiki search filters entries and offers Show all");
    const topicText = await (await get("/wiki?topic=Git", "member")).text();
    check(topicText.includes('id="git-status"') && topicText.includes('id="git-switch-feature"') &&
      !topicText.includes('id="tmux-split-pane"'), "command wiki filters by the exact Git topic");
    const combinedText = await (await get("/wiki?q=git%20status&topic=Git", "member")).text();
    check(combinedText.includes('id="git-status"') && !combinedText.includes('id="npm-run-dev"') &&
      !combinedText.includes('id="tmux-split-pane"'),
      "command wiki combines query and topic filters");
    const emptyText = await (await get("/wiki?q=missing-command&topic=Git", "member")).text();
    check(emptyText.includes("No commands found") && emptyText.includes('href="/wiki"'),
      "command wiki explains an empty result and offers a clear link");
    const repeatedText = await (await get("/wiki?q=git&q=status&topic=Git&topic=Terminal", "member")).text();
    check(["git-status", "git-switch-feature", "tmux-split-pane", "npm-run-dev"].every(id => repeatedText.includes(`id="${id}"`)),
      "repeated command wiki filters safely fall back to the full catalog");
    const trimmedText = await (await get("/wiki?q=%20git%20status%20", "member")).text();
    check(trimmedText.includes('value="git status"') && trimmedText.includes('id="git-status"') &&
      !trimmedText.includes('id="npm-run-dev"'), "command wiki trims its search query");
    const oversizedQuery = "x".repeat(201);
    const boundedText = await (await get(`/wiki?q=${oversizedQuery}`, "member")).text();
    check(boundedText.includes(`value="${"x".repeat(200)}"`) && !boundedText.includes(`value="${oversizedQuery}"`),
      "command wiki limits its search query to 200 characters");
    const markup = "<script>synthetic()</script>";
    const escapedText = await (await get(`/wiki?q=${encodeURIComponent(markup)}`, "member")).text();
    check(escapedText.includes("&lt;script&gt;synthetic()&lt;/script&gt;") && !escapedText.includes(markup),
      "command wiki renders search markup as text without injected HTML");
    const welcome = await get("/welcome", "member");
    const welcomeText = await welcome.text();
    check(welcome.status === 200 && welcomeText.includes("Builder") && welcomeText.includes('href="/wiki"') &&
      !welcomeText.includes("synthetic-member") && !welcomeText.includes(ids.member), "member welcome exposes nickname only and links to the command wiki");
    check(welcome.headers.get("cache-control")?.includes("no-store"), "private response cannot be cached");
    check(welcome.headers.get("referrer-policy") === "same-origin", "page policy preserves same-origin form POSTs and hides cross-origin referrers");
    check(welcomeText.includes("/auth/sign-out"), "welcome offers sign-out");
    check((await get("/welcome", "unapproved")).headers.get("location") === "/access-denied", "unapproved visitor cannot enter welcome");
    check((await get("/welcome", "revoked")).headers.get("location") === "/access-denied", "revoked session cannot enter welcome");
    const admin = await (await get("/admin/members", "instructor")).text();
    check(admin.includes("synthetic-member") && admin.includes(ids.member) && admin.includes("Automatic checks cannot detect every real name"), "Instructor view identifies accounts and explains privacy");
    check((await get("/demo")).status === 200, "demo stays public");
    check((await post("/admin/members/action", "instructor", {action:"revoke",githubId:ids.member,confirm:"yes"}, "https://other.test")).status === 403, "cross-origin mutation is denied");
    await post("/admin/members/action", "instructor", {action:"revoke",githubId:ids.member});
    check((await get("/welcome", "member")).status === 200, "revocation without confirmation changes nothing");
    await post("/admin/members/action", "instructor", {action:"revoke",githubId:ids.member,confirm:"yes"});
    check((await get("/welcome", "member")).headers.get("location") === "/access-denied", "confirmed revocation blocks the next request");
    check((await get("/wiki", "member")).headers.get("location") === "/access-denied", "confirmed revocation blocks the next command wiki request");
    await post("/admin/members/action", "instructor", {action:"reapprove",githubId:ids.member});
    check((await get("/welcome", "member")).status === 200, "reapproval restores existing session access");
    await sql`update vibies_private.sessions set created_at = clock_timestamp() - interval '24 hours' where session_hash = ${hash(sessions.member)}`;
    check((await get("/welcome", "member")).headers.get("location") === "/sign-in?message=expired", "absolute 24-hour session boundary is enforced");
    check((await get("/wiki", "member")).headers.get("location") === "/sign-in?message=expired", "command wiki enforces the absolute 24-hour session boundary");
    await sql`select vibies_private.finish_sign_in(${ids.member}, 'synthetic-member', ${hash(sessions.member)}, null)`;
    await sql.unsafe("revoke execute on function vibies_private.access_state(text) from vibies_runtime");
    try {
      const failure = await (await get("/welcome", "member")).text();
      check(failure.includes("We could not check your access") && !failure.includes("Builder") && !failure.includes("revoked") && !failure.includes("permission denied"), "lookup failure is safe and does not mislabel the member");
      const wikiFailureResponse = await get("/wiki", "member");
      const wikiFailure = await wikiFailureResponse.text();
      check(wikiFailureResponse.status === 200 && wikiFailure.includes("We could not check your access") &&
        !wikiFailure.includes('name="q"') && !wikiFailure.includes('id="git-status"') && !wikiFailure.includes("Builder") &&
        !wikiFailure.includes("revoked") && !wikiFailure.includes("permission denied"),
      "command wiki lookup failure is safe and does not expose its gated content");
    } finally { await sql.unsafe("grant execute on function vibies_private.access_state(text) to vibies_runtime"); }
    let firstState, firstOAuth;
    for (let i = 0; i < 11; i++) {
      const start = await post("/auth/start", undefined, {}, origin.origin, `__Host-vibies-browser=${browser}`);
      const location = start.headers.get("location");
      if (i < 10) {
        check(location?.startsWith("https://github.com/login/oauth/authorize?"), `sign-in start ${i + 1} is allowed`);
        if (i === 0) {
          check(start.headers.get("referrer-policy") === "no-referrer", "OAuth redirect hides referrer data");
          firstState = new URL(location).searchParams.get("state");
          firstOAuth = start.headers.getSetCookie().find(c => c.startsWith("__Host-vibies-oauth="))?.split(";")[0];
        }
      } else check(location === "/sign-in?message=limited", "eleventh sign-in start is limited");
    }
    const callbackHeaders = { Cookie: `__Host-vibies-browser=${browser}; ${firstOAuth}` };
    const callback = await fetch(new URL(`/auth/callback?state=${firstState}&error=access_denied`, origin), {headers:callbackHeaders,redirect:"manual"});
    check(callback.headers.get("location") === "/sign-in", "GitHub cancellation returns to sign-in");
    const replay = await fetch(new URL(`/auth/callback?state=${firstState}&error=access_denied`, origin), {headers:callbackHeaders,redirect:"manual"});
    check(replay.headers.get("location") === "/sign-in?message=failed", "callback state cannot be replayed");
    check((await get("/auth/callback?code=invalid&state=invalid")).headers.get("location") === "/sign-in?message=failed", "invalid callback state fails safely");
    await sql.unsafe("revoke execute on function vibies_private.end_session(text) from vibies_runtime");
    try {
      const failure = await post("/auth/sign-out", "member", {});
      check(failure.status === 503 && failure.headers.getSetCookie().some(c => c.startsWith("__Host-vibies-session=;") && c.includes("Max-Age=0")), "sign-out clears the local cookie even when database cleanup fails");
    } finally { await sql.unsafe("grant execute on function vibies_private.end_session(text) to vibies_runtime"); }
    await post("/auth/sign-out", "member", {});
    check((await get("/welcome", "member")).headers.get("location") === "/sign-in?message=expired", "sign-out invalidates the old browser session");
    const [retained] = await sql`select status from vibies_private.accounts where github_id = ${ids.member}`;
    check(retained.status === "approved", "sign-out preserves approval");
    await checkProjectsWeb({sql, origin, check});
    console.log(`${checks} HTTP checks passed. Real GitHub and hosted Preview checks remain separate.`);
  }
} finally { await sql.end(); }
