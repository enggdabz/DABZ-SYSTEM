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

import { readDayBreakdown, readDayTotals } from "./totals";

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
  const [totals, breakdown, bills, payroll] = await Promise.all([
    readDayTotals(today),
    readDayBreakdown(today),
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

  /*
    The breakdown is frozen onto the row alongside the count (Phase 10).

    Everything else here is already a snapshot - the day's figures as they were
    at the moment somebody counted the drawer - and the breakdown has to be one
    too. A void tomorrow changes what the feed says about today, and the point
    of a closing is to record what was believed when the cash was counted.
  */
  const door = (division: "printshoppe" | "apparel" | "dabztech") =>
    breakdown.divisions.find((entry) => entry.division === division);

  const counter = door("printshoppe");
  const apparel = door("apparel");
  const dabztech = door("dabztech");

  const { error } = await supabase.from("day_closings").upsert(
    {
      closing_date: civilDateToISO(today),
      expected_cash_centavos: result.expectedCashCentavos,
      counted_cash_centavos: result.countedCashCentavos,
      difference_centavos: result.differenceCentavos,
      gcash_centavos: totals.gcashCentavos,
      maya_centavos: totals.mayaCentavos,
      bank_centavos: totals.bankCentavos,
      owners_pocket_centavos: totals.ownersPocketCentavos,
      total_sales_centavos: result.totalSalesCentavos,
      target_centavos: result.targetCentavos,
      target_reached: result.targetReached,

      counter_cash_centavos: counter?.bySource.cash_drawer ?? 0,
      counter_total_centavos: counter?.totalCentavos ?? 0,

      apparel_cash_centavos: apparel?.bySource.cash_drawer ?? 0,
      apparel_total_centavos: apparel?.totalCentavos ?? 0,
      apparel_down_payment_centavos: apparel?.downPaymentCentavos ?? 0,
      apparel_balance_centavos: apparel?.balanceCentavos ?? 0,

      dabztech_cash_centavos: dabztech?.bySource.cash_drawer ?? 0,
      dabztech_total_centavos: dabztech?.totalCentavos ?? 0,
      dabztech_down_payment_centavos: dabztech?.downPaymentCentavos ?? 0,
      dabztech_balance_centavos: dabztech?.balanceCentavos ?? 0,

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
