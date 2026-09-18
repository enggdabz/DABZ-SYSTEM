"use server";

/**
 * Changing your own password (spec 4.1).
 *
 * Used both for the forced change after a temporary password, and whenever
 * someone wants to change it later. Nobody can read a password, so there is no
 * "show me my password" - only "set a new one".
 */
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { checkPassword } from "@/lib/auth/credentials";
import { getSignedInUser } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await getSignedInUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: Record<string, string> = {};

  const check = checkPassword(password);
  if (!check.ok) fieldErrors.password = check.reason;
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "The two passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { error: updateError.message };
  }

  // The temporary password is now gone, so the forced-change flag can be
  // cleared. Own-row updates are allowed by the profiles policies.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (profileError) {
    return {
      error: `Your password was changed, but the system could not clear the "must change password" flag: ${profileError.message}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "password_change",
    entity: "profile",
    entityId: user.id,
    summary: `${user.fullName} changed their own password`,
  });

  redirect("/?password_changed=1");
}
