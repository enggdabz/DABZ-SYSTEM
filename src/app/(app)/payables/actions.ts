"use server";

/**
 * What the shop owes suppliers (spec 11).
 *
 * Paying one writes a ledger entry and marks the payable together, in
 * `pay_supplier_payable`. Doing it as two requests risks the ledger saying the
 * money left while the payable still says it is owed - and then it gets paid
 * again.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PayableState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

export async function payPayableAction(
  _previous: PayableState,
  formData: FormData,
): Promise<PayableState> {
  const user = await requireOwnerOrAdmin();

  const payableId = String(formData.get("payableId") ?? "");
  if (!payableId) return { error: "That payable could not be found." };

  const source = String(formData.get("source") ?? "cash_drawer");
  if (!MONEY_SOURCES.includes(source as never)) {
    return { fieldErrors: { source: "Choose where the money came from." } };
  }

  const paidOn =
    String(formData.get("paidOn") ?? "").trim() || civilDateToISO(manilaToday());

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("pay_supplier_payable", {
    p_payable_id: payableId,
    p_paid_on: paidOn,
    p_source: source,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "supplier_payable",
    entityId: payableId,
    summary: "Paid a supplier",
    after: { status: "paid", paid_on: paidOn, paid_source: source },
  });

  revalidatePath("/payables");
  revalidatePath("/ledger");
  revalidatePath("/");

  return { success: "Paid. The money is recorded in Money in/out." };
}

export async function savePayableAction(
  _previous: PayableState,
  formData: FormData,
): Promise<PayableState> {
  const user = await requireOwnerOrAdmin();

  const id = String(formData.get("payableId") ?? "").trim() || null;

  const description = String(formData.get("description") ?? "").trim();
  if (!description) {
    return { fieldErrors: { description: "What was received?" } };
  }

  let amountCentavos: number;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    return { fieldErrors: { amount: "Enter the amount owed, like 4800." } };
  }

  const row = {
    supplier_id: String(formData.get("supplierId") ?? "").trim() || null,
    description,
    amount_centavos: amountCentavos,
    received_on:
      String(formData.get("receivedOn") ?? "").trim() ||
      civilDateToISO(manilaToday()),
    // Left empty when the supplier gave no term. Never defaulted, for the same
    // reason a bill has no invented due day.
    due_on: String(formData.get("dueOn") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();

  const { error } = id
    ? await supabase.from("supplier_payables").update(row).eq("id", id)
    : await supabase
        .from("supplier_payables")
        .insert({ ...row, created_by: user.id });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: id ? "update" : "create",
    entity: "supplier_payable",
    entityId: id,
    summary: `${id ? "Updated" : "Added"} ${formatPesos(
      amountCentavos,
    )} owed for "${description}"`,
    after: row,
  });

  revalidatePath("/payables");
  return { success: "Saved." };
}
