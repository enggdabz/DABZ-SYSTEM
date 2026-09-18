"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { recordDayClosing } from "@/app/admin/reports/actions";
import { Alert, Button, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import { formatCentavos, parsePesosToCentavos } from "@/lib/money";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Closing…" : "Close the day"}</Button>;
}

export function ClosingForm({
  date, expectedCash, totalSales, gcash, maya, bank,
}: {
  date: string;
  expectedCash: number;
  totalSales: number;
  gcash: number;
  maya: number;
  bank: number;
}) {
  const [state, action] = useActionState(recordDayClosing, emptyActionState);
  const [countedText, setCountedText] = useState("");

  const counted = parsePesosToCentavos(countedText);
  const difference = counted === null ? null : counted - expectedCash;

  return (
    <form action={action} className="grid gap-4 p-5 sm:grid-cols-3">
      <input type="hidden" name="closing_date" value={date} />
      <input type="hidden" name="expected_cash" value={expectedCash} />
      <input type="hidden" name="total_sales" value={totalSales} />
      <input type="hidden" name="gcash" value={(gcash / 100).toFixed(2)} />
      <input type="hidden" name="maya" value={(maya / 100).toFixed(2)} />
      <input type="hidden" name="bank" value={(bank / 100).toFixed(2)} />

      <Field label="Counted cash" hint="What is actually in the drawer.">
        <input
          name="counted_cash"
          inputMode="decimal"
          required
          value={countedText}
          onChange={(e) => setCountedText(e.target.value)}
          className={fieldClass}
        />
      </Field>

      <Field label="Target for the day">
        <input name="target" inputMode="decimal" defaultValue="0" className={fieldClass} />
      </Field>

      <Field label="Note"><input name="note" className={fieldClass} /></Field>

      <dl className="space-y-1.5 border-t border-line pt-4 text-sm sm:col-span-3">
        <div className="flex justify-between">
          <dt className="text-fg-muted">Expected in drawer</dt>
          <dd className="tabular-nums text-fg">{formatCentavos(expectedCash)}</dd>
        </div>
        {difference !== null ? (
          <div className="flex justify-between font-medium">
            <dt className="text-fg">
              {difference === 0 ? "Balanced" : difference > 0 ? "Over" : "Short"}
            </dt>
            <dd className={`tabular-nums ${difference === 0 ? "text-fg" : "text-brand"}`}>
              {formatCentavos(Math.abs(difference))}
            </dd>
          </div>
        ) : null}
      </dl>

      {state.error ? <div className="sm:col-span-3"><Alert>{state.error}</Alert></div> : null}
      {state.notice ? <div className="sm:col-span-3"><Alert tone="good">{state.notice}</Alert></div> : null}
      <div className="sm:col-span-3"><Submit /></div>
    </form>
  );
}
