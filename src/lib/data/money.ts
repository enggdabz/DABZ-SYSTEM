import "server-only";

/**
 * Reading the money tables (spec 10, 12).
 *
 * All reads go through the ordinary server client, so Row Level Security
 * applies: if a staff account somehow reached one of these, it would come back
 * empty rather than leaking the shop's finances.
 */
import { cache } from "react";

import {
  totalMonthlyBills,
  type Bill,
} from "@/lib/bills";
import {
  countsAgainstDailyTarget,
  countsAsIncome,
  type LedgerEntry,
} from "@/lib/ledger";
import {
  summarizeLoan,
  totalRemainingDebt,
  type Loan,
  type LoanPayment,
  type LoanSummary,
} from "@/lib/loans";
import { sumCentavos, type Centavos } from "@/lib/money";
import {
  addMonths,
  currentPeriod,
  manilaDayRangeUtc,
  manilaMonthRangeUtc,
  manilaToday,
  parseISODate,
  periodKey,
  type Period,
} from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getBills = cache(async (): Promise<Bill[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bills")
    .select("id, name, amount_centavos, due_day, type, loan_id, active, note")
    .order("active", { ascending: false })
    .order("name");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    amountCentavos: Number(row.amount_centavos),
    dueDay: row.due_day === null ? null : Number(row.due_day),
    type: row.type === "loan_installment" ? "loan_installment" : "operating",
    loanId: row.loan_id,
    active: row.active,
  }));
});

export interface BillPaymentRow {
  id: string;
  billId: string;
  period: Period;
  amountCentavos: Centavos;
  paidOn: string;
  source: string;
}

/**
 * Bill payments for a window of months around the one being viewed.
 *
 * Bounded rather than "everything", so the query stays small as the years
 * accumulate. The window covers the month on screen plus a year either side,
 * which is enough for the screen and for the reminder that peeks into next
 * month.
 */
export const getBillPayments = cache(
  async (period?: Period): Promise<BillPaymentRow[]> => {
    const supabase = await createSupabaseServerClient();
    const centre = period ?? currentPeriod();
    const from = `${periodKey(addMonths(centre, -12))}-01`;
    const to = `${periodKey(addMonths(centre, 12))}-01`;

    const { data, error } = await supabase
      .from("bill_payments")
      .select("id, bill_id, period_month, amount_centavos, paid_on, source")
      .gte("period_month", from)
      .lte("period_month", to);

    if (error || !data) return [];

    return data.flatMap((row) => {
      const parsed = parseISODate(row.period_month);
      if (!parsed) return [];
      return [
        {
          id: row.id,
          billId: row.bill_id,
          period: { year: parsed.year, month: parsed.month },
          amountCentavos: Number(row.amount_centavos),
          paidOn: row.paid_on,
          source: row.source,
        },
      ];
    });
  },
);

/** "billId:2026-09" for every month already marked paid. */
export function paidKeysFrom(payments: readonly BillPaymentRow[]): Set<string> {
  return new Set(
    payments.map((payment) => `${payment.billId}:${periodKey(payment.period)}`),
  );
}

export const getLoans = cache(async (): Promise<Loan[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("loans")
    .select(
      "id, lender, statement_balance_centavos, statement_date, monthly_payment_centavos, interest_percent_per_month, note, active",
    )
    .order("active", { ascending: false })
    .order("statement_balance_centavos", { ascending: false });

  if (error || !data) return [];

  return data.flatMap((row) => {
    const statementDate = parseISODate(row.statement_date);
    if (!statementDate) return [];
    return [
      {
        id: row.id,
        lender: row.lender,
        statementBalanceCentavos: Number(row.statement_balance_centavos),
        statementDate,
        monthlyPaymentCentavos:
          row.monthly_payment_centavos === null
            ? null
            : Number(row.monthly_payment_centavos),
        interestPercentPerMonth:
          row.interest_percent_per_month === null
            ? null
            : Number(row.interest_percent_per_month),
        note: row.note,
        active: row.active,
      },
    ];
  });
});

export interface LoanPaymentRow extends LoanPayment {
  id: string;
  loanId: string;
  note: string | null;
  origin: "manual" | "bill";
}

export const getLoanPayments = cache(async (): Promise<LoanPaymentRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("loan_payments")
    .select("id, loan_id, amount_centavos, paid_on, note, origin")
    .order("paid_on", { ascending: false })
    .limit(500);

  if (error || !data) return [];

  return data.flatMap((row) => {
    const paidOn = parseISODate(row.paid_on);
    if (!paidOn) return [];
    return [
      {
        id: row.id,
        loanId: row.loan_id,
        amountCentavos: Number(row.amount_centavos),
        paidOn,
        note: row.note,
        origin: row.origin === "bill" ? "bill" : "manual",
      },
    ];
  });
});

