import "server-only";

/**
 * Reading expenses, quick picks, suppliers and payables (spec 11).
 *
 * All reads go through the ordinary server client, so Row Level Security
 * applies: a staff account reaching the payables reader gets an empty list
 * rather than the shop's debts.
 */
import { cache } from "react";

import type { ExpenseTag } from "@/lib/divisions";
import {
  expenseTotals,
  payableTotals,
  type ExpensePreset,
  type ExpenseRow,
  type ExpenseStatus,
  type Payable,
  type Supplier,
} from "@/lib/expenses";
import type { ExpenseCategory, LedgerCategory, MoneySource } from "@/lib/ledger";
import {
  civilDateToISO,
  manilaDayRangeUtc,
  manilaToday,
  type CivilDate,
} from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getSuppliers = cache(async (): Promise<Supplier[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, contact_number, address, note, active")
    .order("active", { ascending: false })
    .order("name");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    contactNumber: row.contact_number,
    address: row.address,
    note: row.note,
    active: row.active,
  }));
});

export const getExpensePresets = cache(async (): Promise<ExpensePreset[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_presets")
    .select(
      "id, label, category, tag, default_amount_centavos, supplier_id, sort_order, active",
    )
    .order("active", { ascending: false })
    .order("sort_order")
    .order("label");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category as ExpenseCategory,
    tag: row.tag as ExpenseTag,
    defaultAmountCentavos:
      row.default_amount_centavos === null
        ? null
        : Number(row.default_amount_centavos),
    supplierId: row.supplier_id,
    sortOrder: Number(row.sort_order),
    active: row.active,
  }));
});

const EXPENSE_COLUMNS =
  "id, occurred_at, spent_on, amount_centavos, category, tag, source, supplier_id, note, status, ledger_entry_id, decided_by, decided_at, decision_note, created_by, created_at";

function toExpenseRow(row: Record<string, unknown>): ExpenseRow {
  return {
    id: String(row.id),
    occurredAt: String(row.occurred_at),
    spentOn: String(row.spent_on),
    amountCentavos: Number(row.amount_centavos),
    category: String(row.category) as LedgerCategory,
    tag: String(row.tag) as ExpenseTag,
    source: String(row.source) as MoneySource,
    supplierId: (row.supplier_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    status: String(row.status) as ExpenseStatus,
    createdBy: (row.created_by as string | null) ?? null,
    createdByName: null,
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    decisionNote: (row.decision_note as string | null) ?? null,
    ledgerEntryId: (row.ledger_entry_id as string | null) ?? null,
  };
}

export const getExpenses = cache(
  async (options?: { limit?: number }): Promise<ExpenseRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .order("occurred_at", { ascending: false })
      .limit(options?.limit ?? 120);

    if (error || !data) return [];

    const expenses = data.map((row) => toExpenseRow(row as Record<string, unknown>));

    // Who recorded it, so the owner deciding a waiting expense knows whose it
    // is. Read separately because `profiles` has its own security rules - a
    // staff member gets no names back, only their own entries.
    const ids = [...new Set(expenses.map((e) => e.createdBy).filter(Boolean))];
    if (ids.length === 0) return expenses;

    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name");

    const names = new Map(
      (people ?? []).map((row) => [row.id as string, row.full_name as string]),
    );

    return expenses.map((expense) => ({
      ...expense,
      createdByName: expense.createdBy ? names.get(expense.createdBy) ?? null : null,
    }));
  },
);

/** Today's expenses, for the Overview and the end-of-day count. */
export async function getExpensesOn(
  date: CivilDate = manilaToday(),
): Promise<ExpenseRow[]> {
  const supabase = await createSupabaseServerClient();
  const range = manilaDayRangeUtc(date);

  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .gte("occurred_at", range.from)
    .lt("occurred_at", range.to)
    .order("occurred_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => toExpenseRow(row as Record<string, unknown>));
}

export async function getExpenseSummary(): Promise<{
  expenses: ExpenseRow[];
  totals: ReturnType<typeof expenseTotals>;
}> {
  const expenses = await getExpenses();
  return { expenses, totals: expenseTotals(expenses) };
}

export const getPayables = cache(async (): Promise<Payable[]> => {
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, { data: supplierRows }] = await Promise.all([
    supabase
      .from("supplier_payables")
      .select(
        "id, supplier_id, description, amount_centavos, received_on, due_on, status, paid_on, paid_source, note",
      )
      .order("status")
      .order("due_on")
      .order("received_on", { ascending: false }),
    supabase.from("suppliers").select("id, name"),
  ]);

  if (error || !data) return [];

  const names = new Map(
    (supplierRows ?? []).map((row) => [row.id as string, row.name as string]),
  );

  return data.map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_id ? names.get(row.supplier_id) ?? null : null,
    description: row.description,
    amountCentavos: Number(row.amount_centavos),
    receivedOn: row.received_on,
    dueOn: row.due_on,
    status: row.status === "paid" ? "paid" : "unpaid",
    paidOn: row.paid_on,
    note: row.note,
  }));
});

export async function getPayableSummary(): Promise<{
  payables: Payable[];
  totals: ReturnType<typeof payableTotals>;
}> {
  const payables = await getPayables();
  return { payables, totals: payableTotals(payables, civilDateToISO(manilaToday())) };
}
