"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { hasPermission, requireRole, requireUser } from "@/lib/auth";
import {
  BILL_TYPES, MONEY_SOURCES, TAGS,
  type MoneySource, type Tag,
} from "@/lib/domain";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => text(f, k) || null;

export async function recordExpense(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!(await hasPermission("record_expenses"))) {
    return { error: "You do not have permission to record expenses.", notice: null };
  }

  const amount = parsePesosToCentavos(text(formData, "amount"));
  if (amount === null || amount <= 0) {
    return { error: "Enter an amount above zero.", notice: null };
  }

  const tag = text(formData, "tag") as Tag;
  if (!TAGS.includes(tag)) return { error: "Choose a tag.", notice: null };

  const source = text(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const category = text(formData, "category");
  if (!category) return { error: "Choose a category.", notice: null };

  const supabase = await createClient();

  /*
   * record_expense decides approved vs pending itself, reading the staff limit
   * from app_settings rather than trusting anything sent here. Nullable
   * arguments are widened for the generated types, as elsewhere.
   */
  const args = {
    p_spent_on: text(formData, "spent_on") || new Date().toISOString().slice(0, 10),
    p_amount_centavos: amount,
    p_category: category,
    p_tag: tag,
    p_source: source,
    p_supplier_id: opt(formData, "supplier_id"),
    p_note: opt(formData, "note"),
  };

  const { error } = await supabase.rpc(
    "record_expense",
    args as unknown as Database["public"]["Functions"]["record_expense"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/expenses");
  return { error: null, notice: "Expense recorded." };
}

export async function decideExpense(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);
  const approve = formData.get("approve") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_expense", {
    p_expense_id: text(formData, "expense_id"),
    p_approve: approve,
    p_note: text(formData, "note"),
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/expenses");
  return { error: null, notice: approve ? "Expense approved." : "Expense rejected." };
}

export async function saveBill(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const name = text(formData, "name");
  if (!name) return { error: "Enter a name.", notice: null };

  const amount = parsePesosToCentavos(text(formData, "amount") || "0");
  if (amount === null || amount < 0) return { error: "Enter a valid amount.", notice: null };

  const dueDay = Number(text(formData, "due_day") || "1");
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return { error: "Due day must be between 1 and 31.", notice: null };
  }

  const type = text(formData, "type");
  if (!BILL_TYPES.includes(type as never)) {
    return { error: "Choose a bill type.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bills").insert({
    name,
    amount_centavos: amount,
    due_day: dueDay,
    type,
    loan_id: opt(formData, "loan_id"),
    note: opt(formData, "note"),
    active: true,
  });
  if (error) return { error: "Could not save the bill.", notice: null };

  revalidatePath("/admin/expenses/bills");
  return { error: null, notice: "Bill added." };
}

export async function markBillPaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const amount = parsePesosToCentavos(text(formData, "amount"));
  if (amount === null || amount < 0) return { error: "Enter a valid amount.", notice: null };

  const source = text(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  // bill_payments_period_is_month_start: the period must be a month's first day.
  const month = text(formData, "period_month");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { error: "Choose the month being paid.", notice: null };
  }

  const supabase = await createClient();
  const args = {
    p_bill_id: text(formData, "bill_id"),
    p_period_month: `${month}-01`,
    p_amount_centavos: amount,
    p_paid_on: text(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    p_source: source,
    p_note: opt(formData, "note"),
  };

  const { error } = await supabase.rpc(
    "mark_bill_paid",
    args as unknown as Database["public"]["Functions"]["mark_bill_paid"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/expenses/bills");
  return { error: null, notice: "Bill marked paid." };
}

export async function undoBillPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const month = text(formData, "period_month");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { error: "Choose the month to undo.", notice: null };
  }

  const supabase = await createClient();
  const args = {
    p_bill_id: text(formData, "bill_id"),
    p_period_month: `${month}-01`,
    p_reason: text(formData, "reason") || "Mark paid was undone",
  };

  const { error } = await supabase.rpc(
    "undo_bill_payment",
    args as unknown as Database["public"]["Functions"]["undo_bill_payment"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/expenses/bills");
  return { error: null, notice: "Payment undone." };
}

export async function saveLoan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const lender = text(formData, "lender");
  if (!lender) return { error: "Enter the lender.", notice: null };

  const balance = parsePesosToCentavos(text(formData, "statement_balance") || "0");
  const monthly = parsePesosToCentavos(text(formData, "monthly_payment") || "0");
  if (balance === null || balance < 0 || monthly === null || monthly < 0) {
    return { error: "Enter valid amounts.", notice: null };
  }

  const interest = Number(text(formData, "interest_percent") || "0");
  if (!Number.isFinite(interest) || interest < 0 || interest > 100) {
    return { error: "Interest must be between 0 and 100 percent.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("loans").insert({
    lender,
    statement_balance_centavos: balance,
    // loans.statement_date is NOT NULL; today stands in when none is given.
    statement_date:
      text(formData, "statement_date") || new Date().toISOString().slice(0, 10),
    monthly_payment_centavos: monthly,
    interest_percent_per_month: interest,
    note: opt(formData, "note"),
    active: true,
  });
  if (error) return { error: "Could not save the loan.", notice: null };

  revalidatePath("/admin/expenses/loans");
  return { error: null, notice: "Loan added." };
}

export async function recordLoanPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);

  const amount = parsePesosToCentavos(text(formData, "amount"));
  if (amount === null || amount <= 0) {
    return { error: "Enter an amount above zero.", notice: null };
  }

  const supabase = await createClient();
  // A payment made directly against the loan, rather than through a bill.
  const { error } = await supabase.from("loan_payments").insert({
    loan_id: text(formData, "loan_id"),
    amount_centavos: amount,
    paid_on: text(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    note: opt(formData, "note"),
    origin: "manual",
    created_by: actor.user.id,
  });
  if (error) return { error: "Could not record the payment.", notice: null };

  revalidatePath("/admin/expenses/loans");
  return { error: null, notice: "Payment recorded." };
}

