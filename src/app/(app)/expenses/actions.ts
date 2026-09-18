"use server";

/**
 * Recording and deciding expenses (spec 11, and the staff limit from 4.3).
 *
 * Nothing here writes to the ledger itself. `record_expense` and
 * `decide_expense` in the database do that, in one transaction, and decide for
 * themselves whether an expense waits for the owner. A Server Action is a
 * public endpoint: it must not be the thing that judges its own limit.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getSettings, requireOwnerOrAdmin, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { DIVISION_IDS } from "@/lib/divisions";
import { expenseCategoryLabel } from "@/lib/expenses";
import { EXPENSE_CATEGORIES, MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ExpenseState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

const TAGS = [...DIVISION_IDS, "whole_shop"] as const;

export async function recordExpenseAction(
  _previous: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const user = await requirePermission("record_expenses");
  const settings = await getSettings();

  let amountCentavos: number;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    return { fieldErrors: { amount: "Enter the amount, like 480 or 480.50." } };
  }

  const category = String(formData.get("category") ?? "");
  if (!EXPENSE_CATEGORIES.includes(category as never)) {
    return { fieldErrors: { category: "Choose what it was for." } };
  }

  const tag = String(formData.get("tag") ?? "whole_shop");
  if (!TAGS.includes(tag as never)) {
    return { fieldErrors: { tag: "Choose which part of the shop." } };
  }

  const source = String(formData.get("source") ?? "cash_drawer");
  if (!MONEY_SOURCES.includes(source as never)) {
    return { fieldErrors: { source: "Choose where the money came from." } };
  }

  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("record_expense", {
    p_spent_on: civilDateToISO(manilaToday()),
    p_amount_centavos: amountCentavos,
    p_category: category,
    p_tag: tag,
    p_source: source,
    p_supplier_id: supplierId,
    p_note: note,
  });

  if (error) {
    return { error: `The expense could not be saved: ${error.message}` };
  }

  // The database decided this, not the browser - this only repeats it so the
  // person knows what happened without reloading the list.
  const waiting =
    !isOwnerOrAdmin(user) &&
    amountCentavos > settings.staffExpenseApprovalLimitCentavos;

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "expense",
    entityId: typeof data === "string" ? data : null,
    summary: `${waiting ? "Expense waiting for approval" : "Recorded expense"}: ${formatPesos(
      amountCentavos,
    )} - ${expenseCategoryLabel(category as never)}`,
    after: { amount_centavos: amountCentavos, category, tag, source },
  });

  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/overview");

  return {
    success: waiting
      ? `${formatPesos(amountCentavos)} saved. It is above your ${formatPesos(
          settings.staffExpenseApprovalLimitCentavos,
        )} limit, so it waits for the owner before the money is counted.`
      : `${formatPesos(amountCentavos)} recorded.`,
  };
}

export async function decideExpenseAction(
  _previous: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const user = await requireOwnerOrAdmin();

  const expenseId = String(formData.get("expenseId") ?? "");
  const approve = String(formData.get("decision") ?? "") === "approve";
  const note = String(formData.get("decisionNote") ?? "").trim() || null;

  if (!expenseId) return { error: "That expense could not be found." };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("decide_expense", {
    p_expense_id: expenseId,
    p_approve: approve,
    p_note: note,
  });

  if (error) {
    return { error: `The decision could not be saved: ${error.message}` };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "expense",
    entityId: expenseId,
    summary: approve
      ? "Approved a waiting expense"
      : "Refused a waiting expense",
    after: { status: approve ? "approved" : "rejected", decision_note: note },
  });

  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/overview");

  return {
    success: approve
      ? "Approved. The money is now counted."
      : "Refused. No money was recorded.",
  };
}

// ---------------------------------------------------------------------------
// Quick picks and suppliers - the owner's own lists
// ---------------------------------------------------------------------------

export async function savePresetAction(
  _previous: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const user = await requireOwnerOrAdmin();

  const id = String(formData.get("presetId") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { fieldErrors: { label: "Give the button a name." } };

  const category = String(formData.get("category") ?? "");
  if (!EXPENSE_CATEGORIES.includes(category as never)) {
    return { fieldErrors: { category: "Choose what it is for." } };
  }

  const tag = String(formData.get("tag") ?? "whole_shop");
  if (!TAGS.includes(tag as never)) {
    return { fieldErrors: { tag: "Choose which part of the shop." } };
  }

  // Blank stays blank. A usual amount is a figure only the owner can know, so
  // an empty box means "ask me every time" rather than zero.
  const amountText = String(formData.get("defaultAmount") ?? "").trim();
  let defaultAmountCentavos: number | null = null;
  if (amountText) {
    try {
      defaultAmountCentavos = parsePesos(amountText);
      if (defaultAmountCentavos <= 0) throw new Error("not positive");
    } catch {
      return {
        fieldErrors: { defaultAmount: "Leave this empty, or enter an amount like 480." },
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const row = {
    label,
    category,
    tag,
    default_amount_centavos: defaultAmountCentavos,
    active: formData.get("active") !== null,
  };

  const { error } = id
    ? await supabase.from("expense_presets").update(row).eq("id", id)
    : await supabase
        .from("expense_presets")
        .insert({ ...row, created_by: user.id });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: id ? "update" : "create",
    entity: "expense_preset",
    entityId: id,
    summary: `${id ? "Updated" : "Added"} the expense quick pick "${label}"`,
    after: row,
  });

  revalidatePath("/expenses");
  return { success: `Quick pick "${label}" saved.` };
}

export async function saveSupplierAction(
  _previous: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const user = await requireOwnerOrAdmin();

  const id = String(formData.get("supplierId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: "Enter the supplier's name." } };

  const row = {
    name,
    contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    active: formData.get("active") !== null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id)
    : await supabase.from("suppliers").insert({ ...row, created_by: user.id });

  if (error) {
    return {
      error: error.message.includes("suppliers_name_idx")
        ? "There is already a supplier with that name."
        : `That could not be saved: ${error.message}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: id ? "update" : "create",
    entity: "supplier",
    entityId: id,
    summary: `${id ? "Updated" : "Added"} supplier "${name}"`,
    after: row,
  });

  revalidatePath("/expenses");
  revalidatePath("/stocks");
  revalidatePath("/payables");
  return { success: `Supplier "${name}" saved.` };
}
