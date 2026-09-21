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
import { doorViewer } from "@/lib/auth/permissions";
import { doorVisibility } from "@/lib/collections";
import type { DivisionId } from "@/lib/divisions";
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
  const [totals, dayBreakdown, bills, payroll] = await Promise.all([
    readDayTotals(today),
    readDayBreakdown(today),
    getBills(),
    getEstimatedMonthlyPayroll(),
  ]);

  const { breakdown, partial: breakdownPartial } = dayBreakdown;

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
  /*
    A DOOR THIS PERSON CANNOT SEE IS STORED AS NULL, NEVER AS ZERO.

    The feed is `security_invoker`, so a counter assistant with only Add sales
    reads nothing from Apparel or DabzTech and only their OWN counter sales.
    Writing `?? 0` for those froze a claim into the row - the owner opens End
    of day next week and reads "Apparel PHP 0.00" for a day that took PHP
    8,000, with nothing to say the closer simply could not see it. The columns
    are nullable for exactly this, and null reads as "not recorded".

    The same applies when the read failed or hit its cap: then nobody knows
    what any door took, so every door goes in as null.
  */
  const viewer = doorViewer(user);

  const door = (division: DivisionId) =>
    !breakdownPartial && doorVisibility(division, viewer) === "all"
      ? breakdown.divisions.find((entry) => entry.division === division) ?? null
      : null;

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

      counter_cash_centavos: counter ? counter.bySource.cash_drawer : null,
      counter_total_centavos: counter ? counter.totalCentavos : null,

      apparel_cash_centavos: apparel ? apparel.bySource.cash_drawer : null,
      apparel_total_centavos: apparel ? apparel.totalCentavos : null,
      apparel_down_payment_centavos: apparel ? apparel.downPaymentCentavos : null,
      apparel_balance_centavos: apparel ? apparel.balanceCentavos : null,

      dabztech_cash_centavos: dabztech ? dabztech.bySource.cash_drawer : null,
      dabztech_total_centavos: dabztech ? dabztech.totalCentavos : null,
      dabztech_down_payment_centavos: dabztech ? dabztech.downPaymentCentavos : null,
      dabztech_balance_centavos: dabztech ? dabztech.balanceCentavos : null,

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
