import "server-only";

/**
 * Reading and recording login attempts (spec 4.1).
 *
 * These run before anyone is signed in, so Row Level Security cannot judge
 * them - they go through the admin connection instead. Nothing here trusts
 * input beyond the username, and nothing here is reachable from a browser
 * except through the login action.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  LOCKOUT_MINUTES,
  evaluateLockout,
  type LockoutState,
  type LoginAttempt,
} from "./credentials";

export type LoginOutcome = LoginAttempt["outcome"];

/** Recent attempts for one username, used to decide whether it is locked. */
export async function readLockoutState(username: string): Promise<LockoutState> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from("login_events")
    .select("outcome, occurred_at")
    .eq("username", username)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    // If the history cannot be read we must not lock a real staff member out
    // of the counter, so fail open here. The password check still stands
    // between the visitor and the shop.
    return evaluateLockout([]);
  }

  return evaluateLockout(
    data.map((row) => ({
      outcome: row.outcome as LoginOutcome,
      occurredAt: new Date(row.occurred_at),
    })),
  );
}

export async function recordLoginEvent(entry: {
  username: string;
  userId?: string | null;
  outcome: LoginOutcome;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("login_events").insert({
      username: entry.username,
      user_id: entry.userId ?? null,
      outcome: entry.outcome,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
    if (error) {
      console.error("[login] could not record attempt:", error.message);
    }
  } catch (caught) {
    console.error(
      "[login] could not record attempt:",
      caught instanceof Error ? caught.message : caught,
    );
  }
}

/** Looks up which account a username belongs to, before anyone is signed in. */
export async function findAccountByUsername(username: string): Promise<{
  id: string;
  username: string;
  fullName: string;
  status: "active" | "inactive";
  mustChangePassword: boolean;
} | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, full_name, status, must_change_password")
    .eq("username", username)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    username: data.username,
    fullName: data.full_name,
    status: data.status === "inactive" ? "inactive" : "active",
    mustChangePassword: data.must_change_password,
  };
}
