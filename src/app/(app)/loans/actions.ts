"use server";

/**
 * Loans: recording payments, updating from a statement, editing, stopping and
 * deleting (spec 12.2).
 *
 * The interest rate matters more than it looks. Without it the system cannot
 * tell the owner whether a loan is actually shrinking, which is the single
 * most useful thing it can say about a debt. So editing is front and centre.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { deleteRefusal, deleteVanished } from "@/lib/deletable";
import { MONEY_SOURCES, type MoneySource } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday, parseISODate } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoanActionState {
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

export async function recordLoanPaymentAction(
  _previous: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const actor = await requireOwnerOrAdmin();

  const loanId = String(formData.get("loanId") ?? "");
  const fieldErrors: Record<string, string> = {};

  let amountCentavos = 0;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    fieldErrors.amount = "Enter an amount like 20000 or 20000.00.";
  }

  const paidOn = parseISODate(String(formData.get("paidOn") ?? ""));
  if (!paidOn) fieldErrors.paidOn = "Choose the date the money left.";

  const source = readMoneySource(formData.get("source"));
  if (!source) fieldErrors.source = "Choose where the money came from.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (!paidOn || !source) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  const { data: loan } = await supabase
    .from("loans")
    .select("lender")
    .eq("id", loanId)
    .maybeSingle();

  if (!loan) return { error: "That loan no longer exists." };

  const note = String(formData.get("note") ?? "").trim() || null;

  // The money-out entry first, so the loan payment can point at it.
  const { data: ledgerEntry, error: ledgerError } = await supabase
    .from("ledger_entries")
    .insert({
      occurred_at: `${civilDateToISO(paidOn)}T00:00:00+08:00`,
      direction: "out",
      amount_centavos: amountCentavos,
      tag: "whole_shop",
      category: "loan_payments",
      source,
      note: note ?? `Payment to ${loan.lender}`,
      source_table: "loan_payments",
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (ledgerError || !ledgerEntry) {
    return { error: `Could not record it in the ledger: ${ledgerError?.message}` };
  }

  const { data: payment, error } = await supabase
    .from("loan_payments")
    .insert({
      loan_id: loanId,
      amount_centavos: amountCentavos,
      paid_on: civilDateToISO(paidOn),
      note,
      origin: "manual",
      ledger_entry_id: ledgerEntry.id,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error || !payment) {
    // Do not leave a money-out entry behind for a payment that was not saved.
    await supabase
      .from("ledger_entries")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: actor.id,
        void_reason: "The loan payment it belonged to could not be saved",
      })
      .eq("id", ledgerEntry.id);

    return { error: `Could not record the payment: ${error?.message}` };
  }

  await supabase
    .from("ledger_entries")
    .update({ source_id: payment.id })
    .eq("id", ledgerEntry.id);

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "loan_payments",
    entityId: payment.id,
    summary: `Recorded ${formatPesos(amountCentavos)} paid to ${loan.lender}`,
    after: { amount_centavos: amountCentavos, paid_on: civilDateToISO(paidOn), source },
  });

  revalidatePath("/loans");
  revalidatePath("/ledger");
  revalidatePath("/overview");

  return { success: `Recorded ${formatPesos(amountCentavos)} paid to ${loan.lender}.` };
}

/**
 * Replaces the balance with the figure printed on a new statement (spec 12.2).
 *
 * Payments dated after the new statement date keep being subtracted; payments
 * before it are already inside the new figure, so they stop being counted
 * twice. That is handled by the statement date, not by deleting anything.
 */
