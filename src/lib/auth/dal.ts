import "server-only";

/**
 * The Data Access Layer: the one place that answers "who is asking?".
 *
 * Next.js recommends checking permission as close to the data as possible,
 * rather than trusting a check made earlier in the request. So every screen and
 * every action calls one of these functions rather than reading cookies itself.
 *
 * `cache` means that during a single page render this work happens once, even
 * if five different components ask who the person is.
 */
import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, settingsFromRow, type AppSettings, type SettingsRow } from "@/lib/settings";
import {
  can,
  isOwnerOrAdmin,
  type Actor,
  type Permission,
  type Role,
} from "./permissions";

export interface SignedInUser extends Actor {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
}

/**
 * Who is signed in, or null.
 *
 * Uses getUser(), which asks Supabase to verify the token, rather than reading
 * the cookie's contents and believing them.
 */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    // Supabase is not configured yet (Phase 0 state). Nobody is signed in.
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  /*
    Both rows are asked for at once rather than one after the other.
    Supabase is a network call away, so every `await` in a row is another
    round trip added to EVERY screen before it can start on its own figures -
    that is most of what made tapping a section feel dead.

    Asking for the permissions before knowing the profile exists costs one
    wasted query in the rare case below, which is worth a round trip saved on
    every ordinary page view.
  */
  const [{ data: profile }, { data: permissionRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, role, status, must_change_password")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_permissions").select("permission").eq("user_id", user.id),
  ]);

  // A signed-in Auth user with no profile row cannot use the system: the
  // profile is what grants a role. Treat it as not signed in.
  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role as Role,
    status: profile.status === "inactive" ? "inactive" : "active",
    mustChangePassword: profile.must_change_password,
    permissions: (permissionRows ?? []).map((row) => row.permission as Permission),
  };
});

/**
 * Requires a signed-in, active account, and that any forced password change is
 * done. Redirects instead of returning null, so a screen that calls this can
 * treat the result as certain.
 */
export const requireUser = cache(async (): Promise<SignedInUser> => {
  const user = await getSignedInUser();

  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?reason=inactive");
  if (user.mustChangePassword) redirect("/change-password");

  return user;
});

/** Requires Owner or Admin (spec 4.3: bills, payroll, settings, reports). */
export const requireOwnerOrAdmin = cache(async (): Promise<SignedInUser> => {
  const user = await requireUser();
  if (!isOwnerOrAdmin(user)) redirect("/overview?denied=1");
  return user;
});

/** Requires the Owner specifically (spec 4.2: creating and removing Admins). */
export const requireOwner = cache(async (): Promise<SignedInUser> => {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/overview?denied=1");
  return user;
});

/** Requires one of the permission checkboxes (spec 4.3). */
export async function requirePermission(
  permission: Permission,
): Promise<SignedInUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/overview?denied=1");
  return user;
}

/**
 * The shop settings. Falls back to the specification's defaults if the row
 * cannot be read, so a screen never crashes over a missing setting.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return DEFAULT_SETTINGS;
    return settingsFromRow(data as SettingsRow);
  } catch {
    return DEFAULT_SETTINGS;
  }
});
