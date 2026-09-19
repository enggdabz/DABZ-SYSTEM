"use server";

/**
 * Bills: marking paid, undoing, editing and deleting (spec 12.1).
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
import { billLoanLink, type BillType } from "@/lib/bills";
import { deleteRefusal, deleteVanished } from "@/lib/deletable";
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

  /*
    The loan this bill pays down, which `mark_bill_paid` needs in order to
    reduce the balance in the same transaction (spec 12.1). Without it a bill
    labelled "Loan installment" takes money out of the ledger every month and
    leaves the debt exactly where it was - silently, because nothing looks
    wrong. `billLoanLink` is also what clears the link when a bill is changed
    back to an operating cost.
  */
  const loanId = billLoanLink(type as BillType, String(formData.get("loanId") ?? ""));

  if (loanId !== null) {
    const { data: loan } = await supabase
      .from("loans")
      .select("id")
      .eq("id", loanId)
      .maybeSingle();

    if (!loan) {
      return { fieldErrors: { loanId: "That loan no longer exists. Choose another." } };
    }
  }

  const values = {
    name,
    amount_centavos: amountCentavos,
    due_day: dueDay,
    type,
    loan_id: loanId,
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
    revalidatePath("/loans");
    revalidatePath("/overview");
    revalidatePath("/checklist");
    return { success: `Added ${name}.` };
  }

  const { data: before } = await supabase
    .from("bills")
    .select("name, amount_centavos, due_day, type, loan_id")
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
  revalidatePath("/loans");
  revalidatePath("/overview");
  revalidatePath("/checklist");
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

/**
 * Removes a bill entirely (the owner's own request, 19 Sep 2026).
 *
 * Only ever a bill with nothing behind it. One that has been marked paid has
 * payment rows and ledger entries hanging off it, and the foreign key
 * cascades, so deleting it would take real money records with it. That one is
 * stopped instead, which keeps every figure.
 *
 * The delete policy in migration 0011 is what actually refuses; this checks
 * first only so the owner gets a sentence rather than a button that appears to
 * do nothing.
 */
export async function deleteBillAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const actor = await requireOwnerOrAdmin();

  const billId = String(formData.get("billId") ?? "");
  const supabase = await createSupabaseServerClient();

  // Everything about the row, because the audit log is where it survives once
  // the row itself is gone.
  const { data: bill } = await supabase
    .from("bills")
    .select("name, amount_centavos, due_day, type, loan_id, active, note")
    .eq("id", billId)
    .maybeSingle();

  if (!bill) return { error: "That bill no longer exists." };

  const { data: hasHistory, error: historyError } = await supabase.rpc(
    "bill_has_history",
    { p_bill_id: billId },
  );

  if (historyError) {
    return { error: `Could not check the bill's history: ${historyError.message}` };
  }

  const refusal = deleteRefusal("bill", hasHistory === true);
  if (refusal) return { error: refusal };

  // `.select()` so the refusal case can be told apart from the success case: a
  // delete the policy does not match removes no rows and raises no error.
  const { data: removed, error } = await supabase
    .from("bills")
    .delete()
    .eq("id", billId)
    .select("id");

  if (error) return { error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) return { error: deleteVanished("bill") };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "bills",
    entityId: billId,
    summary: `Deleted the bill "${bill.name}" of ${formatPesos(Number(bill.amount_centavos))} a month`,
    before: bill,
  });

  revalidatePath("/bills");
  revalidatePath("/overview");
  revalidatePath("/checklist");

  return { success: `Deleted ${bill.name}.` };
}