export async function updateFromStatementAction(
  _previous: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const actor = await requireOwnerOrAdmin();

  const loanId = String(formData.get("loanId") ?? "");
  const fieldErrors: Record<string, string> = {};

  let balanceCentavos = 0;
  try {
    balanceCentavos = parsePesos(String(formData.get("balance") ?? ""));
    if (balanceCentavos < 0) throw new Error("negative");
  } catch {
    fieldErrors.balance = "Enter the balance from the statement, like 450000.";
  }

  const statementDate = parseISODate(String(formData.get("statementDate") ?? ""));
  if (!statementDate) fieldErrors.statementDate = "Choose the statement date.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (!statementDate) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from("loans")
    .select("lender, statement_balance_centavos, statement_date")
    .eq("id", loanId)
    .maybeSingle();

  if (!before) return { error: "That loan no longer exists." };

  const { error } = await supabase
    .from("loans")
    .update({
      statement_balance_centavos: balanceCentavos,
      statement_date: civilDateToISO(statementDate),
    })
    .eq("id", loanId);

  if (error) return { error: `Could not update it: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "loans",
    entityId: loanId,
    summary: `Updated ${before.lender} from a statement: ${formatPesos(
      Number(before.statement_balance_centavos),
    )} to ${formatPesos(balanceCentavos)} as of ${civilDateToISO(statementDate)}`,
    before: {
      statement_balance_centavos: Number(before.statement_balance_centavos),
      statement_date: before.statement_date,
    },
    after: {
      statement_balance_centavos: balanceCentavos,
      statement_date: civilDateToISO(statementDate),
    },
  });

  revalidatePath("/loans");
  revalidatePath("/overview");

  return {
    success: `${before.lender} now shows ${formatPesos(balanceCentavos)} as of that statement.`,
  };
}

export async function saveLoanAction(
  _previous: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const actor = await requireOwnerOrAdmin();

  const loanId = String(formData.get("loanId") ?? "");
  const lender = String(formData.get("lender") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (lender === "") fieldErrors.lender = "Who is the loan with?";

  const rawMonthly = String(formData.get("monthlyPayment") ?? "").trim();
  let monthlyPaymentCentavos: number | null = null;
  if (rawMonthly !== "") {
    try {
      monthlyPaymentCentavos = parsePesos(rawMonthly);
      if (monthlyPaymentCentavos < 0) throw new Error("negative");
    } catch {
      fieldErrors.monthlyPayment = "Enter an amount like 20000, or leave it blank.";
    }
  }

  const rawInterest = String(formData.get("interest") ?? "").trim();
  let interestPercentPerMonth: number | null = null;
  if (rawInterest !== "") {
    const parsed = Number(rawInterest);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      fieldErrors.interest = "Enter a monthly percentage from 0 to 100, or leave it blank.";
    } else {
      interestPercentPerMonth = parsed;
    }
  }

  const note = String(formData.get("note") ?? "").trim() || null;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  if (loanId === "") {
    let balanceCentavos = 0;
    try {
      balanceCentavos = parsePesos(String(formData.get("balance") ?? ""));
      if (balanceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { balance: "Enter the amount owed, like 50000." } };
    }

    const statementDate =
      parseISODate(String(formData.get("statementDate") ?? "")) ?? manilaToday();

    const { error } = await supabase.from("loans").insert({
      lender,
      statement_balance_centavos: balanceCentavos,
      statement_date: civilDateToISO(statementDate),
      monthly_payment_centavos: monthlyPaymentCentavos,
      interest_percent_per_month: interestPercentPerMonth,
      note,
      created_by: actor.id,
    });

    if (error) return { error: `Could not add the loan: ${error.message}` };

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "create",
      entity: "loans",
      summary: `Added a loan with ${lender} of ${formatPesos(balanceCentavos)}`,
      after: { lender, statement_balance_centavos: balanceCentavos },
    });

    revalidatePath("/loans");
    revalidatePath("/overview");
    return { success: `Added the loan with ${lender}.` };
  }

  const { data: before } = await supabase
    .from("loans")
    .select("lender, monthly_payment_centavos, interest_percent_per_month, note")
    .eq("id", loanId)
    .maybeSingle();

  const { error } = await supabase
    .from("loans")
    .update({
      lender,
      monthly_payment_centavos: monthlyPaymentCentavos,
      interest_percent_per_month: interestPercentPerMonth,
      note,
    })
    .eq("id", loanId);

  if (error) return { error: `Could not save the loan: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "loans",
    entityId: loanId,
    summary:
      interestPercentPerMonth !== null &&
      before?.interest_percent_per_month === null
        ? `Set the interest rate for ${lender} to ${interestPercentPerMonth}% a month`
        : `Changed the loan with ${lender}`,
    before: before ?? undefined,
    after: {
      lender,
      monthly_payment_centavos: monthlyPaymentCentavos,
      interest_percent_per_month: interestPercentPerMonth,
      note,
    },
  });

  revalidatePath("/loans");
  revalidatePath("/overview");

  return { success: `Saved the loan with ${lender}.` };
}

