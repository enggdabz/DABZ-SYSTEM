import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isAppRole, type AppRole, type Permission, type Profile } from "@/lib/types/app";

/**
 * Current user and profile, deduplicated per request.
 *
 * These checks mirror public.current_role_name() and public.has_permission()
 * in the database. Row level security is still the real boundary — this only
 * decides what to render.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: (profile as Profile | null) ?? null };
});

export async function requireUser() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const { profile } = current;
  // A deactivated account keeps its session but must not reach the app.
  if (!profile || profile.status !== "active") redirect("/login?error=inactive");

  const role: AppRole = isAppRole(profile.role) ? profile.role : "staff";
  return { ...current, profile, role };
}

export async function requireRole(roles: readonly AppRole[]) {
  const current = await requireUser();
  if (!roles.includes(current.role)) redirect("/portal");
  return current;
}

/** Mirrors public.has_permission(): owner and admin bypass the checkboxes. */
export const hasPermission = cache(async (permission: Permission) => {
  const current = await getCurrentUser();
  if (!current?.profile || current.profile.status !== "active") return false;
  if (current.profile.role === "owner" || current.profile.role === "admin") return true;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_permissions")
    .select("permission")
    .eq("user_id", current.user.id)
    .eq("permission", permission)
    .maybeSingle();

  return Boolean(data);
});