export const getLoanSummaries = cache(async (): Promise<LoanSummary[]> => {
  const [loans, payments] = await Promise.all([getLoans(), getLoanPayments()]);

  return loans.map((loan) =>
    summarizeLoan(
      loan,
      payments.filter((payment) => payment.loanId === loan.id),
    ),
  );
});

export interface LedgerEntryRow extends LedgerEntry {
  voidedAt: string | null;
  voidReason: string | null;
}

/**
 * Ledger entries, newest first.
 *
 * Voided entries are included by default so the trail stays visible, but they
 * are marked. Anything adding up money must skip them - see liveEntries below.
 */
export const getLedgerEntries = cache(
  async (options?: { from?: string; to?: string; limit?: number }): Promise<LedgerEntryRow[]> => {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("ledger_entries")
      .select(
        "id, occurred_at, direction, amount_centavos, tag, category, source, note, source_table, source_id, voided_at, void_reason",
      )
      .order("occurred_at", { ascending: false })
      .limit(options?.limit ?? 200);

    if (options?.from) query = query.gte("occurred_at", options.from);
    if (options?.to) query = query.lt("occurred_at", options.to);

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      direction: row.direction === "out" ? "out" : "in",
      amountCentavos: Number(row.amount_centavos),
      tag: row.tag,
      category: row.category,
      source: row.source,
      note: row.note,
      sourceTable: row.source_table,
      sourceId: row.source_id,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
    }));
  },
);

/**
 * Only the entries that still count.
 *
 * A voided entry is kept for the trail but must never reach a total, or the
 * books would show money that was taken back.
 */
export function liveEntries(entries: readonly LedgerEntryRow[]): LedgerEntryRow[] {
  return entries.filter((entry) => entry.voidedAt === null);
}

export interface OverviewData {
  todayIncomeCentavos: Centavos;
  /**
   * Today's costs that the daily target has NOT already covered - materials,
   * fuel, a meal for whoever stayed late. Bills and wages are left out because
   * the target exists to pay for them; subtracting them as well would count
   * them twice (spec 12.3).
   */
  todayTargetCostsCentavos: Centavos;
  /** Income less those costs. What the daily target is really measured against. */
  todayTowardTargetCentavos: Centavos;
  monthIncomeCentavos: Centavos;
  monthExpensesCentavos: Centavos;
  monthlyBillsCentavos: Centavos;
  totalDebtCentavos: Centavos;
  growingLoans: LoanSummary[];
}

export const getOverviewMoney = cache(async (): Promise<OverviewData> => {
  const today = manilaToday();
  const period = { year: today.year, month: today.month };

  const dayRange = manilaDayRangeUtc(today);
  const monthRange = manilaMonthRangeUtc(period);

  const [bills, summaries, dayEntries, monthEntries] = await Promise.all([
    getBills(),
    getLoanSummaries(),
    getLedgerEntries({ from: dayRange.from, to: dayRange.to, limit: 500 }),
    getLedgerEntries({ from: monthRange.from, to: monthRange.to, limit: 2000 }),
  ]);

  const liveDay = liveEntries(dayEntries);
  const liveMonth = liveEntries(monthEntries);

  const todayIncomeCentavos = sumCentavos(
    liveDay.filter(countsAsIncome).map((entry) => entry.amountCentavos),
  );
  const todayTargetCostsCentavos = sumCentavos(
    liveDay.filter(countsAgainstDailyTarget).map((entry) => entry.amountCentavos),
  );

  return {
    todayIncomeCentavos,
    todayTargetCostsCentavos,
    todayTowardTargetCentavos: todayIncomeCentavos - todayTargetCostsCentavos,
    monthIncomeCentavos: sumCentavos(
      liveMonth.filter(countsAsIncome).map((entry) => entry.amountCentavos),
    ),
    monthExpensesCentavos: sumCentavos(
      liveMonth
        .filter((entry) => entry.direction === "out")
        .map((entry) => entry.amountCentavos),
    ),
    monthlyBillsCentavos: totalMonthlyBills(bills),
    totalDebtCentavos: totalRemainingDebt(summaries),
    growingLoans: summaries.filter(
      (summary) => summary.loan.active && summary.balanceGrowing,
    ),
  };
});
