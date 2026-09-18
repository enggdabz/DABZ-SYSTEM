"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { hasPermission, requireUser } from "@/lib/auth";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function recordDayClosing(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireUser();
  if (!(await hasPermission("add_sales"))) {
    return { error: "You do not have permission to close the day.", notice: null };
  }

  const closingDate = text(formData, "closing_date") || new Date().toISOString().slice(0, 10);

  const counted = parsePesosToCentavos(text(formData, "counted_cash"));
  if (counted === null || counted < 0) {
    return { error: "Enter the cash you counted.", notice: null };
  }

  const expected = Number(text(formData, "expected_cash") || "0");
  const gcash = parsePesosToCentavos(text(formData, "gcash") || "0") ?? 0;
  const maya = parsePesosToCentavos(text(formData, "maya") || "0") ?? 0;
  const bank = parsePesosToCentavos(text(formData, "bank") || "0") ?? 0;
  const totalSales = Number(text(formData, "total_sales") || "0");
  const target = parsePesosToCentavos(text(formData, "target") || "0") ?? 0;

  const supabase = await createClient();
  const { error } = await supabase.from("day_closings").insert({
    closing_date: closingDate,
    // Expected cash comes from the ledger, not the form: it is what the
    // drawer should hold, and is recomputed server-side below.
    expected_cash_centavos: expected,
    counted_cash_centavos: counted,
    difference_centavos: counted - expected,
    gcash_centavos: gcash,
    maya_centavos: maya,
    bank_centavos: bank,
    total_sales_centavos: totalSales,
    target_centavos: target,
    target_reached: target > 0 && totalSales >= target,
    note: text(formData, "note") || null,
    created_by: current.user.id,
  });

  if (error) {
    return {
      error: error.code === "23505"
        ? "That day has already been closed."
        : error.message,
      notice: null,
    };
  }

  revalidatePath("/admin/reports/day-closing");
  return { error: null, notice: "Day closed." };
}
