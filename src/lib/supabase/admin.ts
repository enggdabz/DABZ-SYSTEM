// Marks this module server-only: if any browser code ever imports it, even by
// accident through a chain of imports, the build fails instead of shipping the
// secret key to a customer's phone.
import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readSupabaseEnv } from "./env";

/**
 * The administrator connection to the database.
 *
 * DANGER: this uses the service-role key, which BYPASSES Row Level Security
 * completely. It can read and write every row in the shop. Use it only where
 * that is genuinely required:
 *
 *   - Signing in: looking up which account a username belongs to, and reading
 *     and recording login attempts, all of which happen before anyone is
 *     signed in and so cannot pass an RLS check.
 *   - Creating accounts and resetting passwords, which need Supabase's admin
 *     API (spec 4.1: only Owner/Admin may create accounts, no public sign-up).
 *
 * Everywhere else, use createSupabaseServerClient() so that Row Level Security
 * stays in force. Every function in this file must check who is asking before
 * it does anything.
 */
export function createSupabaseAdminClient() {
  const env = readSupabaseEnv();
  if (!env.ok) {
    throw new Error(
      `Supabase is not configured. Missing: ${env.missing.join(", ")}. See docs/SETUP.md.`,
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Signing in and creating accounts need it. See docs/SETUP.md.",
    );
  }

  return createClient(env.env.url, serviceRoleKey, {
    auth: {
      // This client belongs to no particular person, so it must never pick up
      // or refresh a session from cookies or storage.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** True when account creation and sign-in are possible at all. */
export function isAdminClientConfigured(): boolean {
  return readSupabaseEnv().ok && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
