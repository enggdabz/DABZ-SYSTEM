"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { useFormPanel } from "@/components/use-form-panel";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";

import {
  recordLoanPaymentAction,
  saveLoanAction,
  setLoanActiveAction,
  updateFromStatementAction,
  type LoanActionState,
} from "./actions";

export function RecordPaymentForm({
  loanId,
  lender,
  suggestedAmountCentavos,
  today,
}: {
  loanId: string;
  lender: string;
  suggestedAmountCentavos: number | null;
  today: string;
}) {
  const [state, submit, pending] = useActionState<LoanActionState, FormData>(
    recordLoanPaymentAction,
    {},
  );
  /*
    Starts closed. With six loans on screen, six open four-field forms turn the
    page into a wall of inputs and bury the figures that matter - the balance,
    the interest, and whether the debt is actually shrinking.
  */
  const { open, answer, openPanel, closePanel } = useFormPanel(state);
  const errors = answer.fieldErrors ?? {};

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={openPanel}>
          Record a payment
        </Button>
        {answer.success ? <Notice tone="success" title={answer.success} /> : null}
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="loanId" value={loanId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount paid" error={errors.amount}>
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={
              suggestedAmountCentavos
                ? centavosToDecimalString(suggestedAmountCentavos)
                : ""
            }
            required
          />
        </Field>

        <Field label="Date paid" error={errors.paidOn}>
          <Input name="paidOn" type="date" defaultValue={today} required />
        </Field>

        <Field label="Paid from" error={errors.source}>
          <Select name="source" defaultValue="bank">
            {MONEY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {MONEY_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note" hint="Optional.">
          <Input name="note" placeholder="e.g. extra payment" />
        </Field>
      </div>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      {answer.success ? <Notice tone="success" title={answer.success} /> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : `Record payment to ${lender}`}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function UpdateFromStatementForm({
  loanId,
  balanceCentavos,
  statementDate,
}: {
  loanId: string;
  balanceCentavos: number;
  statementDate: string;
}) {
  const [state, submit, pending] = useActionState<LoanActionState, FormData>(
    updateFromStatementAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="loanId" value={loanId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Balance on the statement"
          hint="Copy the figure exactly as printed."
          error={errors.balance}
        >
          <Input
            name="balance"
            inputMode="decimal"
            defaultValue={centavosToDecimalString(balanceCentavos)}
            required
          />
        </Field>

        <Field
          label="Statement date"
          hint="Payments after this date are still subtracted; earlier ones are already inside the figure."
          error={errors.statementDate}
        >
          <Input name="statementDate" type="date" defaultValue={statementDate} required />
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Updating…" : "Update from statement"}
      </Button>
    </form>
  );
}

export function LoanEditForm({
  loan,
  today,
}: {
  loan?: {
    id: string;
    lender: string;
    monthlyPaymentCentavos: number | null;
    interestPercentPerMonth: number | null;
    note: string | null;
  };
  today: string;
}) {
  const [state, submit, pending] = useActionState<LoanActionState, FormData>(
    saveLoanAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-5">
      {loan ? <input type="hidden" name="loanId" value={loan.id} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Lender" error={errors.lender}>
          <Input
            name="lender"
            defaultValue={loan?.lender ?? ""}
            required
            placeholder="e.g. BPI"
          />
        </Field>

        {!loan ? (
          <>
            <Field label="Amount owed now" error={errors.balance}>
              <Input name="balance" inputMode="decimal" required placeholder="e.g. 50000" />
            </Field>
            <Field
              label="Balance as of"
              hint="The date that amount was true."
              error={errors.statementDate}
            >
              <Input name="statementDate" type="date" defaultValue={today} />
            </Field>
          </>
        ) : null}

        <Field
          label="Monthly payment"
          hint="Leave blank if there is no fixed amount."
          error={errors.monthlyPayment}
        >
          <Input
            name="monthlyPayment"
            inputMode="decimal"
            defaultValue={
              loan?.monthlyPaymentCentavos
                ? centavosToDecimalString(loan.monthlyPaymentCentavos)
                : ""
            }
            placeholder="e.g. 20000"
          />
        </Field>

        <Field
          label="Interest per month (%)"
          hint="From the statement. Until this is filled in, the system cannot tell you whether the balance is growing."
          error={errors.interest}
        >
          <Input
            name="interest"
            inputMode="decimal"
            defaultValue={loan?.interestPercentPerMonth ?? ""}
            placeholder="e.g. 3.5"
          />
        </Field>
      </div>

      <Field label="Note" hint="Optional.">
        <Input name="note" defaultValue={loan?.note ?? ""} />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : loan ? "Save changes" : "Add loan"}
      </Button>
    </form>
  );
}

/**
 * Stop counting a loan, or start again.
 *
 * The same shape as the bills screen has always had. A debt that is settled,
 * or entered twice, needs somewhere to go that is not deletion - its payments
 * are real and the ledger refers to them.
 */
export function LoanActiveForm({
  loanId,
  lender,
  active,
}: {
  loanId: string;
  lender: string;
  active: boolean;
}) {
  const [state, submit, pending] = useActionState<LoanActionState, FormData>(
    setLoanActiveAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={submit}>
        <input type="hidden" name="loanId" value={loanId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant={active ? "danger" : "secondary"} disabled={pending}>
          {pending
            ? "Saving…"
            : active
              ? `Stop counting ${lender}`
              : `Count ${lender} again`}
        </Button>
      </form>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </div>
  );
}
