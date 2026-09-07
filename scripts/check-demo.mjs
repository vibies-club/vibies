import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../lib/demo.ts";

const TABLE = "demo_projects";
const PROBE_ID = "9000000000000000013";

const pass = (name) => console.log(`PASS ${name}`);
const fail = (name) => {
  process.exitCode = 1;
  console.log(`FAIL ${name}`);
};

async function main() {
  const config = supabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (config.kind !== "configured") {
    fail("configuration");
    return;
  }
  pass("configuration");

  const supabase = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      }),
    },
  });

  const [seedBefore, countBefore, probeBefore] = await Promise.all([
    supabase.from(TABLE).select("id,title,summary,created_at").eq("id", 1),
    supabase.from(TABLE).select("*", { count: "exact", head: true }),
    supabase.from(TABLE).select("id").eq("id", PROBE_ID),
  ]);

  if (seedBefore.error || seedBefore.data?.length !== 1) {
    fail("seed-row-readable-once");
    return;
  }
  pass("seed-row-readable-once");

  if (countBefore.error || countBefore.count !== 1) {
    fail("single-row-count");
    return;
  }
  pass("single-row-count");

  if (probeBefore.error || probeBefore.data?.length !== 0) {
    fail("reserved-probe-absent");
    return;
  }
  pass("reserved-probe-absent");

  const seedSnapshot = JSON.stringify(seedBefore.data[0]);
  const originalCount = countBefore.count;
  const insert = await supabase
    .from(TABLE)
    .insert({
      id: PROBE_ID,
      title: "Permission probe",
      summary: "A fictional row used to verify anonymous write protection.",
    })
    .select("id");

  if (!insert.error) {
    fail("anonymous-insert-denied-with-42501");
    fail("manual-cleanup-required-delete-demo-projects-probe-id-9000000000000000013");
    return;
  }
  if (insert.error.code !== "42501") {
    fail("anonymous-insert-denied-with-42501");
    return;
  }
  pass("anonymous-insert-denied-with-42501");

  const update = await supabase
    .from(TABLE)
    .update({ summary: "A fictional permission probe update." })
    .eq("id", PROBE_ID)
    .select("id");
  if (update.error?.code === "42501") {
    pass("anonymous-update-denied-with-42501");
  } else {
    fail("anonymous-update-denied-with-42501");
  }

  const remove = await supabase
    .from(TABLE)
    .delete()
    .eq("id", PROBE_ID)
    .select("id");
  if (remove.error?.code === "42501") {
    pass("anonymous-delete-denied-with-42501");
  } else {
    fail("anonymous-delete-denied-with-42501");
  }

  const [seedAfter, countAfter, probeAfter] = await Promise.all([
    supabase.from(TABLE).select("id,title,summary,created_at").eq("id", 1),
    supabase.from(TABLE).select("*", { count: "exact", head: true }),
    supabase.from(TABLE).select("id").eq("id", PROBE_ID),
  ]);

  if (seedAfter.error || JSON.stringify(seedAfter.data?.[0]) !== seedSnapshot) {
    fail("seed-row-unchanged");
  } else {
    pass("seed-row-unchanged");
  }

  if (countAfter.error || countAfter.count !== originalCount) {
    fail("row-count-unchanged");
  } else {
    pass("row-count-unchanged");
  }

  if (probeAfter.error || probeAfter.data?.length !== 0) {
    fail("reserved-probe-still-absent");
  } else {
    pass("reserved-probe-still-absent");
  }
}

main().catch(() => fail("unexpected-check-error"));
