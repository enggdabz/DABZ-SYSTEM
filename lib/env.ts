/**
 * Reads the three Supabase values out of the environment and fails loudly when
 * one is missing. A blank value here is the single most common reason the app
 * boots but every request 401s, so we surface it as a readable error instead.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in all three ` +
        `values from your Supabase dashboard, then restart 'npm run dev'.`
    );
  }
  return value.trim();
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Server-only. Bypasses Row Level Security -- never import this from a client component. */
export function supabaseServiceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
