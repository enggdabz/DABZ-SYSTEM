"use server";

/**
 * Saving the shop settings (spec 17.5, 17.8).
 *
 * Owner and Admin only, re-checked here because a Server Action is reachable by
 * anyone signed in, not only by whoever can see the form.
 */
import { revalidatePath } from "next/cache";

import { diffFields, recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { isColumnMissingFromApi } from "@/lib/postgrest";
import {
  settingsToRow,
  validateSettingsForm,
  type SettingsRow,
} from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SettingsFormState {
  error?: string;
  /** The longer half, when knowing what to DO needs more than one line. */
  errorDetail?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

export async function saveSettingsAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const actor = await requireOwnerOrAdmin();

  const result = validateSettingsForm({
    workingDaysPerMonth: String(formData.get("workingDaysPerMonth") ?? ""),
    weekStartsOn: String(formData.get("weekStartsOn") ?? ""),
    workDayStart: String(formData.get("workDayStart") ?? ""),
    workDayEnd: String(formData.get("workDayEnd") ?? ""),
    autoLogoutMinutes: String(formData.get("autoLogoutMinutes") ?? ""),
    // A checkbox sends nothing at all when it is unticked.
    staffStaySignedIn: formData.get("staffStaySignedIn") !== null,
    staffExpenseApprovalLimitPesos: String(
      formData.get("staffExpenseApprovalLimitPesos") ?? "",
    ),
    staffDiscountLimitPercent: String(formData.get("staffDiscountLimitPercent") ?? ""),
    staffDiscountLimitPesos: String(formData.get("staffDiscountLimitPesos") ?? ""),
    defaultWarrantyDays: String(formData.get("defaultWarrantyDays") ?? ""),
    unclaimedUnitDays: String(formData.get("unclaimedUnitDays") ?? ""),
    receiptPaper: String(formData.get("receiptPaper") ?? ""),
    apparelDownPaymentPercent: String(
      formData.get("apparelDownPaymentPercent") ?? "",
    ),
    shopAddress: String(formData.get("shopAddress") ?? ""),
    shopPhone: String(formData.get("shopPhone") ?? ""),
    shopEmail: String(formData.get("shopEmail") ?? ""),
    facebookPageUrl: String(formData.get("facebookPageUrl") ?? ""),
    messengerUsername: String(formData.get("messengerUsername") ?? ""),
    mapUrl: String(formData.get("mapUrl") ?? ""),
    publicOpeningHours: String(formData.get("publicOpeningHours") ?? ""),
    publicPageEnabled: formData.get("publicPageEnabled") !== null,
  });

  if (!result.ok) {
    return { fieldErrors: result.errors };
  }

  // The ordinary client, so Row Level Security has the final say on whether
  // this person may write settings.
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const nextRow = settingsToRow(result.settings);

  const { error } = await supabase
    .from("app_settings")
    .update({ ...nextRow, updated_by: actor.id })
    .eq("id", 1);

  if (error) {
    /*
      The form writes every column at once, so one column the database has not
      got yet stops the whole screen saving - a setting typed months ago
      included. That is worth its own message: the app deploys when a branch
      merges, `npm run db:push` is run by hand afterwards, and in between this
      is exactly what the owner sees.
    */
    if (isColumnMissingFromApi(error)) {
      return {
        error:
          "Could not save the settings: your database is missing a column this version stores.",
        errorDetail:
          "Nothing was changed. In the Supabase SQL editor run " +
          "notify pgrst, 'reload schema'; and if that does not help, the " +
          "migrations have not been applied, so run npm run db:push. Then save " +
          `again. [${error.message}]`,
      };
    }

    return { error: `Could not save the settings: ${error.message}` };
  }

  // Record only what actually changed, so the log stays readable.
  const changed = existing
    ? diffFields(
        existing as unknown as Record<string, unknown>,
        { ...(existing as object), ...nextRow } as Record<string, unknown>,
      )
    : { before: {}, after: nextRow, changedKeys: Object.keys(nextRow) };

  if (changed.changedKeys.length > 0) {
    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "update",
      entity: "app_settings",
      entityId: "1",
      summary: `Changed settings: ${changed.changedKeys.join(", ")}`,
      before: changed.before,
      after: changed.after,
    });
  }

  revalidatePath("/settings");
  revalidatePath("/overview");

  return {
    success:
      changed.changedKeys.length > 0
        ? "Settings saved."
        : "Nothing changed, but the settings are saved.",
  };
}

export type { SettingsRow };
