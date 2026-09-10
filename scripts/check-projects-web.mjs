import { createHash } from "node:crypto";

const hash = value => createHash("sha256").update(value).digest("hex");
const sessions = {
  instructor: "a".repeat(64), member: "b".repeat(64), unapproved: "c".repeat(64),
  revoked: "d".repeat(64), second: "f".repeat(64), expired: "9".repeat(64),
};
const ids = { member: "92001", second: "92004" };
const missingId = "17000000-0000-4000-8000-000000000099";

export async function checkProjectsWeb({ sql, origin, check }) {
  const app = origin instanceof URL ? origin : new URL(origin);
  const responses = [];
  const request = async (path, init = {}) => {
    const response = await fetch(new URL(path, app), { redirect: "manual", ...init });
    responses.push({ path, status: response.status, location: response.headers.get("location") ?? "",
      body: await response.clone().text() });
    return response;
  };
  const get = (path, role) => request(path, {
    headers: role ? { Cookie: `__Host-vibies-session=${sessions[role]}` } : {},
  });
  const post = (role, body, requestOrigin = app.origin) => request("/projects/action", {
    method: "POST",
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(role ? { Cookie: `__Host-vibies-session=${sessions[role]}` } : {}),
    },
    body: new URLSearchParams(body),
  });
  const sizedForm = (fields, bytes) => {
    const form = new URLSearchParams({ ...fields, padding: "" });
    const padding = bytes - Buffer.byteLength(form.toString());
    if (padding < 0) throw new Error("Project proof form exceeds its requested size");
    form.set("padding", "x".repeat(padding));
    if (Buffer.byteLength(form.toString()) !== bytes) throw new Error("Project proof form has the wrong size");
    return form;
  };
  const body = response => response.text();
  const location = response => response.headers.get("location") ?? "";
  const projectId = response => location(response).match(/^\/projects\/([0-9a-f-]{36})\?message=(?:created|existing)$/)?.[1];
  const snapshot = async repositoryId => {
    const [row] = await sql`
      select p.title, p.summary, p.demo_url, p.publication, p.connection,
             p.moderation, p.last_checked_at, p.version::text,
             a.onboarding_completed
        from vibies_private.personal_projects p
        join vibies_private.accounts a on a.internal_id = p.owner_account_id
       where p.repository_id = ${repositoryId}
    `;
    return JSON.stringify(row);
  };
  const moderationOnly = (before, after, moderation) => after.moderation === moderation &&
    after.version !== before.version && ["title", "summary", "demo_url", "publication", "connection",
      "last_checked_at", "onboarding_completed"].every(key => after[key] === before[key]);
  const setUsername = username => sql`
    update vibies_private.accounts set github_username = ${username}
     where github_id = ${ids.member}
  `;
  const delayedCheckRace = async ({ id, repositoryId, action }) => {
    let delayed, mutation, afterMutation, setupError;
    await sql`select pg_advisory_lock(1717, 12)`;
    try {
      await setUsername("synthetic-member-held");
      delayed = post("member", { action: "check", id });
      const deadline = Date.now() + 2_000;
      let waiting = false;
      while (Date.now() < deadline) {
        const [state] = await sql`
          select exists (
            select 1 from pg_catalog.pg_locks
             where locktype = 'advisory'
               and database = (select oid from pg_catalog.pg_database where datname = current_database())
               and classid = '1717'::oid and objid = '12'::oid and objsubid = 2
               and not granted
          ) as waiting
        `;
        if (state.waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (!waiting) throw new Error("Delayed project Check did not reach its bounded provider wait");
      mutation = action === "edit"
        ? await post("member", { action, id, title: "Edit Wins", summary: "A delayed Check cannot replace this edit.", demoUrl: "" })
        : await post("member", { action, id, confirm: "yes" });
      afterMutation = await snapshot(repositoryId);
    } catch (error) { setupError = error; }
    finally { await sql`select pg_advisory_unlock(1717, 12)`; }
    let checked;
    try { if (delayed) checked = await delayed; }
    finally { await setUsername("synthetic-member"); }
    if (setupError) throw setupError;
    if (!mutation || !checked) throw new Error("Delayed project Check proof did not complete");
    return { mutation, checked, afterMutation, afterCheck: await snapshot(repositoryId) };
  };

  await sql`delete from vibies_private.personal_projects`;
  await sql`select vibies_private.finish_sign_in(${ids.member}, 'synthetic-member', ${hash(sessions.member)}, null)`;
  await sql`update vibies_private.accounts set status = 'approved', nickname = 'Builder', onboarding_completed = false
             where github_id = ${ids.member}`;
  await sql`select vibies_private.finish_sign_in(${ids.second}, 'synthetic-second', ${hash(sessions.second)}, null)`;
  await sql`update vibies_private.accounts set status = 'approved', nickname = 'Scout'
             where github_id = ${ids.second}`;
  await sql`select vibies_private.finish_sign_in(${ids.member}, 'synthetic-member', ${hash(sessions.expired)}, null)`;
  await sql`update vibies_private.sessions set created_at = clock_timestamp() - interval '24 hours'
             where session_hash = ${hash(sessions.expired)}`;

  const picker = await get("/projects/connect?refresh=yes", "member");
  const pickerText = await body(picker);
  check(picker.status === 200 && pickerText.includes("Install or configure the GitHub App") &&
    pickerText.includes("synthetic-project-17101") && pickerText.includes("synthetic-project-17106") &&
    !pickerText.includes("synthetic-public") && !pickerText.includes("synthetic-wrong-owner") &&
    !pickerText.includes("synthetic-organization"),
  "P1/P3 project picker shows only eligible synthetic personal private repositories");
  check(pickerText.includes("Keep personal information") && pickerText.includes("must stay private") &&
    pickerText.includes("/auth/sign-out"),
  "P1/P13 Connect explains privacy and repository rules and keeps sign-out available");

  const created = await post("member", {
    action: "connect", repositoryId: "17101", title: "Pocket Garden",
    summary: "A synthetic garden log for small daily experiments.", demoUrl: "https://example.test/vibies",
  });
  const mainId = projectId(created);
  check(created.status === 303 && location(created).endsWith("?message=created") && Boolean(mainId),
    "P1 a fresh server check creates one connected Draft");
  const review = await get(`/projects/${mainId}`, "member");
  const reviewText = await body(review);
  check(review.status === 200 && reviewText.includes("Pocket Garden") && reviewText.includes("Draft") &&
    reviewText.includes("Connected") && reviewText.includes("Visible") && reviewText.includes(">Publish<"),
  "P1 the owner reviews the Draft and its independent states before Publish");
  check(reviewText.includes(">Edit project</summary>") && reviewText.includes(">Save changes</button>") &&
    reviewText.includes(">Delete project</summary>") && reviewText.replaceAll("<!-- -->", "").includes("Delete Pocket Garden?") &&
    reviewText.includes("Your GitHub repository stays unchanged") && reviewText.includes(">Confirm delete</button>") &&
    reviewText.includes(`href="/projects/${mainId}">Cancel</a>`),
  "P10/P11 the owner page has labeled Edit and confirmed Delete controls with a Cancel link and warning");

  const beforeDraftEdit = JSON.parse(await snapshot("17101"));
  await setUsername("synthetic-member-unknown");
  const draftEdit = await post("member", { action: "edit", id: mainId, title: "Pocket Garden Draft",
    summary: "Draft details can change before publication.", demoUrl: "" });
  const afterDraftEdit = JSON.parse(await snapshot("17101"));
  check(location(draftEdit) === `/projects/${mainId}?message=edited` &&
    afterDraftEdit.title === "Pocket Garden Draft" && afterDraftEdit.summary === "Draft details can change before publication." &&
    afterDraftEdit.demo_url === null && afterDraftEdit.publication === beforeDraftEdit.publication &&
    afterDraftEdit.connection === beforeDraftEdit.connection && afterDraftEdit.moderation === beforeDraftEdit.moderation &&
    afterDraftEdit.last_checked_at === beforeDraftEdit.last_checked_at &&
    afterDraftEdit.onboarding_completed === beforeDraftEdit.onboarding_completed && afterDraftEdit.version !== beforeDraftEdit.version,
  "P10 an owner edits only authored details before publication without a GitHub provider check");
  await setUsername("synthetic-member");

  const published = await post("member", { action: "publish", id: mainId });
  check(published.status === 303 && location(published) === `/projects/${mainId}?message=published`,
    "P1 the protected Publish action succeeds after a fresh provider check");
  const [publishedRow] = await sql`
    select p.publication, p.connection, p.moderation, a.onboarding_completed
      from vibies_private.personal_projects p
      join vibies_private.accounts a on a.internal_id = p.owner_account_id
     where p.id = ${mainId}::uuid
  `;
  check(publishedRow?.publication === "Published" && publishedRow.connection === "Connected" &&
    publishedRow.moderation === "Visible" && publishedRow.onboarding_completed === true,
  "P1/P5 publication and onboarding persist while connection and moderation stay unchanged");

  await setUsername("synthetic-member-unknown");
  const maxTitle = "🌱".repeat(80);
  const maxSummary = "🌿".repeat(250) + "\n" + "🌻".repeat(249);
  const demoPrefix = "https://example.test/";
  const maxDemo = demoPrefix + "🌱".repeat(2048 - [...demoPrefix].length);
  const maxEdit = sizedForm({ action: "edit", id: mainId, title: maxTitle,
    summary: maxSummary, demoUrl: maxDemo }, 32_768);
  const maximum = await post("member", maxEdit);
  const afterMaximum = JSON.parse(await snapshot("17101"));
  check(location(maximum) === `/projects/${mainId}?message=edited` &&
    Buffer.byteLength(maxEdit.toString()) === 32_768 && [...afterMaximum.title].length === 80 &&
    [...afterMaximum.summary].length === 500 && [...afterMaximum.demo_url].length === 2048 &&
    afterMaximum.publication === "Published" && afterMaximum.connection === "Connected" &&
    afterMaximum.moderation === "Visible" && afterMaximum.onboarding_completed === true,
  "P10 the HTTP route accepts maximum Unicode details and a full HTTPS URL at the 32,768-byte body bound");

  const beforeInvalidEdits = await snapshot("17101");
  const invalidEdits = [
    ["empty title", " ", "Valid summary", ""],
    ["oversized title", "🌱".repeat(81), "Valid summary", ""],
    ["empty summary", "Valid title", " \n ", ""],
    ["oversized summary", "Valid title", "🌱".repeat(501), ""],
    ["title format control", "Unsafe\u200btitle", "Valid summary", ""],
    ["summary control", "Valid title", "Unsafe\tsummary", ""],
    ["non-HTTPS URL", "Valid title", "Valid summary", "http://example.test/demo"],
    ["credential URL", "Valid title", "Valid summary", "https://user:password@example.test/demo"],
    ["oversized URL", "Valid title", "Valid summary", demoPrefix + "x".repeat(2049 - demoPrefix.length)],
  ];
  for (const [label, title, summary, demoUrl] of invalidEdits) {
    const invalid = await post("member", { action: "edit", id: mainId, title, summary, demoUrl });
    check(location(invalid) === `/projects/${mainId}?message=invalid`, `P10 ${label} is rejected by the Edit HTTP route`);
  }
  const oversizedBody = await post("member", sizedForm({ action: "edit", id: mainId,
    title: "Valid title", summary: "Valid summary", demoUrl: "" }, 32_769));
  const crossOriginEdit = await post("member", { action: "edit", id: mainId,
    title: "Valid title", summary: "Valid summary", demoUrl: "" }, "https://other.test");
  const crossOriginDelete = await post("member", { action: "delete", id: mainId, confirm: "yes" }, "https://other.test");
  check(oversizedBody.status === 413 && crossOriginEdit.status === 403 && crossOriginDelete.status === 403 &&
    await snapshot("17101") === beforeInvalidEdits,
  "P10/P11 an oversized body and cross-origin Edit or Delete are rejected without stored changes");

  const escapedTitle = "<script>synthetic()</script>";
  const escapedSummary = '<img src=x onerror="synthetic()">';
  const unreachableDemo = "https://127.0.0.1:1/server-must-not-fetch";
  const escapedEdit = await post("member", { action: "edit", id: mainId, title: escapedTitle,
    summary: escapedSummary, demoUrl: unreachableDemo });
  const escapedPage = await get(`/projects/${mainId}?message=edited`, "member");
  const escapedText = await body(escapedPage);
  check(location(escapedEdit) === `/projects/${mainId}?message=edited` && escapedPage.status === 200 &&
    escapedText.includes("&lt;script&gt;synthetic()&lt;/script&gt;") && !escapedText.includes("<script>synthetic()</script>") &&
    escapedText.includes("&lt;img src=x onerror=&quot;synthetic()&quot;&gt;") && !escapedText.includes("<img src=x") &&
    escapedText.includes(unreachableDemo) && escapedText.includes("Project details saved."),
  "P10 stored title and summary render as escaped text and an unreachable demo destination is not fetched");

  const restoredDetails = await post("member", { action: "edit", id: mainId, title: "Pocket Garden",
    summary: "A synthetic garden log for small daily experiments.", demoUrl: "https://example.test/vibies" });
  const afterRestoreDetails = JSON.parse(await snapshot("17101"));
  check(location(restoredDetails) === `/projects/${mainId}?message=edited` && afterRestoreDetails.title === "Pocket Garden" &&
    afterRestoreDetails.summary === "A synthetic garden log for small daily experiments." &&
    afterRestoreDetails.demo_url === "https://example.test/vibies" && afterRestoreDetails.publication === "Published" &&
    afterRestoreDetails.connection === "Connected" && afterRestoreDetails.moderation === "Visible" &&
    afterRestoreDetails.onboarding_completed === true,
  "P10 an owner edits published details without changing project state or onboarding");
  await setUsername("synthetic-member");

  const protectedBefore = await snapshot("17101");
  for (const [action, fields] of [["edit", { title: "Denied edit", summary: "Must stay unchanged.", demoUrl: "" }],
    ["delete", { confirm: "yes" }]]) {
    const denials = await Promise.all([undefined, "unapproved", "revoked", "expired", "instructor", "second"]
      .map(role => post(role, { action, id: mainId, ...fields })));
    const denialBodies = await Promise.all(denials.map(body));
    check(denials.every(response => response.status === 403) &&
      denialBodies.every(text => !text.includes("Pocket Garden") && !text.includes(ids.member)),
    `P2/P${action === "edit" ? "10" : "11"} signed-out, inactive, expired, Instructor, and wrong-owner ${action} requests get a generic denial`);
  }
  check(await snapshot("17101") === protectedBefore,
    "P10/P11 denied Edit and Delete requests leave the owned project unchanged");

  const secondList = await get("/projects", "second");
  const secondListText = await body(secondList);
  const secondDetail = await get(`/projects/${mainId}`, "second");
  const secondDetailText = await body(secondDetail);
  const instructorDetail = await get(`/projects/${mainId}`, "instructor");
  const instructorDetailText = await body(instructorDetail);
  check(secondList.status === 200 && secondListText.includes("Pocket Garden") &&
    secondDetail.status === 200 && secondDetailText.includes("Pocket Garden") &&
    instructorDetail.status === 200 && instructorDetailText.includes("Pocket Garden"),
  "P1 available shared details are private and readable by another Member and the Instructor");

  const deniedReaders = [
    [undefined, "/sign-in?message=expired"],
    ["unapproved", "/access-denied"],
    ["revoked", "/access-denied"],
    ["expired", "/sign-in?message=expired"],
  ];
  for (const [role, expected] of deniedReaders) {
    const list = await get("/projects", role);
    const action = await post(role, { action: "publish", id: mainId });
    check(list.status === 307 && location(list) === expected && action.status === 403,
      `P2 ${role ?? "signed-out"} callers cannot read projects or run direct actions`);
  }
  for (const role of ["instructor", "second"]) {
    const action = await post(role, { action: "publish", id: mainId });
    const denial = await body(action);
    check(action.status === 403 && !denial.includes("Pocket Garden") && !denial.includes(ids.member),
      `P2 ${role === "second" ? "a wrong owner" : "the Instructor"} cannot run owner actions and sees no project identity in the denial`);
  }
  const crossOrigin = await post("member", { action: "publish", id: mainId }, "https://other.test");
  check(crossOrigin.status === 403, "P2 cross-origin project actions are denied");

  const beforeIneligible = await sql`select count(*)::int as count from vibies_private.personal_projects`;
  for (const [repositoryId, label] of [["17901", "public"], ["17902", "wrong-owner"],
    ["17903", "organization-owned"], ["17999", "unselected or inaccessible"]]) {
    const rejected = await post("member", { action: "connect", repositoryId,
      title: "Rejected synthetic project", summary: "This record must not be created.", demoUrl: "" });
    check(rejected.status === 303 && location(rejected) === "/projects/connect?message=lost",
      `P3 ${label} repository cannot create a project`);
  }
  for (const username of ["synthetic-member-suspended", "synthetic-member-all"]) {
    await setUsername(username);
    const rejected = await post("member", { action: "connect", repositoryId: "17102",
      title: "Rejected installation", summary: "This record must not be created.", demoUrl: "" });
    check(rejected.status === 303 && location(rejected) === "/projects/connect?message=lost",
      `P3 ${username.endsWith("suspended") ? "suspended" : "all-repositories"} installation cannot create a project`);
  }
  await setUsername("synthetic-member");
  const afterIneligible = await sql`select count(*)::int as count from vibies_private.personal_projects`;
  check(beforeIneligible[0].count === afterIneligible[0].count,
    "P3 rejected repository and installation checks create no stored project");

  const duplicate = await Promise.all([
    post("member", { action: "connect", repositoryId: "17102", title: "Concurrent Alpha",
      summary: "The first accepted details stay with this repository.", demoUrl: "" }),
    post("member", { action: "connect", repositoryId: "17102", title: "Concurrent Beta",
      summary: "The second request cannot replace accepted details.", demoUrl: "" }),
  ]);
  const duplicateIds = duplicate.map(projectId);
  const duplicateRows = await sql`select id::text, title, summary from vibies_private.personal_projects where repository_id = '17102'`;
  check(duplicate.every(response => response.status === 303) && duplicateIds[0] === duplicateIds[1] &&
    duplicateRows.length === 1 && ["Concurrent Alpha", "Concurrent Beta"].includes(duplicateRows[0].title),
  "P4 concurrent duplicate Connect opens one retained project without replacing its details");

  const capacity = await Promise.all([
    post("member", { action: "connect", repositoryId: "17103", title: "Last Place Alpha",
      summary: "One request may use the final project place.", demoUrl: "" }),
    post("member", { action: "connect", repositoryId: "17104", title: "Last Place Beta",
      summary: "One request may use the final project place.", demoUrl: "" }),
  ]);
  const capacityLocations = capacity.map(location);
  const retained = await sql`
    select count(*)::int as count from vibies_private.personal_projects p
    join vibies_private.accounts a on a.internal_id = p.owner_account_id
    where a.github_id = ${ids.member}
  `;
  check(retained[0].count === 3 && capacityLocations.filter(value => value.includes("message=created")).length === 1 &&
    capacityLocations.filter(value => value === "/projects/connect?message=full").length === 1,
  "P4 competing connections for the final place retain at most three projects");
  await sql`delete from vibies_private.personal_projects where repository_id <> '17101'`;

  const beforeRepeat = await snapshot("17101");
  const repeated = await Promise.all([
    post("member", { action: "publish", id: mainId }),
    post("member", { action: "publish", id: mainId }),
  ]);
  check(repeated.every(response => response.status === 303 && location(response) === `/projects/${mainId}?message=already`) &&
    await snapshot("17101") === beforeRepeat,
  "P5 concurrent repeated Publish requests return Already published with no stored changes");

  const failureId = "17000000-0000-4000-8000-000000000005";
  await sql`update vibies_private.accounts set onboarding_completed = false where github_id = ${ids.member}`;
  await sql`
    insert into vibies_private.personal_projects
      (id, owner_account_id, repository_id, title, summary, publication, connection, moderation, last_checked_at)
    values (${failureId}::uuid,
      (select internal_id from vibies_private.accounts where github_id = ${ids.member}),
      '17105', 'Write Failure Draft', 'A synthetic transaction failure target.',
      'Draft', 'Connected', 'Visible', clock_timestamp())
  `;
  const beforeFailure = await snapshot("17105");
  let failedWrite;
  await sql.unsafe("revoke execute on function vibies_private.publish_project(text, uuid, bigint) from vibies_runtime");
  try {
    failedWrite = await post("member", { action: "publish", id: failureId });
  } finally {
    await sql.unsafe("grant execute on function vibies_private.publish_project(text, uuid, bigint) to vibies_runtime");
  }
  check(failedWrite.status === 503 && await snapshot("17105") === beforeFailure,
    "P5 a simulated protected-write failure leaves publication and onboarding unchanged");
  await sql`delete from vibies_private.personal_projects where id = ${failureId}::uuid`;
  await sql`update vibies_private.accounts set onboarding_completed = true where github_id = ${ids.member}`;

  const hiddenId = "17000000-0000-4000-8000-000000000015";
  const draftId = "17000000-0000-4000-8000-000000000011";
  const archivedId = "17000000-0000-4000-8000-000000000012";
  const disconnectedId = "17000000-0000-4000-8000-000000000013";
  await sql`
    insert into vibies_private.personal_projects
      (id, owner_account_id, repository_id, title, summary, publication, connection, moderation, last_checked_at)
    values
      (${hiddenId}::uuid, (select internal_id from vibies_private.accounts where github_id = ${ids.member}),
       '17105', 'Hidden Lantern', 'A synthetic hidden project.', 'Draft', 'Connected', 'Hidden', clock_timestamp()),
      (${draftId}::uuid, (select internal_id from vibies_private.accounts where github_id = ${ids.member}),
       '18011', 'Quiet Draft', 'A synthetic unavailable Draft.', 'Draft', 'Connected', 'Visible', clock_timestamp()),
      (${archivedId}::uuid, (select internal_id from vibies_private.accounts where github_id = ${ids.member}),
       '17106', 'Stored Archive', 'A synthetic unavailable Archive.', 'Archived', 'Disconnected', 'Visible', clock_timestamp()),
      (${disconnectedId}::uuid, (select internal_id from vibies_private.accounts where github_id = ${ids.member}),
       '18013', 'Offline Draft', 'A synthetic unavailable disconnected project.', 'Draft', 'Disconnected', 'Visible', clock_timestamp())
  `;
  await sql`update vibies_private.accounts set onboarding_completed = false where github_id = ${ids.member}`;
  const hiddenPublish = await post("member", { action: "publish", id: hiddenId });
  const [hiddenRow] = await sql`
    select p.publication, p.connection, p.moderation, a.onboarding_completed
      from vibies_private.personal_projects p
      join vibies_private.accounts a on a.internal_id = p.owner_account_id
     where p.id = ${hiddenId}::uuid
  `;
  check(location(hiddenPublish) === `/projects/${hiddenId}?message=published` && hiddenRow.publication === "Published" &&
    hiddenRow.connection === "Connected" && hiddenRow.moderation === "Hidden" && hiddenRow.onboarding_completed === true,
  "P5/P6 a Hidden Draft publishes, stays Hidden, and completes onboarding");

  const unavailable = [[hiddenId, "Hidden Lantern"], [draftId, "Quiet Draft"],
    [archivedId, "Stored Archive"], [disconnectedId, "Offline Draft"]];
  const community = await get("/projects", "second");
  const communityText = await body(community);
  check(unavailable.every(([, title]) => !communityText.includes(title)) && communityText.includes("Pocket Garden"),
    "P6 Community reads include only Published, Connected, Visible projects");
  for (const [id, title] of unavailable) {
    const memberView = await get(`/projects/${id}`, "second");
    const memberText = await body(memberView);
    check(memberView.status === 200 && memberText.includes("Project unavailable") && !memberText.includes(title),
      `P6 another Member gets the safe unavailable response for ${title}`);
  }
  const missingMember = await get(`/projects/${missingId}`, "second");
  check((await body(missingMember)).includes("Project unavailable"),
    "P6 unavailable and nonexistent project URLs use the same safe Member response");

  const instructorHidden = await get(`/projects/${hiddenId}`, "instructor");
  const instructorHiddenText = await body(instructorHidden);
  check(instructorHidden.status === 200 && instructorHiddenText.includes("Hidden Lantern"),
  "P6 the Instructor can reach a retained Hidden moderation target");
  for (const [id, title] of [[draftId, "Quiet Draft"], [archivedId, "Stored Archive"],
    [disconnectedId, "Offline Draft"]]) {
    const instructorView = await get(`/projects/${id}`, "instructor");
    const instructorText = await body(instructorView);
    check(instructorView.status === 200 && instructorText.includes("Project unavailable") && !instructorText.includes(title),
      `P6 the Instructor cannot read the unavailable ${title} fixture`);
  }

  const wrongOwner = await post("second", { action: "publish", id: mainId });
  const missingPublish = await post("member", { action: "publish", id: missingId });
  const archivedPublish = await post("member", { action: "publish", id: archivedId });
  const disconnectedPublish = await post("member", { action: "publish", id: disconnectedId });
  const submittedKind = await post("member", { action: "publish", id: mainId, kind: "class" });
  check(wrongOwner.status === 403 && missingPublish.status === 403 &&
    location(archivedPublish) === `/projects/${archivedId}?message=invalid` &&
    location(disconnectedPublish) === `/projects/${disconnectedId}?message=invalid` && submittedKind.status === 400,
  "P7 wrong-owner, missing, Archived, Disconnected, and submitted Class-kind publication attempts fail safely");

  const unknownId = "17000000-0000-4000-8000-000000000014";
  await sql`
    insert into vibies_private.personal_projects
      (id, owner_account_id, repository_id, title, summary, publication, connection, moderation, last_checked_at)
    values (${unknownId}::uuid,
      (select internal_id from vibies_private.accounts where github_id = ${ids.member}),
      '17104', 'Verifier Boundary', 'A direct request cannot claim verification.',
      'Draft', 'Connected', 'Visible', clock_timestamp())
  `;
  await sql`update vibies_private.accounts set onboarding_completed = false where github_id = ${ids.member}`;
  await setUsername("synthetic-member-unknown");
  const beforeUnknown = await snapshot("17104");
  const unknown = await post("member", { action: "publish", id: unknownId, verified: "true" });
  check(location(unknown) === `/projects/${unknownId}?message=unknown` && await snapshot("17104") === beforeUnknown,
    "P8 a direct browser claim cannot bypass fresh server verification and Unknown changes nothing");

  await setUsername("synthetic-member-lost");
  const beforeLost = JSON.parse(await snapshot("17104"));
  const lost = await post("member", { action: "publish", id: unknownId });
  const afterLost = JSON.parse(await snapshot("17104"));
  check(location(lost) === `/projects/${unknownId}?message=lost` && afterLost.connection === "Disconnected" &&
    afterLost.publication === beforeLost.publication && afterLost.moderation === beforeLost.moderation &&
    afterLost.title === beforeLost.title && afterLost.summary === beforeLost.summary &&
    afterLost.demo_url === beforeLost.demo_url && afterLost.last_checked_at === beforeLost.last_checked_at &&
    afterLost.onboarding_completed === beforeLost.onboarding_completed,
  "P8 confirmed pre-Publish loss saves Disconnected while preserving details, publication, moderation, last success, and onboarding");
  await sql`delete from vibies_private.personal_projects where id = ${unknownId}::uuid`;
  await sql`update vibies_private.accounts set onboarding_completed = true where github_id = ${ids.member}`;

  const beforeManualLoss = JSON.parse(await snapshot("17101"));
  const detectLoss = await post("member", { action: "check", id: mainId });
  const lostCommunity = await get("/projects", "second");
  const lostDetail = await get(`/projects/${mainId}`, "second");
  check(location(detectLoss) === `/projects/${mainId}?message=lost` &&
    !(await body(lostCommunity)).includes("Pocket Garden") && (await body(lostDetail)).includes("Project unavailable"),
  "P9 a manual confirmed loss removes a published project from Community reads immediately");
  await setUsername("synthetic-member");
  const restore = await post("member", { action: "check", id: mainId });
  const afterRestore = JSON.parse(await snapshot("17101"));
  const restoredCommunity = await get("/projects", "second");
  check(location(restore) === `/projects/${mainId}?message=connected` &&
    (await body(restoredCommunity)).includes("Pocket Garden") && afterRestore.connection === "Connected" &&
    afterRestore.publication === beforeManualLoss.publication && afterRestore.moderation === beforeManualLoss.moderation &&
    afterRestore.title === beforeManualLoss.title && afterRestore.last_checked_at !== beforeManualLoss.last_checked_at,
  "P9 a successful manual check restores the same repository and preserves independent states");

  await sql`update vibies_private.personal_projects set connection = 'Disconnected', version = version + 1
             where id = ${hiddenId}::uuid`;
  for (const id of [hiddenId, archivedId]) {
    const restored = await post("member", { action: "check", id });
    check(location(restored) === `/projects/${id}?message=connected`,
      `P9 manual verification restores the retained ${id === hiddenId ? "Hidden" : "Archived"} fixture connection`);
  }
  const stillUnavailable = await get("/projects", "second");
  const stillUnavailableText = await body(stillUnavailable);
  check(!stillUnavailableText.includes("Hidden Lantern") && !stillUnavailableText.includes("Stored Archive"),
    "P9 restored Hidden and Archived fixtures remain unavailable to Community reads");

  const guideAvailable = await get(`/projects/${mainId}`, "instructor");
  const guideAvailableText = await body(guideAvailable);
  const ownerAvailable = await get(`/projects/${mainId}`, "member");
  const ownerAvailableText = await body(ownerAvailable);
  check(guideAvailable.status === 200 && guideAvailableText.includes(">Hide project</button>") &&
    !guideAvailableText.includes(">Restore project</button>") && !ownerAvailableText.includes(">Hide project</button>") &&
    !ownerAvailableText.includes(">Restore project</button>"),
  "P16 only the Instructor sees Hide on an available project");

  const beforeModerationDenials = await snapshot("17101");
  for (const action of ["hide", "restore"]) {
    const denials = await Promise.all([undefined, "member", "second", "unapproved", "revoked", "expired"]
      .map(role => post(role, { action, id: mainId })));
    const crossOrigin = await post("instructor", { action, id: mainId }, "https://other.test");
    const denialBodies = await Promise.all([...denials, crossOrigin].map(body));
    check(denials.every(response => response.status === 403) && crossOrigin.status === 403 &&
      denialBodies.every(text => !text.includes("Pocket Garden") && !text.includes(ids.member)),
    `P16 unauthorized and cross-origin ${action} actions get a generic denial`);
  }
  for (const [id, repositoryId] of [[draftId, "18011"], [archivedId, "17106"], [disconnectedId, "18013"]]) {
    const before = await snapshot(repositoryId);
    const attempts = await Promise.all(["hide", "restore"].map(action => post("instructor", { action, id })));
    check(attempts.every(response => response.status === 403) && await snapshot(repositoryId) === before,
      "P16 the Instructor cannot moderate a Visible unavailable target");
  }
  check(await snapshot("17101") === beforeModerationDenials,
    "P16 denied moderation actions leave the available project unchanged");

  await setUsername("synthetic-member-unknown");
  const beforeHide = JSON.parse(await snapshot("17101"));
  const hidden = await post("instructor", { action: "hide", id: mainId });
  const afterHide = JSON.parse(await snapshot("17101"));
  const guideHidden = await get(`/projects/${mainId}?message=hidden`, "instructor");
  const guideHiddenText = await body(guideHidden);
  const ownerHidden = await get(`/projects/${mainId}`, "member");
  const ownerHiddenText = await body(ownerHidden);
  const hiddenList = await get("/projects", "second");
  const hiddenDetail = await get(`/projects/${mainId}`, "second");
  const hiddenDetailText = await body(hiddenDetail);
  check(location(hidden) === `/projects/${mainId}?message=hidden` && moderationOnly(beforeHide, afterHide, "Hidden") &&
    guideHidden.status === 200 && guideHiddenText.includes("Pocket Garden") &&
    guideHiddenText.includes("Project hidden from the Community.") && guideHiddenText.includes(">Restore project</button>") &&
    !guideHiddenText.includes(">Hide project</button>") && ownerHiddenText.includes("Pocket Garden") &&
    ownerHiddenText.includes("A synthetic garden log for small daily experiments.") &&
    !ownerHiddenText.includes(">Restore project</button>") && !(await body(hiddenList)).includes("Pocket Garden") &&
    hiddenDetailText.includes("Project unavailable") && !hiddenDetailText.includes("Pocket Garden"),
  "P16 Hide preserves the owner's project, removes Community access, and keeps an Instructor Restore path without GitHub");

  const restored = await post("instructor", { action: "restore", id: mainId });
  const afterModerationRestore = JSON.parse(await snapshot("17101"));
  const restoredGuideList = await get("/projects?message=restored", "instructor");
  const restoredGuideText = await body(restoredGuideList);
  const restoredMemberDetail = await get(`/projects/${mainId}`, "second");
  check(location(restored) === "/projects?message=restored" &&
    moderationOnly(afterHide, afterModerationRestore, "Visible") && restoredGuideList.status === 200 &&
    restoredGuideText.includes("Project restored. It is available only when Published and Connected.") &&
    restoredGuideText.includes("Pocket Garden") && (await body(restoredMemberDetail)).includes("Pocket Garden"),
  "P16 Restore preserves independent state and returns an eligible project to the Community without GitHub");

  await sql`update vibies_private.personal_projects set moderation = 'Hidden', version = version + 1
             where id in (${draftId}::uuid, ${archivedId}::uuid, ${disconnectedId}::uuid)`;
  for (const [id, repositoryId, title] of [[draftId, "18011", "Quiet Draft"],
    [archivedId, "17106", "Stored Archive"], [disconnectedId, "18013", "Offline Draft"]]) {
    const before = JSON.parse(await snapshot(repositoryId));
    const hiddenTarget = await get(`/projects/${id}`, "instructor");
    const hiddenTargetText = await body(hiddenTarget);
    const restoreUnavailable = await post("instructor", { action: "restore", id });
    const after = JSON.parse(await snapshot(repositoryId));
    const unavailableAgain = await get(`/projects/${id}`, "instructor");
    const unavailableAgainText = await body(unavailableAgain);
    check(hiddenTarget.status === 200 && hiddenTargetText.includes(title) &&
      hiddenTargetText.includes(">Restore project</button>") && location(restoreUnavailable) === "/projects?message=restored" &&
      moderationOnly(before, after, "Visible") && unavailableAgainText.includes("Project unavailable") &&
      !unavailableAgainText.includes(title),
    `P16 restoring the Hidden ${before.publication === "Archived" ? "Archived" : before.connection === "Disconnected" ? "Disconnected" : "Draft"} fixture preserves its states and makes it unavailable to the Instructor`);
  }
  await setUsername("synthetic-member");

  await sql`delete from vibies_private.personal_projects
             where id in (${hiddenId}::uuid, ${draftId}::uuid, ${archivedId}::uuid, ${disconnectedId}::uuid)`;
  const deleteTarget = await post("member", { action: "connect", repositoryId: "17102", title: "Delete Target",
    summary: "This synthetic project proves confirmed deletion.", demoUrl: "" });
  const capacityAnchor = await post("member", { action: "connect", repositoryId: "17103", title: "Capacity Anchor",
    summary: "This synthetic project keeps the third place occupied.", demoUrl: "" });
  const deleteId = projectId(deleteTarget);
  const anchorId = projectId(capacityAnchor);
  check(Boolean(deleteId) && Boolean(anchorId), "P11 synthetic setup fills all three retained project places");

  const beforeDelete = await snapshot("17102");
  const noConfirmation = await post("member", { action: "delete", id: deleteId });
  const cancelDelete = await get(`/projects/${deleteId}`, "member");
  const wrongOwnerDelete = await post("second", { action: "delete", id: deleteId, confirm: "yes" });
  const missingDelete = await post("member", { action: "delete", id: missingId, confirm: "yes" });
  const wrongOwnerBody = await body(wrongOwnerDelete);
  const missingDeleteBody = await body(missingDelete);
  check(noConfirmation.status === 400 && cancelDelete.status === 200 &&
    (await body(cancelDelete)).includes("Delete Target") && wrongOwnerDelete.status === 403 && missingDelete.status === 403 &&
    wrongOwnerBody === missingDeleteBody && !wrongOwnerBody.includes("Delete Target") && await snapshot("17102") === beforeDelete,
  "P11 confirmation, Cancel, wrong-owner, and missing-project Delete requests have no effect or identifying denial");

  await setUsername("synthetic-member-unknown");
  const beforeDeleteCount = await sql`select count(*)::int as count from vibies_private.personal_projects`;
  const confirmedDelete = await post("member", { action: "delete", id: deleteId, confirm: "yes" });
  const repeatedDelete = await post("member", { action: "delete", id: deleteId, confirm: "yes" });
  const deletedList = await get("/projects?message=deleted", "member");
  const deletedListText = await body(deletedList);
  const afterDeleteCount = await sql`select count(*)::int as count from vibies_private.personal_projects`;
  const deletedRows = await sql`select id from vibies_private.personal_projects where id = ${deleteId}::uuid`;
  const [memberAfterDelete] = await sql`select onboarding_completed from vibies_private.accounts where github_id = ${ids.member}`;
  check(location(confirmedDelete) === "/projects?message=deleted" && repeatedDelete.status === 403 &&
    deletedList.status === 200 && deletedListText.includes("Project deleted. A project place is now free.") &&
    !deletedListText.includes("Delete Target") && deletedListText.includes("Pocket Garden") &&
    deletedListText.includes("Capacity Anchor") && afterDeleteCount[0].count === beforeDeleteCount[0].count - 1 &&
    deletedRows.length === 0 && memberAfterDelete.onboarding_completed === true,
  "P11 confirmed Delete removes only the project, keeps onboarding, succeeds without GitHub, and makes retry safe");

  await setUsername("synthetic-member");
  const replacement = await post("member", { action: "connect", repositoryId: "17104", title: "Freed Place",
    summary: "A new Draft can use the place freed by deletion.", demoUrl: "" });
  const replacementId = projectId(replacement);
  const retainedAfterReplacement = await sql`
    select count(*)::int as count from vibies_private.personal_projects p
    join vibies_private.accounts a on a.internal_id = p.owner_account_id
    where a.github_id = ${ids.member}
  `;
  check(Boolean(replacementId) && location(replacement).endsWith("?message=created") && retainedAfterReplacement[0].count === 3,
    "P11 confirmed deletion frees one project place for a new connected Draft");

  await sql`update vibies_private.personal_projects set connection = 'Disconnected', version = version + 1
             where id = ${mainId}::uuid`;
  const editRace = await delayedCheckRace({ id: mainId, repositoryId: "17101", action: "edit" });
  const editWinner = JSON.parse(editRace.afterMutation);
  check(location(editRace.mutation) === `/projects/${mainId}?message=edited` &&
    location(editRace.checked) === `/projects/${mainId}?message=stale` && editWinner.title === "Edit Wins" &&
    editWinner.connection === "Disconnected" && editRace.afterCheck === editRace.afterMutation,
  "P12 a delayed verified Check cannot restore connection or overwrite a newer Edit");

  const deleteRace = await delayedCheckRace({ id: replacementId, repositoryId: "17104", action: "delete" });
  check(location(deleteRace.mutation) === "/projects?message=deleted" && deleteRace.checked.status === 403 &&
    deleteRace.afterMutation === undefined && deleteRace.afterCheck === undefined,
  "P12 a delayed verified Check gets a generic denial and cannot restore a deleted project");

  const [owner] = await sql`select internal_id::text from vibies_private.accounts where github_id = ${ids.member}`;
  const stored = await sql`select to_jsonb(p) as project from vibies_private.personal_projects p`;
  const storedText = JSON.stringify(stored);
  const forbidden = ["synthetic-member", "synthetic-second", ids.member, ids.second, "17100",
    "synthetic-installation-token", "must-stay-server-side"];
  check(responses.every(response => forbidden.every(value => !`${response.body}${response.location}`.includes(value))) &&
    !responses.some(response => response.body.includes(owner.internal_id)),
  "P13 browser responses contain no GitHub account identity, internal owner ID, installation ID, token, or raw provider payload");
  check(forbidden.every(value => !storedText.includes(value)) && stored.every(row =>
    !Object.keys(row.project).some(key => /github|username|installation|token|payload/i.test(key))),
  "P13 stored project records contain an internal owner reference and no GitHub account or raw provider fields");
  check(review.headers.get("cache-control")?.includes("no-store") &&
    secondDetail.headers.get("cache-control")?.includes("no-store") && reviewText.includes("/auth/sign-out") &&
    secondDetailText.includes("/auth/sign-out") && instructorDetailText.includes("/auth/sign-out") &&
    secondDetailText.includes('rel="noreferrer"') && secondDetailText.includes('referrerPolicy="no-referrer"'),
  "P13 private project pages prevent caching, retain sign-out, and hide demo referrers");

  const demo = await get("/demo");
  check(demo.status === 200, "P14 the existing public demo remains available after project HTTP checks");
  console.log("Synthetic project HTTP proof complete. Record P1 and P15 real GitHub Preview receipts separately.");
}