/**
 * Stops counting a loan, or starts again.
 *
 * The Loans screen had no way to do this until now: a loan could be added and
 * edited but never set aside, so a debt that was settled or entered twice
 * stayed in the total owed forever. Stopping keeps every payment and takes the
 * loan out of the figures - the same rule bills have always had.
 */
export async function setLoanActiveAction(
  _previous: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const actor = await requireOwnerOrAdmin();

  const loanId = String(formData.get("loanId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const supabase = await createSupabaseServerClient();

  const { data: loan } = await supabase
    .from("loans")
    .select("lender")
    .eq("id", loanId)
    .maybeSingle();

  if (!loan) return { error: "That loan no longer exists." };

  const { error } = await supabase.from("loans").update({ active }).eq("id", loanId);
  if (error) return { error: error.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: active ? "activate" : "deactivate",
    entity: "loans",
    entityId: loanId,
    summary: `${active ? "Reactivated" : "Stopped"} the loan with ${loan.lender}`,
    before: { active: !active },
    after: { active },
  });

  revalidatePath("/loans");
  revalidatePath("/overview");
  revalidatePath("/checklist");

  return {
    success: active
      ? `The loan with ${loan.lender} is back in the total owed.`
      : `The loan with ${loan.lender} is out of the total owed. Its payments are kept.`,
  };
}

/**
 * Removes a loan entirely (the owner's own request, 19 Sep 2026).
 *
 * Only a loan with no payments recorded against it. Once money has been paid
 * down, `loan_payments` cascades from this row and the ledger entries point at
 * those payments, so deleting would leave the books describing money paid to a
 * lender the system has never heard of. That one is stopped instead.
 *
 * An installment bill pointing at this loan is not a reason to refuse: that
 * key is `on delete set null`, so the bill survives and simply stops paying
 * anything down. The screen says so before the button is pressed.
 */
export async function deleteLoanAction(
  _previous: LoanActionState,
  formData: FormData,
): Promise<LoanActionState> {
  const actor = await requireOwnerOrAdmin();

  const loanId = String(formData.get("loanId") ?? "");
  const supabase = await createSupabaseServerClient();

  // The whole row: once it is deleted, the audit log is the only record of
  // what was there.
  const { data: loan } = await supabase
    .from("loans")
    .select(
      "lender, statement_balance_centavos, statement_date, monthly_payment_centavos, interest_percent_per_month, note, active",
    )
    .eq("id", loanId)
    .maybeSingle();

  if (!loan) return { error: "That loan no longer exists." };

  const { data: hasHistory, error: historyError } = await supabase.rpc(
    "loan_has_history",
    { p_loan_id: loanId },
  );

  if (historyError) {
    return { error: `Could not check the loan's history: ${historyError.message}` };
  }

  const refusal = deleteRefusal("loan", hasHistory === true);
  if (refusal) return { error: refusal };

  /*
    Installment bills pointing at this loan. The key is `on delete set null`,
    so they survive - but they quietly stop paying anything down, and after the
    delete nothing records which ones they were. Read before, written into the
    audit entry, and named in the success line so it is not a surprise.
  */
  const { data: linkedBills } = await supabase
    .from("bills")
    .select("id, name")
    .eq("loan_id", loanId);

  const { data: removed, error } = await supabase
    .from("loans")
    .delete()
    .eq("id", loanId)
    .select("id");

  if (error) return { error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) return { error: deleteVanished("loan") };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "loans",
    entityId: loanId,
    summary: `Deleted the loan with ${loan.lender} of ${formatPesos(
      Number(loan.statement_balance_centavos),
    )}${
      linkedBills && linkedBills.length > 0
        ? `, unlinking ${linkedBills.map((bill) => bill.name).join(", ")}`
        : ""
    }`,
    before: { ...loan, linked_bills: linkedBills ?? [] },
  });

  revalidatePath("/loans");
  revalidatePath("/bills");
  revalidatePath("/overview");
  revalidatePath("/checklist");

  return {
    success:
      linkedBills && linkedBills.length > 0
        ? `Deleted the loan with ${loan.lender}. ${linkedBills
            .map((bill) => bill.name)
            .join(", ")} ${
            linkedBills.length === 1 ? "is" : "are"
          } no longer paying any balance down.`
        : `Deleted the loan with ${loan.lender}.`,
  };
}
