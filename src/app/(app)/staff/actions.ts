"use server";

/**
 * Creating and managing accounts (spec 4.1, 4.2, 4.4).
 *
 * Every action here re-checks who is asking, because a Server Action is a web
 * endpoint: anyone signed in could call it directly, not only the people who
 * can see the button. The rules enforced here are also enforced by Row Level
 * Security, so a mistake in this file still cannot let an Admin edit the Owner.
 */
import { revalidatePath } from "next/cache";

import { diffFields, recordAudit } from "@/lib/audit";
import {
  checkUsername,
  generateTemporaryPassword,
  usernameToInternalEmail,
} from "@/lib/auth/credentials";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  DEFAULT_NEW_STAFF_PERMISSIONS,
  PERMISSIONS,
  assignableRoles,
  canEditAccount,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface StaffActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Shown once, so the owner can write it down and hand it over. */
  temporaryPassword?: { username: string; password: string };
  success?: string;
}

/** Reads the account being acted on, or explains why it is off limits. */
async function loadTarget(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, full_name, role, status, must_change_password")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function createAccountAction(
  _previous: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOwnerOrAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const requestedRole = String(formData.get("role") ?? "staff") as Role;
  const fieldErrors: Record<string, string> = {};

  const username = checkUsername(String(formData.get("username") ?? ""));
  if (!username.ok) fieldErrors.username = username.reason;
  if (fullName === "") fieldErrors.fullName = "Enter their full name.";

  // Only the Owner may create an Admin (spec 4.2).
  if (!assignableRoles(actor).includes(requestedRole)) {
    fieldErrors.role =
      actor.role === "admin"
        ? "Admins can only create staff accounts. Ask the owner to create an admin."
        : "Choose a role.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (!username.ok) return { fieldErrors };

  const admin = createSupabaseAdminClient();

  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username.username)
    .maybeSingle();

  if (taken) {
    return { fieldErrors: { username: "That username is already taken." } };
  }

  // Spec 4.1: a new account gets a temporary password and must change it.
  const temporaryPassword = generateTemporaryPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username.username),
    password: temporaryPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username: username.username,
    full_name: fullName,
    role: requestedRole,
    status: "active",
    must_change_password: true,
    created_by: actor.id,
  });

  if (profileError) {
    // Never leave a sign-in-able account without a profile.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Could not save the profile: ${profileError.message}` };
  }

  // Spec 4.3: new staff start with "Add sales (POS)" ticked and nothing else.
  const startingPermissions =
    requestedRole === "staff" ? DEFAULT_NEW_STAFF_PERMISSIONS : [];

  if (startingPermissions.length > 0) {
    await admin.from("user_permissions").insert(
      startingPermissions.map((permission) => ({
        user_id: created.user.id,
        permission,
        granted_by: actor.id,
      })),
    );
  }

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "profile",
    entityId: created.user.id,
    summary: `Created ${requestedRole} account "${username.username}" for ${fullName}`,
    after: { username: username.username, full_name: fullName, role: requestedRole },
  });

  revalidatePath("/staff");

  return {
    temporaryPassword: { username: username.username, password: temporaryPassword },
  };
}

export async function resetPasswordAction(
  _previous: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");

  const target = await loadTarget(userId);
  if (!target) return { error: "That account no longer exists." };

  if (!canEditAccount(actor, { role: target.role as Role })) {
    return {
      error:
        "Admins cannot reset the owner's password or another admin's. Only the owner can.",
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const admin = createSupabaseAdminClient();

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  });
  if (authError) return { error: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "password_reset",
    entity: "profile",
    entityId: userId,
    summary: `Reset the password for "${target.username}" to a temporary one`,
  });

  revalidatePath("/staff");

  return {
    temporaryPassword: { username: target.username, password: temporaryPassword },
  };
}

