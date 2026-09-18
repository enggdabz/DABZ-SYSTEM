"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { usernameEmailDomain } from "@/lib/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { PERMISSIONS, type AppRole, type Permission } from "@/lib/types/app";


const USERNAME_PATTERN = /^[a-z0-9]([a-z0-9._-]{1,28})[a-z0-9]$/;

/**
 * An admin may only ever act on staff, matching the
 * profiles_update_staff_by_admin policy. Owners may act on anyone.
 */
function mayManage(actorRole: AppRole, targetRole: AppRole): boolean {
  if (actorRole === "owner") return true;
  return actorRole === "admin" && targetRole === "staff";
}

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "staff") as AppRole;

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        "Username must be 3–30 characters: lowercase letters, numbers, dots, hyphens or underscores, starting and ending with a letter or number.",
      notice: null,
    };
  }
  if (!fullName) return { error: "Enter a full name.", notice: null };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", notice: null };
  }
  if (!mayManage(actor.role, role)) {
    return { error: "You may only create staff accounts.", notice: null };
  }

  // Creating an account needs the service role twice over: auth.admin is not
  // reachable as the signed-in user, and profiles has no insert policy.
  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: `${username}@${usernameEmailDomain()}`,
    password,
    email_confirm: true,
  });
  if (authError || !created.user) {
    const duplicate = /already|registered|exists/i.test(authError?.message ?? "");
    return {
      error: duplicate ? "That username is already taken." : "Could not create the account.",
      notice: null,
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    full_name: fullName,
    role,
    status: "active",
    must_change_password: true,
    created_by: actor.user.id,
  });

  if (profileError) {
    // Leaving an auth user with no profile would block the username forever.
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      error:
        profileError.code === "23505"
          ? "That username is already taken."
          : "Could not create the profile.",
      notice: null,
    };
  }

  await recordAudit({
    actorId: actor.user.id,
    actorUsername: actor.profile.username,
    action: "create",
    entity: "profiles",
    entityId: created.user.id,
    summary: `Created ${role} account ${username}`,
    after: { username, full_name: fullName, role },
  });

  revalidatePath("/admin/settings/users");
  return { error: null, notice: `Account ${username} created.` };
}

export async function setUserStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const next = String(formData.get("status") ?? "");

  if (next !== "active" && next !== "inactive") {
    return { error: "Unknown status.", notice: null };
  }
  if (userId === actor.user.id) {
    return { error: "You cannot deactivate your own account.", notice: null };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", userId)
    .maybeSingle();

  if (!target) return { error: "Account not found.", notice: null };
  if (!mayManage(actor.role, target.role as AppRole)) {
    return { error: "You may only change staff accounts.", notice: null };
  }

  // Row level security enforces the same rule again on this update.
  const { error } = await supabase
    .from("profiles")
    .update({ status: next })
    .eq("id", userId);
  if (error) return { error: "Could not update the account.", notice: null };

  await recordAudit({
    actorId: actor.user.id,
    actorUsername: actor.profile.username,
    action: next === "active" ? "activate" : "deactivate",
    entity: "profiles",
    entityId: userId,
    summary: `${next === "active" ? "Activated" : "Deactivated"} ${target.username}`,
  });

  revalidatePath("/admin/settings/users");
  return { error: null, notice: `${target.username} is now ${next}.` };
}

export async function togglePermission(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const permission = String(formData.get("permission") ?? "") as Permission;
  const grant = formData.get("grant") === "true";

  if (!PERMISSIONS.includes(permission)) {
    return { error: "Unknown permission.", notice: null };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", userId)
    .maybeSingle();

  if (!target) return { error: "Account not found.", notice: null };
  if (target.role !== "staff") {
    return {
      error: "Owners and admins already have full access.",
      notice: null,
    };
  }
  if (!mayManage(actor.role, target.role as AppRole)) {
    return { error: "You may only change staff accounts.", notice: null };
  }

  const { error } = grant
    ? await supabase
        .from("user_permissions")
        .upsert(
          { user_id: userId, permission, granted_by: actor.user.id },
          { onConflict: "user_id,permission" },
        )
    : await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("permission", permission);

  if (error) return { error: "Could not update permissions.", notice: null };

  await recordAudit({
    actorId: actor.user.id,
    actorUsername: actor.profile.username,
    action: grant ? "permission_grant" : "permission_revoke",
    entity: "user_permissions",
    entityId: userId,
    summary: `${grant ? "Granted" : "Revoked"} ${permission} for ${target.username}`,
  });

  revalidatePath("/admin/settings/users");
  return { error: null, notice: null };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", notice: null };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", userId)
    .maybeSingle();

  if (!target) return { error: "Account not found.", notice: null };
  if (!mayManage(actor.role, target.role as AppRole)) {
    return { error: "You may only change staff accounts.", notice: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: "Could not reset the password.", notice: null };

  // They chose this password, not its owner, so it must be replaced on use.
  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);

  await recordAudit({
    actorId: actor.user.id,
    actorUsername: actor.profile.username,
    action: "password_reset",
    entity: "profiles",
    entityId: userId,
    summary: `Reset password for ${target.username}`,
  });

  revalidatePath("/admin/settings/users");
  return { error: null, notice: `Password reset for ${target.username}.` };
}

