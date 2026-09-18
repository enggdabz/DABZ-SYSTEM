"use server";

/**
 * Signing in (spec 4.1).
 *
 * The order of the checks matters. The lockout is checked BEFORE the password,
 * so a locked account cannot be probed. And whether a username exists is never
 * revealed: an unknown username and a wrong password give the same message, so
 * nobody can use the login screen to discover who works here.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import {
  checkUsername,
  describeTimeUntil,
  usernameToInternalEmail,
} from "@/lib/auth/credentials";
import {
  findAccountByUsername,
  readLockoutState,
  recordLoginEvent,
} from "@/lib/auth/login-events";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  /** Shown as a hint after a wrong password, never for an unknown username. */
  attemptsRemaining?: number;
}

/** The same message for every kind of refusal, on purpose. */
const GENERIC_FAILURE = "That username and password do not match.";

/** Only same-site paths, so a crafted link cannot bounce staff off-site. */
function safeRedirectPath(input: string | null): string {
  if (!input) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isAdminClientConfigured()) {
    return {
      error:
        "The system is not connected to its database yet. Follow docs/SETUP.md, including the service-role key.",
    };
  }

  const rawUsername = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(
    formData.get("next") ? String(formData.get("next")) : null,
  );

  const checked = checkUsername(rawUsername);
  if (!checked.ok) {
    // A malformed username cannot match any account, so do not even look.
    return { error: GENERIC_FAILURE };
  }
  const username = checked.username;

  if (password === "") {
    return { error: "Enter your password." };
  }

  const requestHeaders = await headers();
  const context = {
    // Vercel puts the visitor's address here; it is absent when running locally.
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent"),
  };

  // 1. Locked out? Checked first, so the password is not even tried.
  const lockout = await readLockoutState(username);
  if (lockout.locked) {
    await recordLoginEvent({ username, outcome: "locked_out", ...context });
    const wait = lockout.unlocksAt ? describeTimeUntil(lockout.unlocksAt) : "a few minutes";
    return {
      error: `This account is locked after ${lockout.failures} failed attempts. Try again in ${wait}, or ask the owner to reset the password.`,
    };
  }

  // 2. Does the account exist, and is it still active?
  const account = await findAccountByUsername(username);
  if (!account) {
    await recordLoginEvent({ username, outcome: "unknown_user", ...context });
    return { error: GENERIC_FAILURE };
  }

  if (account.status === "inactive") {
    await recordLoginEvent({
      username,
      userId: account.id,
      outcome: "inactive_account",
      ...context,
    });
    return {
      error: "This account has been deactivated. Ask the owner to switch it back on.",
    };
  }

  // 3. The password itself. Uses the ordinary server client, not the admin one,
  //    so a success writes the session cookies for this browser.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToInternalEmail(username),
    password,
  });

  if (error) {
    await recordLoginEvent({
      username,
      userId: account.id,
      outcome: "wrong_password",
      ...context,
    });
    await recordAudit({
      actorId: account.id,
      actorUsername: username,
      action: "login_failed",
      entity: "profile",
      entityId: account.id,
      summary: `Failed sign-in attempt for ${username}`,
    });

    // Tell them how many tries are left - this account is known to exist to
    // whoever just typed its password wrong, so it leaks nothing new.
    const after = await readLockoutState(username);
    return {
      error: GENERIC_FAILURE,
      attemptsRemaining: after.attemptsRemaining,
    };
  }

  await recordLoginEvent({
    username,
    userId: account.id,
    outcome: "success",
    ...context,
  });
  await recordAudit({
    actorId: account.id,
    actorUsername: username,
    action: "login",
    entity: "profile",
    entityId: account.id,
    summary: `${account.fullName} signed in`,
  });

  // A temporary password must be changed before anything else (spec 4.1).
  redirect(account.mustChangePassword ? "/change-password" : next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .maybeSingle();

    await supabase.auth.signOut();

    if (profile) {
      await recordAudit({
        actorId: user.id,
        actorUsername: profile.username,
        action: "logout",
        entity: "profile",
        entityId: user.id,
        summary: `${profile.full_name} signed out`,
      });
    }
  }

  redirect("/login");
}
