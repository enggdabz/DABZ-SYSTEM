/**
 * The Phase 0 connection check.
 *
 * Answers one question for the hello screen: can this app actually reach the
 * Dabz database right now? Every outcome returns a result object with a
 * plain-language next step, because the person reading it is the shop owner,
 * not a programmer.
 */
import { createSupabaseServerClient } from "./supabase/server";
import { readSupabaseEnv } from "./supabase/env";

export type DatabaseStatus = "connected" | "not_configured" | "error";

export interface DatabaseHealth {
  status: DatabaseStatus;
  /** One short line, safe to show on screen. */
  headline: string;
  /** What to do next, in plain language. */
  detail: string;
  /** Present when the database answered. */
  checkedAt?: string;
}

export async function checkDatabase(): Promise<DatabaseHealth> {
  const env = readSupabaseEnv();

  if (!env.ok) {
    return {
      status: "not_configured",
      headline: "Not connected yet",
      detail: `The app has no database settings yet (${env.missing.join(" and ")}). Follow docs/SETUP.md to create the Supabase project, then copy .env.example to .env.local and paste the two values in.`,
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_health")
      .select("label, checked_at")
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        status: "error",
        headline: "The database answered with an error",
        detail:
          error.message ||
          "Check that the first migration in supabase/migrations has been run.",
      };
    }

    if (!data) {
      return {
        status: "error",
        headline: "Connected, but the check table is empty",
        detail:
          "The connection works, but the app_health row is missing. Run supabase/migrations/0000_phase0_hello.sql in the Supabase SQL editor.",
      };
    }

    return {
      status: "connected",
      headline: data.label,
      detail: "The app can read from the Dabz database. Phase 0 is working.",
      checkedAt: data.checked_at,
    };
  } catch (caught) {
    return {
      status: "error",
      headline: "Could not reach the database",
      detail:
        caught instanceof Error
          ? caught.message
          : "Unknown problem while connecting to Supabase.",
    };
  }
}