export async function saveShopSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);

  const text = (field: string) => {
    const value = String(formData.get(field) ?? "").trim();
    return value === "" ? null : value;
  };
  const int = (field: string) => {
    const value = String(formData.get(field) ?? "").trim();
    if (value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  };

  const workingDays = int("working_days_per_month");
  const autoLogout = int("auto_logout_minutes");
  const warrantyDays = int("default_warranty_days");
  const unclaimedDays = int("unclaimed_unit_days");
  const discountPercent = int("staff_discount_limit_percent");
  const downPayment = int("apparel_down_payment_percent");
  const weekStartsOn = String(formData.get("week_starts_on") ?? "monday");
  const receiptPaper = String(formData.get("receipt_paper") ?? "thermal_58");

  // Mirrors of the CHECK constraints, so a bad value is explained here rather
  // than coming back as a database error.
  if (workingDays !== null && (workingDays < 1 || workingDays > 31)) {
    return { error: "Working days per month must be between 1 and 31.", notice: null };
  }
  if (autoLogout !== null && (autoLogout < 1 || autoLogout > 480)) {
    return { error: "Auto logout must be between 1 and 480 minutes.", notice: null };
  }
  if (warrantyDays !== null && warrantyDays < 0) {
    return { error: "Warranty days cannot be negative.", notice: null };
  }
  if (unclaimedDays !== null && unclaimedDays < 0) {
    return { error: "Unclaimed unit days cannot be negative.", notice: null };
  }
  if (discountPercent !== null && (discountPercent < 0 || discountPercent > 100)) {
    return { error: "Staff discount limit must be between 0 and 100 percent.", notice: null };
  }
  if (downPayment !== null && (downPayment < 0 || downPayment > 100)) {
    return { error: "Down payment must be between 0 and 100 percent.", notice: null };
  }
  if (weekStartsOn !== "monday" && weekStartsOn !== "sunday") {
    return { error: "Week must start on Monday or Sunday.", notice: null };
  }
  if (!["thermal_58", "thermal_80", "bond_short"].includes(receiptPaper)) {
    return { error: "Unknown receipt paper size.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      shop_address: text("shop_address"),
      shop_phone: text("shop_phone"),
      shop_email: text("shop_email"),
      facebook_page_url: text("facebook_page_url"),
      messenger_username: text("messenger_username"),
      map_url: text("map_url"),
      public_opening_hours: text("public_opening_hours"),
      public_page_enabled: formData.get("public_page_enabled") === "on",
      week_starts_on: weekStartsOn,
      receipt_paper: receiptPaper,
      working_days_per_month: workingDays ?? undefined,
      auto_logout_minutes: autoLogout ?? undefined,
      default_warranty_days: warrantyDays ?? undefined,
      unclaimed_unit_days: unclaimedDays ?? undefined,
      // staff_discount_limit_percent is NOT NULL, so a blank field leaves it
      // unchanged; apparel_down_payment_percent is nullable and may be cleared.
      staff_discount_limit_percent: discountPercent ?? undefined,
      apparel_down_payment_percent: downPayment,
      updated_by: actor.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) return { error: "Could not save settings.", notice: null };

  await recordAudit({
    actorId: actor.user.id,
    actorUsername: actor.profile.username,
    action: "update",
    entity: "app_settings",
    entityId: null,
    summary: "Updated shop settings",
  });

  revalidatePath("/admin/settings/shop");
  return { error: null, notice: "Settings saved." };
}
