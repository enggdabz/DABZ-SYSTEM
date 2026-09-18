"use server";

/**
 * Bills: marking paid, undoing, and editing (spec 12.1).
 *
 * Owner/Admin only, re-checked in every action - a Server Action is a public
 * endpoint, not a button.
 *
 * Marking paid and undoing both go through database functions so that the
 * payment, its ledger entry and any loan payment move together or not at all.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { MONEY_SOURCES, type MoneySource } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import {
  civilDateToISO,
  formatPeriod,
  manilaToday,
  parsePeriodKey,
  periodToMonthStartISO,
} from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface BillActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

function readMoneySource(value: unknown): MoneySource | null {
  const text = String(value ?? "");
  return (MONEY_SOURCES as readonly string[]).includes(text)
    ? (text as MoneySource)
    : null;
}

export async function markBillPaidAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const actor = await requireOwnerOrAdmin();

  const billId = String(formData.get("billId") ?? "");
  const periodKeyValue = String(formData.get("period") ?? "");
  const period = parsePeriodKey(periodKeyValue);
  if (!period) return { error: "That month is not valid." };

  const source = readMoneySource(formData.get("source"));
  if (!source) return { error: "Choose where the money came from." };

  let amountCentavos: number;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos < 0) throw new Error("negative");
  } catch {
    return { fieldErrors: { amount: "Enter an amount like 35000 or 35000.00." } };
  }

  const supabase = await createSupabaseServerClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("name, amount_centavos")
    .eq("id", billId)
    .maybeSingle();

  if (!bill) return { error: "That bill no longer exists." };

  const { error } = await supabase.rpc("mark_bill_paid", {
    p_bill_id: billId,
    p_period_month: periodToMonthStartISO(period),
    p_amount_centavos: amountCentavos,
    p_paid_on: civilDateToISO(manilaToday()),
    p_source: source,
    p_note: null,
  });

  if (error) {
    // The unique constraint is what stops a double payment, so say so plainly
    // rather than showing the database's own wording.
    if (error.message.includes("duplicate") || error.code === "23505") {
      return {
        error: `${bill.name} is already marked paid for ${formatPeriod(period)}.`,
      };
    }
    return { error: `Could not mark it paid: ${error.message}` };
  }

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "bill_payments",
    entityId: billId,
    summary: `Marked "${bill.name}" paid for ${formatPeriod(period)} - ${formatPesos(amountCentavos)} from ${source.replace(/_/g, " ")}`,
    after: { amount_centavos: amountCentavos, source, period: periodKeyValue },
  });

  revalidatePath("/bills");
  revalidatePath("/ledger");
  revalidatePath("/loans");
  revalidatePath("/overview");

  return { success: `${bill.name} is marked paid for ${formatPeriod(period)}.` };
}

export async function undoBillPaymentAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const actor = await requireOwnerOrAdmin();

  const billId = String(formData.get("billId") ?? "");
  const period = parsePeriodKey(String(formData.get("period") ?? ""));
  if (!period) return { error: "That month is not valid." };

  const supabase = await createSupabaseServerClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("name")
    .eq("id", billId)
    .maybeSingle();

  if (!bill) return { error: "That bill no longer exists." };

  const { error } = await supabase.rpc("undo_bill_payment", {
    p_bill_id: billId,
    p_period_month: periodToMonthStartISO(period),
    p_reason: `Mark paid undone by ${actor.username}`,
  });

  if (error) return { error: `Could not undo it: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "void",
    entity: "bill_payments",
    entityId: billId,
    summary: `Undid the payment of "${bill.name}" for ${formatPeriod(period)}`,
    before: { paid: true },
    after: { paid: false },
  });

  revalidatePath("/bills");
  revalidatePath("/ledger");
  revalidatePath("/loans");
  revalidatePath("/overview");

  return { success: `${bill.name} is no longer marked paid for ${formatPeriod(period)}.` };
}

/**
 * Sets the due day the owner still owes us (open decision 17.13).
 * This is the whole reason the Bills screen highlights a missing due day.
 */
