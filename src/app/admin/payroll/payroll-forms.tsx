"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createPayrollWeek, giveCashAdvance, payPayrollWeek, recordAttendance,
  saveStaff, setPayrollDay, setWeekAdjustments, unlockWeek,
} from "@/app/admin/payroll/actions";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import {
  DEDUCTION_PLANS, MONEY_SOURCES, MONEY_SOURCE_LABEL, PAYROLL_DAY_TYPES, humanise,
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
const today = () => new Date().toISOString().slice(0, 10);

type Person = { id: string; full_name: string };

export function StaffForm({ profiles }: { profiles: { id: string; full_name: string }[] }) {
  const [state, action] = useActionState(saveStaff, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4">
      <Field label="Full name"><input name="full_name" required className={fieldClass} /></Field>
      <Field label="Position"><input name="position" className={fieldClass} /></Field>
      <Field label="Daily rate"><input name="daily_rate" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field>
      <Field label="Start date"><input name="start_date" type="date" className={fieldClass} /></Field>
      <Field label="Contact number"><input name="contact_number" className={fieldClass} /></Field>
      <Field label="Emergency contact"><input name="emergency_contact_name" className={fieldClass} /></Field>
      <Field label="Emergency number"><input name="emergency_contact_number" className={fieldClass} /></Field>
      <Field label="Login account" hint="Links attendance to their sign-in.">
        <select name="profile_id" defaultValue="" className={fieldClass}>
          <option value="">Not linked</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-3 lg:col-span-4"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-4"><Submit label="Add staff" /></div>
    </form>
  );
}

export function AttendanceForm({ staff }: { staff: Person[] }) {
  const [state, action] = useActionState(recordAttendance, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
      <Field label="Staff">
        <select name="staff_id" required className={fieldClass}>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </Field>
      <Field label="Date"><input name="work_date" type="date" defaultValue={today()} className={fieldClass} /></Field>
      <Field label="Time in"><input name="time_in" type="time" className={fieldClass} /></Field>
      <Field label="Time out"><input name="time_out" type="time" className={fieldClass} /></Field>
      <Field label="Note"><input name="note" className={fieldClass} /></Field>
      <div className="sm:col-span-3 lg:col-span-5"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-5"><Submit label="Record" /></div>
    </form>
  );
}

export function NewWeekForm({ staff }: { staff: Person[] }) {
  const [state, action] = useActionState(createPayrollWeek, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3">
      <Field label="Staff">
        <select name="staff_id" required className={fieldClass}>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </Field>
      <Field label="Week starting"><input name="week_start" type="date" required defaultValue={today()} className={fieldClass} /></Field>
      <div className="self-end pb-0.5"><Submit label="Start draft" /></div>
      <div className="sm:col-span-3"><Result state={state} /></div>
    </form>
  );
}

export function PayrollDayForm({ weekId, date }: { weekId: string; date: string }) {
  const [state, action] = useActionState(setPayrollDay, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="week_id" value={weekId} />
      <div className="w-36"><Field label="Date"><input name="work_date" type="date" defaultValue={date} className={fieldClass} /></Field></div>
      <div className="w-28"><Field label="Day">
        <select name="day_type" defaultValue="full" className={fieldClass}>
          {PAYROLL_DAY_TYPES.map((d) => <option key={d} value={d}>{humanise(d)}</option>)}
        </select>
      </Field></div>
      <div className="w-24"><Field label="OT hours"><input name="overtime_hours" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field></div>
      <div className="w-28"><Field label="OT pay"><input name="overtime_pay" inputMode="decimal" defaultValue="0" className={fieldClass} /></Field></div>
      <Submit label="Save day" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function AdjustmentsForm({
  weekId, bonus, deduction,
}: {
  weekId: string; bonus: string; deduction: string;
}) {
  const [state, action] = useActionState(setWeekAdjustments, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="week_id" value={weekId} />
      <div className="w-32"><Field label="Bonus"><input name="bonus" inputMode="decimal" defaultValue={bonus} className={fieldClass} /></Field></div>
      <div className="w-40"><Field label="Advance deduction"><input name="advance_deduction" inputMode="decimal" defaultValue={deduction} className={fieldClass} /></Field></div>
      <Submit label="Apply" variant="secondary" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function PayWeekForm({ weekId }: { weekId: string }) {
  const [state, action] = useActionState(payPayrollWeek, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="week_id" value={weekId} />
      <div className="w-40"><Field label="Paid from">
        <select name="source" defaultValue="cash_drawer" className={fieldClass}>
          {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
        </select>
      </Field></div>
      <div className="w-40"><Field label="Paid on"><input name="paid_on" type="date" defaultValue={today()} className={fieldClass} /></Field></div>
      <Submit label="Mark paid" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function UnlockWeekForm({ weekId }: { weekId: string }) {
  const [state, action] = useActionState(unlockWeek, emptyActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="week_id" value={weekId} />
      <input name="reason" required placeholder="Why unlock this week?" className={`${fieldClass} min-w-40 flex-1`} />
      <Submit label="Unlock" variant="danger" />
      {state.error ? <p className="w-full text-xs text-brand">{state.error}</p> : null}
    </form>
  );
}

export function CashAdvanceForm({ staff }: { staff: Person[] }) {
  const [state, action] = useActionState(giveCashAdvance, emptyActionState);
  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
      <Field label="Staff">
        <select name="staff_id" required className={fieldClass}>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </Field>
      <Field label="Amount"><input name="amount" inputMode="decimal" required className={fieldClass} /></Field>
      <Field label="From">
        <select name="source" defaultValue="cash_drawer" className={fieldClass}>
          {MONEY_SOURCES.map((s) => <option key={s} value={s}>{MONEY_SOURCE_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Deduction plan">
        <select name="deduction_plan" defaultValue="decide_on_payday" className={fieldClass}>
          {DEDUCTION_PLANS.map((d) => <option key={d} value={d}>{humanise(d)}</option>)}
        </select>
      </Field>
      <Field label="Reason"><input name="reason" className={fieldClass} /></Field>
      <div className="sm:col-span-3 lg:col-span-5"><Result state={state} /></div>
      <div className="sm:col-span-3 lg:col-span-5"><Submit label="Give advance" /></div>
    </form>
  );
}
