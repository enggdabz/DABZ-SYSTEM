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
import { isFunctionMissingFromApi } from "@/lib/postgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ChangePasswordState {
  error?: string;
  /** Shown under `error`, for a failure the person has to hand to the owner. */
  errorDetail?: string;
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
    /*
      Two failures, two different fixes, and the person reading this may be a
      staff member who can do neither - so the screen tells them what to show
      the owner rather than pretending they can act on it.

      The first version of this message named only `npm run db:push`, which is
      wrong half the time: PostgREST answers PGRST202 both when the function is
      genuinely absent AND when it is merely serving a cache built before the
      function existed. An owner who had already applied the migration was told
      to apply it again, with nothing on screen to suggest otherwise.
    */
    if (isFunctionMissingFromApi(flagError)) {
      return {
        error: "Your new password was saved, but the system could not finish the change.",
        errorDetail:
          "Show this to the owner. Supabase cannot see finish_password_change. " +
          "In the SQL editor run: notify pgrst, 'reload schema'; - and if that " +
          "does not help, the migrations have not been applied, so run npm run " +
          "db:push. Then sign in again with your NEW password, not the " +
          "temporary one.",
      };
    }

    return {
      error: "Your new password was saved, but the system could not finish the change.",
      errorDetail: `Show this to the owner: ${flagError.message}`,
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