export async function setDueDayAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const actor = await requireOwnerOrAdmin();

  const billId = String(formData.get("billId") ?? "");
  const raw = String(formData.get("dueDay") ?? "").trim();

  let dueDay: number | null = null;
  if (raw !== "") {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      return { fieldErrors: { dueDay: "Enter a day of the month from 1 to 31." } };
    }
    dueDay = parsed;
  }

  const supabase = await createSupabaseServerClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("name, due_day")
    .eq("id", billId)
    .maybeSingle();

  if (!bill) return { error: "That bill no longer exists." };

  const { error } = await supabase
    .from("bills")
    .update({ due_day: dueDay })
    .eq("id", billId);

  if (error) return { error: `Could not save the due day: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "bills",
    entityId: billId,
    summary:
      dueDay === null
        ? `Cleared the due day for "${bill.name}"`
        : `Set "${bill.name}" to fall due on day ${dueDay} of the month`,
    before: { due_day: bill.due_day },
    after: { due_day: dueDay },
  });

  revalidatePath("/bills");
  revalidatePath("/overview");

  return {
    success:
      dueDay === null
        ? `Cleared the due day for ${bill.name}.`
        : `${bill.name} now falls due on day ${dueDay}.`,
  };
}

export async function saveBillAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const actor = await requireOwnerOrAdmin();

  const billId = String(formData.get("billId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (name === "") fieldErrors.name = "Give the bill a name.";

  let amountCentavos = 0;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos < 0) throw new Error("negative");
  } catch {
    fieldErrors.amount = "Enter an amount like 2100 or 2100.00.";
  }

  const rawDueDay = String(formData.get("dueDay") ?? "").trim();
  let dueDay: number | null = null;
  if (rawDueDay !== "") {
    const parsed = Number(rawDueDay);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      fieldErrors.dueDay = "Enter a day from 1 to 31, or leave it blank.";
    } else {
      dueDay = parsed;
    }
  }

  const type = String(formData.get("type") ?? "operating");
  if (type !== "operating" && type !== "loan_installment") {
    fieldErrors.type = "Choose whether this is an operating cost or a loan installment.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createSupabaseServerClient();
  const values = {
    name,
    amount_centavos: amountCentavos,
    due_day: dueDay,
    type,
  };

  if (billId === "") {
    const { error } = await supabase
      .from("bills")
      .insert({ ...values, created_by: actor.id });
    if (error) return { error: `Could not add the bill: ${error.message}` };

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "create",
      entity: "bills",
      summary: `Added the bill "${name}" at ${formatPesos(amountCentavos)} a month`,
      after: values,
    });

    revalidatePath("/bills");
    revalidatePath("/overview");
    return { success: `Added ${name}.` };
  }

  const { data: before } = await supabase
    .from("bills")
    .select("name, amount_centavos, due_day, type")
    .eq("id", billId)
    .maybeSingle();

  const { error } = await supabase.from("bills").update(values).eq("id", billId);
  if (error) return { error: `Could not save the bill: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "bills",
    entityId: billId,
    summary: `Changed the bill "${name}"`,
    before: before ?? undefined,
    after: values,
  });

  revalidatePath("/bills");
  revalidatePath("/overview");
  return { success: `Saved ${name}.` };
}

export async function setBillActiveAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const actor = await requireOwnerOrAdmin();

  const billId = String(formData.get("billId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const supabase = await createSupabaseServerClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("name")
    .eq("id", billId)
    .maybeSingle();

  if (!bill) return { error: "That bill no longer exists." };

  // Deactivated rather than deleted, so its payment history survives.
  const { error } = await supabase.from("bills").update({ active }).eq("id", billId);
  if (error) return { error: error.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: active ? "activate" : "deactivate",
    entity: "bills",
    entityId: billId,
    summary: `${active ? "Reactivated" : "Stopped"} the bill "${bill.name}"`,
    before: { active: !active },
    after: { active },
  });

  revalidatePath("/bills");
  revalidatePath("/overview");

  return {
    success: active
      ? `${bill.name} is back in the monthly bills.`
      : `${bill.name} is no longer counted in the monthly bills. Its history is kept.`,
  };
}
