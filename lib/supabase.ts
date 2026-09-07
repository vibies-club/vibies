import "server-only";
import { createClient } from "@supabase/supabase-js";
import { demoState, supabaseConfig } from "./demo";

export async function readDemoProject() {
  const config = supabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (config.kind === "configuration") return config;

  try {
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, {
          ...init, cache: "no-store", signal: AbortSignal.timeout(10_000),
        }),
      },
    });
    const { data, error } = await client.from("demo_projects")
      .select("id,title,summary").eq("id", 1).maybeSingle();
    return demoState(data, error);
  } catch {
    return { kind: "error" as const };
  }
}
