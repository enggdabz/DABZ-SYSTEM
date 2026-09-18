"use server";

/**
 * First-time setup: creating the owner account (spec 4.1).
 *
 * There is no public sign-up in this system, which leaves a chicken-and-egg
 * problem: the first account cannot be created by someone who is signed in.
 *
 * This page solves it and then closes behind itself. It refuses to do anything
 * once ANY profile exists, so it works exactly once in the life of the shop.
 * After that, accounts are created from the Staff screen by the Owner or Admin.
 */
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import {
  checkPassword,
  checkUsername,
  usernameToInternalEmail,
} from "@/lib/auth/credentials";
import { createSupabaseAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

export interface SetupState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function countProfiles(): Promise<number | null> {
  if (!isAdminClientConfigured()) return null;
  try {
    const admin = createSupabaseAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function createOwnerAction(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (!isAdminClientConfigured()) {
    return {
      error:
        "The system is not connected to its database yet. Follow docs/SETUP.md, including the service-role key.",
    };
  }

  // The gate: if anyone already has an account, this page is closed forever.
  const existing = await countProfiles();
  if (existing === null) {
    return { error: "Could not check the existing accounts. Is the database reachable?" };
  }
  if (existing > 0) {
    return {
      error:
        "Accounts already exist, so first-time setup is closed. Sign in instead, or ask the owner to create your account.",
    };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: Record<string, string> = {};

  const username = checkUsername(String(formData.get("username") ?? ""));
  if (!username.ok) fieldErrors.username = username.reason;

  if (fullName === "") fieldErrors.fullName = "Enter your full name.";

  const passwordCheck = checkPassword(password);
  if (!passwordCheck.ok) fieldErrors.password = passwordCheck.reason;

  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "The two passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (!username.ok) return { fieldErrors }; // for the type checker

  const admin = createSupabaseAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username.username),
    password,
    // Nothing is ever emailed to these internal addresses, so there is nothing
    // to confirm.
    email_confirm: true,
  });

  if (createError || !created.user) {
    return {
      error: createError?.message ?? "Could not create the account.",
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username: username.username,
    full_name: fullName,
    role: "owner",
    status: "active",
    // The owner chose this password themselves, so there is nothing to change.
    must_change_password: false,
    created_by: created.user.id,
  });

  if (profileError) {
    // Do not leave a sign-in-able account with no profile behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Could not save the owner profile: ${profileError.message}` };
  }

  await recordAudit({
    actorId: created.user.id,
    actorUsername: username.username,
    action: "create",
    entity: "profile",
    entityId: created.user.id,
    summary: `First-time setup created the owner account "${username.username}" for ${fullName}`,
    after: { username: username.username, full_name: fullName, role: "owner" },
  });

  redirect("/login?created=1");
}
