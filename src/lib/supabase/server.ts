import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client for server components, route handlers and server actions.
 * Reads and refreshes the auth cookie, so it must be created per request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
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
          // Called from a server component, where cookies are read-only.
          // middleware.ts refreshes the session instead, so this is safe.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses row level security entirely — use it only for
 * trusted server-side work that genuinely cannot run as the signed-in user,
 * and never in a client component.
 */
export function createAdminClient() {
  return createServerClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
