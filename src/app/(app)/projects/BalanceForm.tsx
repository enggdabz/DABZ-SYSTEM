"use client";

/**
 * Record a payment on a project's balance.
 *
 * It posts a NEW sale for today in the Counter, so End of day counts it on the
 * day the money actually came in. The amount starts at the whole balance and
 * can be lowered for an installment. The balance shown is a preview: the
 * server works it out again from the project's own sales.
 */
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  Button,
  buttonClasses,
  Field,
  Input,
  Notice,
  Select,
} from "@/components/ui";
import { centavosToDecimalString, formatPesos, parsePesos } from "@/lib/money";

import { recordProjectBalanceAction, type BalanceState } from "./actions";

function tryPesos(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parsePesos(text);
  } catch {
    return null;
  }
}

export function BalanceForm({
  projectId,
  balanceCentavos,
}: {
  projectId: string;
  balanceCentavos: number;
}) {
  const [state, submit, pending] = useActionState<BalanceState, FormData>(
    recordProjectBalanceAction,
    {},
  );
  const [amount, setAmount] = useState(
    centavosToDecimalString(balanceCentavos),
  );
  const [method, setMethod] = useState("cash");
  const [moneyGiven, setMoneyGiven] = useState("");

  const amountCentavos = tryPesos(amount);
  const remaining =
    amountCentavos === null ? null : balanceCentavos - amountCentavos;

  const change = useMemo(() => {
    if (method !== "cash" || amountCentavos === null) return null;
    const given = tryPesos(moneyGiven);
    return given === null ? null : given - amountCentavos;
  }, [method, amountCentavos, moneyGiven]);

  if (state.paid) {
    return (
      <div className="space-y-3">
        <Notice
          tone="success"
          title={`Payment recorded as sale ${state.paid.saleNumber}`}
        >
          <p>
            {state.paid.balanceCentavos === 0
              ? "The project is now fully paid."
              : `${formatPesos(state.paid.balanceCentavos)} is still owed.`}
          </p>
          {state.paid.changeCentavos > 0 ? (
            <p className="mt-1 font-medium">
              Give change: {formatPesos(state.paid.changeCentavos)}
            </p>
          ) : null}
        </Notice>
        <Link
          href={`/sales/${state.paid.saleId}/receipt`}
          className={buttonClasses("secondary")}
        >
          Print the receipt
        </Link>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4" noValidate>
      <input type="hidden" name="projectId" value={projectId} />

      {state.error ? (
        <Notice tone="attention" title="The payment was not saved">
          <p>{state.error}</p>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount being paid"
          hint={`Balance owing ${formatPesos(balanceCentavos)}.`}
          error={state.fieldErrors?.amount}
        >
          <Input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <Field label="Paying with">
          <Select
            name="paymentMethod"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="bank">Bank</option>
          </Select>
        </Field>

        {method === "cash" ? (
          <Field label="Money given" error={state.fieldErrors?.moneyGiven}>
            <Input
              name="moneyGiven"
              inputMode="decimal"
              value={moneyGiven}
              onChange={(event) => setMoneyGiven(event.target.value)}
            />
          </Field>
        ) : (
          <Field label="Reference number" hint="From the payment app or slip.">
            <Input name="referenceNumber" />
          </Field>
        )}
      </div>

      <p className="text-sm text-muted">
        {remaining === null ? null : remaining < 0 ? (
          <span className="text-attention">
            <span aria-hidden="true">{"⚠"} </span>
            More than the balance
          </span>
        ) : remaining === 0 ? (
          "This clears the balance and marks the project fully paid."
        ) : (
          `${formatPesos(remaining)} would still be owed.`
        )}
        {change !== null ? (
          <>
            {" "}
            {change < 0 ? (
              <span className="text-attention">
                <span aria-hidden="true">{"⚠"} </span>
                {formatPesos(Math.abs(change))} short.
              </span>
            ) : (
              <>Change: {formatPesos(change)}.</>
            )}
          </>
        ) : null}
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Record payment"}
      </Button>
    </form>
  );
}
