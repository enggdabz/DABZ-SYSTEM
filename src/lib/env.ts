/**
 * Environment access.
 *
 * Every getter is a function, not a module-level constant, so that a missing
 * variable fails at request time rather than at import time. Module-level
 * throws would break `next build` in CI, where Supabase credentials are absent.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced statically (not via a computed
 * key) for Next.js to inline it into the client bundle.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
}

export function supabaseAnonKey(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

/**
 * Server-only. Bypasses row level security, so it must never be imported into
 * a client component or referenced with a NEXT_PUBLIC_ prefix.
 */
export function supabaseServiceRoleKey(): string {
  return required(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
}


/**
 * Internal email domain used to bridge usernames to Supabase Auth accounts.
 * Must match the domain existing auth.users rows were created with.
 */
export function usernameEmailDomain(): string {
  return process.env.SUPABASE_USERNAME_EMAIL_DOMAIN ?? "dabz.local";
}
