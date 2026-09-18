/**
 * Supabase client for code that runs in the browser (client components).
 * Only ever uses the public "anon" key - Row Level Security in the database
 * decides what each signed-in person is allowed to see (spec 2).
 */
import { createBrowserClient } from "@supabase/ssr";

import { readSupabaseEnv } from "./env";

export function createSupabaseBrowserClient() {
  const result = readSupabaseEnv();
  if (!result.ok) {
    throw new Error(
      `Supabase is not configured. Missing: ${result.missing.join(", ")}. See docs/SETUP.md.`,
    );
  }

  return createBrowserClient(result.env.url, result.env.anonKey);
}