export async function setStatusAction(
  _previous: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  const nextStatus = String(formData.get("status") ?? "");

  if (nextStatus !== "active" && nextStatus !== "inactive") {
    return { error: "Choose active or inactive." };
  }

  const target = await loadTarget(userId);
  if (!target) return { error: "That account no longer exists." };

  if (target.role === "owner") {
    // Spec 4.2: the owner cannot be removed. Deactivating the only owner would
    // lock the shop out of its own system.
    return { error: "The owner account cannot be deactivated." };
  }

  if (!canEditAccount(actor, { role: target.role as Role })) {
    return { error: "Admins can only manage staff accounts." };
  }

  if (userId === actor.id) {
    return { error: "You cannot deactivate your own account." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status: nextStatus })
    .eq("id", userId);

  if (error) return { error: error.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: nextStatus === "active" ? "activate" : "deactivate",
    entity: "profile",
    entityId: userId,
    summary: `${nextStatus === "active" ? "Reactivated" : "Deactivated"} the account "${target.username}"`,
    before: { status: target.status },
    after: { status: nextStatus },
  });

  revalidatePath("/staff");

  return {
    success: `"${target.username}" is now ${nextStatus === "active" ? "active" : "deactivated"}.`,
  };
}

export async function updatePermissionsAction(
  _previous: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");

  const target = await loadTarget(userId);
  if (!target) return { error: "That account no longer exists." };

  if (!canEditAccount(actor, { role: target.role as Role })) {
    return { error: "Admins can only change staff permissions." };
  }

  if (target.role !== "staff") {
    return {
      error:
        "Owner and admin accounts are not limited by the checkboxes, so there is nothing to set.",
    };
  }

  // Only names from the known list, so a crafted form cannot invent one.
  const wanted = new Set(
    formData
      .getAll("permissions")
      .map(String)
      .filter((value): value is Permission =>
        (PERMISSIONS as readonly string[]).includes(value),
      ),
  );

  const admin = createSupabaseAdminClient();
  const { data: currentRows } = await admin
    .from("user_permissions")
    .select("permission")
    .eq("user_id", userId);

  const current = new Set((currentRows ?? []).map((row) => row.permission as Permission));

  const toGrant = [...wanted].filter((permission) => !current.has(permission));
  const toRevoke = [...current].filter((permission) => !wanted.has(permission));

  if (toGrant.length === 0 && toRevoke.length === 0) {
    return { success: "Nothing changed." };
  }

  if (toGrant.length > 0) {
    const { error } = await admin.from("user_permissions").insert(
      toGrant.map((permission) => ({
        user_id: userId,
        permission,
        granted_by: actor.id,
      })),
    );
    if (error) return { error: error.message };
  }

  if (toRevoke.length > 0) {
    const { error } = await admin
      .from("user_permissions")
      .delete()
      .eq("user_id", userId)
      .in("permission", toRevoke);
    if (error) return { error: error.message };
  }

  const changes = [
    toGrant.length > 0 ? `gave ${toGrant.join(", ")}` : null,
    toRevoke.length > 0 ? `took away ${toRevoke.join(", ")}` : null,
  ].filter(Boolean);

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: toGrant.length > 0 ? "permission_grant" : "permission_revoke",
    entity: "user_permissions",
    entityId: userId,
    summary: `For "${target.username}": ${changes.join("; ")}`,
    before: { permissions: [...current].sort() },
    after: { permissions: [...wanted].sort() },
  });

  revalidatePath("/staff");

  return { success: `Updated what "${target.username}" is allowed to do.` };
}

export async function renameAccountAction(
  _previous: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOwnerOrAdmin();
  const userId = String(formData.get("userId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (fullName === "") {
    return { fieldErrors: { fullName: "Enter their full name." } };
  }

  const target = await loadTarget(userId);
  if (!target) return { error: "That account no longer exists." };

  if (!canEditAccount(actor, { role: target.role as Role })) {
    return { error: "Admins can only edit staff accounts." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);

  if (error) return { error: error.message };

  const changed = diffFields(
    { full_name: target.full_name },
    { full_name: fullName },
  );

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "profile",
    entityId: userId,
    summary: `Renamed "${target.username}" from ${target.full_name} to ${fullName}`,
    before: changed.before,
    after: changed.after,
  });

  revalidatePath("/staff");

  return { success: `Saved. ${fullName} is now the name on record.` };
}
