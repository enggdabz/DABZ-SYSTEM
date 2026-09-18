/**
 * Reads the Supabase settings from the environment.
 *
 * The app must still start and render when Supabase is not set up yet, so the
 * owner can run `npm run dev` on day one and see a screen that tells them what
 * to do next, instead of a crash. That is why this returns a result object
 * rather than throwing.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export type SupabaseEnvResult =
  | { ok: true; env: SupabaseEnv }
  | { ok: false; missing: string[] };

export function readSupabaseEnv(): SupabaseEnvResult {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, env: { url: url as string, anonKey: anonKey as string } };
}

/** True when the app has enough settings to talk to the database. */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv().ok;
}
