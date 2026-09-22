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
  saveSettingsRow,
  settingsColumnLabel,
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
  /** Saved, but not all of it - which settings did not stick, and why. */
  warning?: string;
  warningDetail?: string;
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
    onlineNotifyEmail: String(formData.get("onlineNotifyEmail") ?? ""),
    onlineDailyCapacityPcs: String(formData.get("onlineDailyCapacityPcs") ?? ""),
    onlineMonthlyTargetPesos: String(formData.get("onlineMonthlyTargetPesos") ?? ""),
    onlineMinDaysAhead: String(formData.get("onlineMinDaysAhead") ?? ""),
    onlineShowStepsToCustomers: formData.get("onlineShowStepsToCustomers") !== null,
    onlineShopEnabled: formData.get("onlineShopEnabled") !== null,
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

  /*
    The form writes every column at once, so ONE column the database has not
    got yet used to stop the whole screen saving - a warranty period typed that
    morning included. The app deploys when a branch merges and
    `npm run db:push` is run by hand afterwards, so that gap is a normal
    Tuesday, not an exotic failure.

    `saveSettingsRow` drops a column the database does not recognise and sends
    the write again. What it dropped is reported below - never silently,
    because a setting that quietly did not save is worse than one that visibly
    refused.
  */
  const { error, skipped } = await saveSettingsRow(
    { ...nextRow, updated_by: actor.id },
    async (row) => {
      const { error: refused } = await supabase
        .from("app_settings")
        .update(row)
        .eq("id", 1);
      return refused;
    },
  );

  if (error) {
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

  /*
    Record only what actually changed, so the log stays readable - and only
    what actually REACHED the database. A dropped column never landed, so the
    audit log must not claim it did; that log is what a disagreement about
    settings is settled by.
  */
  const written = Object.fromEntries(
    Object.entries(nextRow).filter(([column]) => !skipped.includes(column)),
  );

  const changed = existing
    ? diffFields(
        existing as unknown as Record<string, unknown>,
        { ...(existing as object), ...written } as Record<string, unknown>,
      )
    : { before: {}, after: written, changedKeys: Object.keys(written) };

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

  const success =
    changed.changedKeys.length > 0
      ? "Settings saved."
      : "Nothing changed, but the settings are saved.";

  if (skipped.length > 0) {
    // Named in the words on the form, not in column names: the owner is being
    // told which box did not stick, and "staff_stay_signed_in" is not a box.
    const names = skipped.map(settingsColumnLabel).join(", ");

    return {
      success,
      warning: `Saved, except: ${names}.`,
      warningDetail:
        `Your database does not have ${skipped.length === 1 ? "that setting" : "those settings"} yet, so ` +
        `${skipped.length === 1 ? "it was" : "they were"} left out rather than stopping the rest from saving. ` +
        "Everything else on this screen is saved. To finish the rest, run npm run db:push " +
        "against this database - or in the Supabase SQL editor run notify pgrst, 'reload schema'; " +
        "first, in case the migration is applied and only the API has not noticed. " +
        "Then set it again here. Until then it keeps whatever the database already had.",
    };
  }

  return { success };
}

export type { SettingsRow };
