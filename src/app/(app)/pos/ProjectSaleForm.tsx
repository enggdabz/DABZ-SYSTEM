"use client";

/**
 * The Counter's "Project" sale (Phase 15).
 *
 * A project is a job for one of the three divisions: a customer, a
 * description, a total price and a due date, with a down payment (or the whole
 * price) taken today. The figures on this screen are a PREVIEW. The Server
 * Action re-checks every one of them, and the database function checks them
 * again, because the balance is money.
 *
 * Only what is paid NOW is a sale, so End of day stays correct. The balance is
 * not shown as a sale anywhere - it lives on the project.
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
  TAP_AREA,
} from "@/components/ui";
import { formatPesos, parsePesos } from "@/lib/money";
import {
  PROJECT_CATEGORIES,
  PROJECT_DIVISIONS,
  PROJECT_DIVISION_LABELS,
  belowDownPaymentPolicy,
  isProjectDivision,
} from "@/lib/projects";

import {
  createProjectSaleAction,
  type ProjectSaleState,
} from "../projects/actions";
import type { PosCustomer } from "./PosScreen";

/** Pesos as typed, or null when the box is empty or not an amount. */
function tryPesos(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parsePesos(text);
  } catch {
    return null;
  }
}

const TEXTAREA_CLASS =
  "w-full rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50";

export function ProjectSaleForm({
  customers,
  downPaymentPercent,
}: {
  customers: PosCustomer[];
  downPaymentPercent: number | null;
}) {
  // Bumping the key remounts the form, which is the whole of "start another".
  const [round, setRound] = useState(0);
  return (
    <ProjectSaleFormInner
      key={round}
      customers={customers}
      downPaymentPercent={downPaymentPercent}
      onAnother={() => setRound((value) => value + 1)}
    />
  );
}

