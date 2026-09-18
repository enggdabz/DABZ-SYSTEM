"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  decideExpense, markBillPaid, recordExpense, recordLoanPayment,
  saveBill, saveLoan, undoBillPayment,
} from "@/app/admin/expenses/actions";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import {
  EXPENSE_CATEGORIES, MONEY_SOURCES, MONEY_SOURCE_LABEL, TAGS, TAG_LABEL, humanise,
} from "@/lib/domain";

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending}>{pending ? "Working…" : label}</Button>;
}
function Result({ state }: { state: { error: string | null; notice: string | null } }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.notice) return <Alert tone="good">{state.notice}</Alert>;
  return null;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

export function RecordExpenseForm({
  suppliers, presets,
}: {
  suppliers: { id: string; name: string }[];
  presets: { id: string; label: string; category: string; tag: string; default_amount_centavos: number }[];
}) {
  const [state, action] = useActionState(recordExpense, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
      <Field label="Amount"><input name="amount" inputMode="decimal" required className={fieldClass} /></Field>
      <Field label="Category">
        <select name="category" defaultValue="materials_supplies" className={fieldClass}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{humanise(c)}</option>)}
        </select>
      </Field>
      <Field label="Tag">
        <select name="tag" defaultValue="whole_shop" className={fieldClass}>
          {TAGS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
        </select>
      </Field>
      <Field label="Paid from">
        <select name="source" defaultValue="cash_drawer" className={fieldClass}>
          {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Supplier">
        <select name="supplier_id" defaultValue="" className={fieldClass}>
          <option value="">None</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Spent on"><input name="spent_on" type="date" defaultValue={today()} className={fieldClass} /></Field>
      <div className="sm:col-span-3 lg:col-span-6">
        <Field label="Note"><input name="note" className={fieldClass} /></Field>
      </div>
      {presets.length > 0 ? (
        <p className="text-xs text-fg-subtle sm:col-span-3 lg:col-span-6">
          Presets available: {presets.map((p) => p.label).join(", ")}
        </p>
      ) : null}
      <div className="sm:col-span-3 lg:col-span-6"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-6"><Submit label="Record expense" /></div>
    </form>
  );
}

export function DecideExpenseForm({ expenseId }: { expenseId: string }) {
  const [state, action] = useActionState(decideExpense, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="expense_id" value={expenseId} />
      <input name="note" placeholder="Note (optional)" className={`${fieldClass} min-w-40 flex-1`} />
      <button type="submit" name="approve" value="true"
        className="label-caps rounded-lg bg-brand px-3 py-2 text-white transition hover:bg-brand-strong">
        Approve
      </button>
      <button type="submit" name="approve" value="false"
        className="label-caps rounded-lg border border-line px-3 py-2 text-fg-muted transition hover:border-brand">
        Reject
      </button>
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function BillForm({ loans }: { loans: { id: string; lender: string }[] }) {
  const [state, action] = useActionState(saveBill, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
      <Field label="Name"><input name="name" required className={fieldClass} /></Field>
      <Field label="Amount"><input name="amount" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Due day" hint="1–31"><input name="due_day" type="number" min={1} max={31} defaultValue={1} className={fieldClass} /></Field>
      <Field label="Type">
        <select name="type" defaultValue="operating" className={fieldClass}>
          <option value="operating">Operating</option>
          <option value="loan_installment">Loan installment</option>
        </select>
      </Field>
      <Field label="Linked loan" hint="For installments.">
        <select name="loan_id" defaultValue="" className={fieldClass}>
          <option value="">None</option>
          {loans.map((l) => <option key={l.id} value={l.id}>{l.lender}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-3 lg:col-span-5"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-5"><Submit label="Add bill" /></div>
    </form>
  );
}

export function MarkBillPaidForm({ billId, amount }: { billId: string; amount: string }) {
  const [state, action] = useActionState(markBillPaid, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="bill_id" value={billId} />
      <div className="w-28"><Field label="Amount"><input name="amount" inputMode="decimal" defaultValue={amount} className={fieldClass} /></Field></div>
      <div className="w-36"><Field label="Month"><input name="period_month" type="month" defaultValue={thisMonth()} className={fieldClass} /></Field></div>
      <div className="w-36"><Field label="Paid from">
        <select name="source" defaultValue="cash_drawer" className={fieldClass}>
          {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
        </select>
      </Field></div>
      <div className="w-36"><Field label="Paid on"><input name="paid_on" type="date" defaultValue={today()} className={fieldClass} /></Field></div>
      <Submit label="Mark paid" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
      {state.notice ? <p className="w-full text-xs text-emerald-700">{state.notice}</p> : null}
    </form>
  );
}

export function UndoBillPaymentForm({ billId }: { billId: string }) {
  const [state, action] = useActionState(undoBillPayment, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="bill_id" value={billId} />
      <div className="w-36"><Field label="Month"><input name="period_month" type="month" defaultValue={thisMonth()} className={fieldClass} /></Field></div>
      <div className="min-w-40 flex-1"><Field label="Reason"><input name="reason" className={fieldClass} /></Field></div>
      <Submit label="Undo" variant="danger" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function LoanForm() {
  const [state, action] = useActionState(saveLoan, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
      <Field label="Lender"><input name="lender" required className={fieldClass} /></Field>
      <Field label="Statement balance"><input name="statement_balance" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Statement date"><input name="statement_date" type="date" defaultValue={today()} className={fieldClass} /></Field>
      <Field label="Monthly payment"><input name="monthly_payment" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Interest %/month"><input name="interest_percent" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <div className="sm:col-span-3 lg:col-span-5"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-5"><Submit label="Add loan" /></div>
    </form>
  );
}

export function LoanPaymentForm({ loanId }: { loanId: string }) {
  const [state, action] = useActionState(recordLoanPayment, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="loan_id" value={loanId} />
      <div className="w-32"><Field label="Amount"><input name="amount" inputMode="decimal" required className={fieldClass} /></Field></div>
      <div className="w-36"><Field label="Paid on"><input name="paid_on" type="date" defaultValue={today()} className={fieldClass} /></Field></div>
      <div className="min-w-32 flex-1"><Field label="Note"><input name="note" className={fieldClass} /></Field></div>
      <Submit label="Record" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}
