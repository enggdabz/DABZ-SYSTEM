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

/**
 * True when the database has not had `npm run db:push` run against it since
 * this fix landed. PostgREST answers an unknown function with PGRST202, and
 * telling the owner exactly which command to run beats "unknown error".
 */
function missingFunction(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST202" || /finish_password_change/.test(error.message);
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

  /*
    The temporary password is now gone, so the forced-change flag can be
    cleared.

    This goes through a database function rather than an update on `profiles`,
    because NOBODY may update their own profile row - there is no policy for
    it, on purpose, since a policy that allowed it would also allow a staff
    member to set their own role. An update that no policy matches is not an
    error in PostgreSQL: it just changes nothing. That is what made this a
    loop - the password changed, the flag did not, and the next screen sent
    them back here.

    So the failure is reported rather than redirected past. A person stuck on
    this screen with a message can be helped; a person stuck on this screen
    in silence cannot.
  */
  const { error: flagError } = await supabase.rpc("finish_password_change");

  if (flagError) {
    return {
      error: missingFunction(flagError)
        ? 'Your new password was saved, but the database has not been updated with the fix for the "change your password" loop yet. Run `npm run db:push`, then sign in again with your NEW password.'
        : `Your new password was saved, but the system could not finish the change: ${flagError.message}`,
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

  redirect("/overview?password_changed=1");
}