function ProjectSaleFormInner({
  customers,
  downPaymentPercent,
  onAnother,
}: {
  customers: PosCustomer[];
  downPaymentPercent: number | null;
  onAnother: () => void;
}) {
  const [state, submit, pending] = useActionState<ProjectSaleState, FormData>(
    createProjectSaleAction,
    {},
  );

  const [division, setDivision] = useState("");
  const [category, setCategory] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [total, setTotal] = useState("");
  const [kind, setKind] = useState<"down" | "full">("down");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [moneyGiven, setMoneyGiven] = useState("");

  const totalCentavos = tryPesos(total);
  // A full payment is the whole price, so there is nothing to type.
  const shownAmount = kind === "full" ? total : amount;
  const amountCentavos = tryPesos(shownAmount);

  const balanceCentavos =
    totalCentavos !== null && amountCentavos !== null
      ? totalCentavos - amountCentavos
      : null;

  const change = useMemo(() => {
    if (paymentMethod !== "cash" || amountCentavos === null) return null;
    const given = tryPesos(moneyGiven);
    return given === null ? null : given - amountCentavos;
  }, [paymentMethod, amountCentavos, moneyGiven]);

  const belowPolicy =
    kind === "down" && totalCentavos !== null && amountCentavos !== null
      ? belowDownPaymentPolicy({
          totalCentavos,
          amountCentavos,
          policyPercent: downPaymentPercent,
        })
      : false;

  const errors = state.fieldErrors ?? {};
  const categories = isProjectDivision(division)
    ? PROJECT_CATEGORIES[division]
    : [];

  if (state.created) {
    const done = state.created;
    return (
      <div className="space-y-4">
        <Notice tone="success" title={`Project ${done.projectNumber} started`}>
          <p>
            Sale {done.saleNumber} for {formatPesos(amountCentavos ?? 0)} is on
            the counter today.
            {done.balanceCentavos > 0
              ? ` ${formatPesos(done.balanceCentavos)} is still owed and stays on the project.`
              : " The project is fully paid."}
          </p>
          {paymentMethod === "cash" && done.changeCentavos > 0 ? (
            <p className="mt-1 font-medium">
              Give change: {formatPesos(done.changeCentavos)}
            </p>
          ) : null}
        </Notice>
        {done.policyWarning ? (
          <Notice tone="attention" title="Under the down payment policy">
            <p>{done.policyWarning}</p>
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${done.projectId}`}
            className={buttonClasses("primary")}
          >
            Open the project
          </Link>
          <Link
            href={`/sales/${done.saleId}/receipt`}
            className={buttonClasses("secondary")}
          >
            Print the receipt
          </Link>
          <button
            type="button"
            onClick={onAnother}
            className={`text-sm underline underline-offset-2 ${TAP_AREA}`}
          >
            Start another project
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-6" noValidate>
      {state.error ? (
        <Notice tone="attention" title="The project was not saved">
          <p>{state.error}</p>
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-card bg-surface p-5 ring-1 ring-line/60">
          <h2 className="text-base font-semibold tracking-tight">The job</h2>

          <Field label="Division" error={errors.division}>
            <Select
              name="division"
              value={division}
              onChange={(event) => {
                setDivision(event.target.value);
                setCategory("");
              }}
            >
              <option value="">Choose a division…</option>
              {PROJECT_DIVISIONS.map((id) => (
                <option key={id} value={id}>
                  {PROJECT_DIVISION_LABELS[id]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Kind of job"
            hint="What the money is filed as in the books."
            error={errors.incomeCategory}
          >
            <Select
              name="incomeCategory"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={categories.length === 0}
            >
              <option value="">
                {categories.length === 0
                  ? "Choose a division first"
                  : "Choose the kind of job…"}
              </option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Job description" error={errors.description}>
            <textarea
              name="description"
              rows={3}
              className={TEXTAREA_CLASS}
              placeholder="e.g. 15 sublimation jerseys, team Falcons"
            />
          </Field>

          <Field
            label="Total project price"
            hint="The agreed price for the whole job."
            error={errors.total}
          >
            <Input
              name="total"
              inputMode="decimal"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              placeholder="e.g. 9000"
            />
          </Field>

          <Field
            label={
              kind === "down"
                ? "Due date (required with a down payment)"
                : "Due / target release date"
            }
            hint={
              kind === "down"
                ? "The project goes on the Projects calendar on this day."
                : "Optional. If you give one, the project goes on the calendar."
            }
            error={errors.dueOn}
          >
            <Input name="dueOn" type="date" />
          </Field>
        </div>

        <div className="space-y-4 rounded-card bg-surface p-5 ring-1 ring-line/60">
          <h2 className="text-base font-semibold tracking-tight">
            The customer
          </h2>

          {customers.length > 0 ? (
            <Field label="Existing customer (optional)">
              <Select
                name="customerId"
                value={customerId}
                onChange={(event) => {
                  const chosen = customers.find(
                    (entry) => entry.id === event.target.value,
                  );
                  setCustomerId(event.target.value);
                  if (chosen) {
                    setCustomerName(chosen.name);
                    setContact(chosen.contactNumber ?? "");
                  }
                }}
              >
                <option value="">Not on the list</option>
                {customers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Customer name" error={errors.customerName}>
            <Input
              name="customerName"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </Field>

          <Field label="Contact" hint="Messenger name or phone number.">
            <Input
              name="contact"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-card bg-surface p-5 ring-1 ring-line/60">
        <h2 className="text-base font-semibold tracking-tight">
          Payment today
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment type" error={errors.kind}>
            <Select
              name="kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as "down" | "full")
              }
            >
              <option value="down">Downpayment</option>
              <option value="full">Full payment</option>
            </Select>
          </Field>

          <Field
            label="Amount paid now"
            hint={
              kind === "full"
                ? "The whole price."
                : "Only this goes on today's sales."
            }
            error={errors.amount}
          >
            <Input
              name="amount"
              inputMode="decimal"
              value={shownAmount}
              readOnly={kind === "full"}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 3000"
            />
          </Field>
        </div>

        <div className="rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
          <p className="text-xs text-muted">Balance (total minus paid now)</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight">
            {balanceCentavos === null ? (
              "—"
            ) : balanceCentavos < 0 ? (
              <span className="text-attention">
                <span aria-hidden="true">{"⚠"} </span>
                More than the total
              </span>
            ) : (
              formatPesos(balanceCentavos)
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            The balance stays on the project. It is not part of today&apos;s
            sales.
          </p>
        </div>

        {belowPolicy ? (
          <Notice tone="attention" title="Under the down payment policy">
            <p>
              That is under the {downPaymentPercent}% down payment policy. You
              can still take it - this is only a warning.
            </p>
          </Notice>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paying with">
            <Select
              name="paymentMethod"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="bank">Bank</option>
            </Select>
          </Field>

          {paymentMethod === "cash" ? (
            <Field label="Money given" error={errors.moneyGiven}>
              <Input
                name="moneyGiven"
                inputMode="decimal"
                value={moneyGiven}
                onChange={(event) => setMoneyGiven(event.target.value)}
                placeholder="e.g. 3000"
              />
            </Field>
          ) : (
            <Field
              label="Reference number"
              hint="From the payment app or slip."
            >
              <Input name="referenceNumber" placeholder="e.g. 0012345678" />
            </Field>
          )}
        </div>

        {paymentMethod === "cash" && change !== null ? (
          <p
            className={`text-sm ${change < 0 ? "text-attention" : "text-muted"}`}
          >
            {change < 0 ? (
              <>
                <span aria-hidden="true">{"⚠"} </span>
                {formatPesos(Math.abs(change))} short
              </>
            ) : (
              <>Change: {formatPesos(change)}</>
            )}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Complete project sale"}
        </Button>
      </div>
    </form>
  );
}
