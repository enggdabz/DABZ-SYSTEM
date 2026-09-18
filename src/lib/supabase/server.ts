/**
 * Supabase client for code that runs on the server (pages, route handlers).
 *
 * It reads and writes the login cookies through Next's cookie store, which is
 * how a signed-in staff member stays signed in across page loads. Phase 1 adds
 * the actual login screens; this is the plumbing they will use.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readSupabaseEnv } from "./env";

export async function createSupabaseServerClient() {
  const result = readSupabaseEnv();
  if (!result.ok) {
    throw new Error(
      `Supabase is not configured. Missing: ${result.missing.join(", ")}. See docs/SETUP.md.`,
    );
  }

  const cookieStore = await cookies();

  return createServerClient(result.env.url, result.env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Cookies cannot be written while rendering a Server Component.
          // That is fine: the session is refreshed in route handlers and the
          // proxy instead. Swallowing this keeps read-only pages working.
        }
      },
    },
  });
}
