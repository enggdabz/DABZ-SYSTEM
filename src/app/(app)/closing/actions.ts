"use server";

/**
 * Saving the end-of-day count (spec 15.2).
 *
 * The expected figure is worked out on the server from the day's ledger, never
 * taken from the browser - otherwise the count could be made to agree with
 * whatever is in the drawer.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { computeClosing } from "@/lib/closing";
import { getBills } from "@/lib/data/money";
import { getEstimatedMonthlyPayroll } from "@/lib/data/staff";
import { totalMonthlyBills } from "@/lib/bills";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { computeDailyTarget } from "@/lib/target";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { readDayTotals } from "./totals";

export interface ClosingState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

export async function saveClosingAction(
  _previous: ClosingState,
  formData: FormData,
): Promise<ClosingState> {
  const user = await requirePermission("add_sales");
  const settings = await getSettings();

  let countedCashCentavos: number;
  try {
    countedCashCentavos = parsePesos(String(formData.get("countedCash") ?? ""));
    if (countedCashCentavos < 0) throw new Error("negative");
  } catch {
    return { fieldErrors: { countedCash: "Enter the counted cash, like 4500." } };
  }

  const today = manilaToday();
  const [totals, bills, payroll] = await Promise.all([
    readDayTotals(today),
    getBills(),
    getEstimatedMonthlyPayroll(),
  ]);

  const target = computeDailyTarget({
    monthlyBillsCentavos: totalMonthlyBills(bills),
    monthlyPayrollCentavos: payroll.centavos,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  });

  const result = computeClosing({
    ...totals,
    countedCashCentavos,
    targetCentavos: target.targetCentavos,
  });

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("day_closings").upsert(
    {
      closing_date: civilDateToISO(today),
      expected_cash_centavos: result.expectedCashCentavos,
      counted_cash_centavos: result.countedCashCentavos,
      difference_centavos: result.differenceCentavos,
      gcash_centavos: totals.gcashCentavos,
      maya_centavos: totals.mayaCentavos,
      bank_centavos: totals.bankCentavos,
      total_sales_centavos: result.totalSalesCentavos,
      target_centavos: result.targetCentavos,
      target_reached: result.targetReached,
      note: String(formData.get("note") ?? "").trim() || null,
      created_by: user.id,
    },
    { onConflict: "closing_date" },
  );

  if (error) return { error: `Could not save the closing: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "day_closings",
    entityId: civilDateToISO(today),
    summary: result.balanced
      ? `Closed the day: drawer counted ${formatPesos(result.countedCashCentavos)} and matched`
      : `Closed the day: drawer ${result.short ? "short" : "over"} by ${formatPesos(
          Math.abs(result.differenceCentavos),
        )}`,
    after: {
      expected: result.expectedCashCentavos,
      counted: result.countedCashCentavos,
      difference: result.differenceCentavos,
    },
  });

  revalidatePath("/closing");
  revalidatePath("/overview");

  return {
    success: result.balanced
      ? "The drawer matches. Day closed."
      : `Saved. The drawer is ${result.short ? "short" : "over"} by ${formatPesos(
          Math.abs(result.differenceCentavos),
        )} - worth a look while today is still fresh.`,
  };
}
