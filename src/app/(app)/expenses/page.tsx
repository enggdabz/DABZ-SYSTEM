import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getExpensePresets, getExpenses, getSuppliers } from "@/lib/data/expenses";
import { formatManilaDateTime } from "@/lib/datetime";
import { divisionName } from "@/lib/divisions";
import {
  describeExpenseStatus,
  expenseCategoryLabel,
  expenseTotals,
} from "@/lib/expenses";
import { MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString, formatPesos } from "@/lib/money";

import { DecideExpenseForm, PresetForm, SupplierForm } from "./ExpenseForms";

export const metadata = { title: "Expenses · Dabz System" };

export default async function ExpensesPage() {
  await connection();

  // Anyone who may record an expense may open this; Row Level Security decides
  // what comes back - their own entries, or the whole shop's.
  const user = await requirePermission("record_expenses");
  const canDecide = isOwnerOrAdmin(user);

  const [expenses, presets, suppliers] = await Promise.all([
    getExpenses(),
    getExpensePresets(),
    getSuppliers(),
  ]);

  const totals = expenseTotals(expenses);
  const waiting = expenses.filter((expense) => expense.status === "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Expenses</h1>
        <p className="mt-2 text-muted">
          Money that left the shop. Record one from the{" "}
          <span className="font-medium text-ink">+ Expense</span> button at the
          top of any screen &mdash; it is meant to take under ten seconds.
        </p>
      </div>

      {canDecide && waiting.length > 0 ? (
        <Card
          title={`Waiting for you (${waiting.length})`}
          description="A staff member spent more than the limit in Settings. None of this money has been counted yet."
        >
          <ul className="space-y-6">
            {waiting.map((expense) => (
              <li key={expense.id} className="border-t border-line/60 pt-5 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="text-lg font-semibold">
                      {formatPesos(expense.amountCentavos)}
                    </span>
                    <span className="ml-2 text-sm text-muted">
                      {expenseCategoryLabel(expense.category)} &middot;{" "}
                      {divisionName(expense.tag)}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {expense.createdByName ?? "Someone"} &middot;{" "}
                    {formatManilaDateTime(expense.occurredAt)}
                  </span>
                </div>

                {expense.note ? (
                  <p className="mt-1 text-sm text-ink/80">{expense.note}</p>
                ) : null}

                <div className="mt-4">
                  <DecideExpenseForm
                    expenseId={expense.id}
                    amountLabel={formatPesos(expense.amountCentavos)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title={canDecide ? "Recorded" : "Recorded by you"}>
          <p className="text-2xl font-semibold">
            {formatPesos(totals.spentCentavos)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Across the last {expenses.length} entr
            {expenses.length === 1 ? "y" : "ies"}.
          </p>
        </Card>

        <Card title="Waiting">
          <p className="text-2xl font-semibold">
            {formatPesos(totals.pendingCentavos)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {totals.pendingCount === 0
              ? "Nothing is waiting."
              : `${totals.pendingCount} entr${
                  totals.pendingCount === 1 ? "y" : "ies"
                } not yet counted anywhere.`}
          </p>
        </Card>

        <Card title="Quick picks">
          <p className="text-2xl font-semibold">
            {presets.filter((preset) => preset.active).length}
          </p>
          <p className="mt-1 text-sm text-muted">
            Buttons in the expense pop-up.
          </p>
        </Card>
      </div>

      <Card
        title="Recent expenses"
        description={
          canDecide
            ? "Everything recorded, newest first."
            : "The expenses you recorded, newest first."
        }
      >
        {expenses.length === 0 ? (
          <Notice tone="info" title="Nothing recorded yet">
            Use the <strong>+ Expense</strong> button at the top of the screen.
          </Notice>
        ) : (
          <ul className="divide-y divide-line/60">
            {expenses.map((expense) => {
              const status = describeExpenseStatus(expense.status);
              return (
                <li
                  key={expense.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="min-w-0">
                    <span className="font-medium">
                      {expenseCategoryLabel(expense.category)}
                    </span>
                    {expense.note ? (
                      <span className="block truncate text-sm text-muted">
                        {expense.note}
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted">
                      {formatManilaDateTime(expense.occurredAt)} &middot;{" "}
                      {divisionName(expense.tag)} &middot;{" "}
                      {MONEY_SOURCE_LABELS[expense.source] ?? expense.source}
                      {canDecide && expense.createdByName
                        ? ` · ${expense.createdByName}`
                        : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`font-semibold ${
                        expense.status === "approved" ? "" : "text-muted line-through"
                      }`}
                    >
                      {formatPesos(expense.amountCentavos)}
                    </span>
                    {status.warn ? (
                      <span className="mt-0.5 block text-xs text-attention">
                        <span aria-hidden="true">{"⚠"} </span>
                        {status.label}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canDecide ? (
        <>
          <Card
            title="Quick picks"
            description="The buttons in the expense pop-up. These start as the plain categories from your specification — rename them to what you actually buy, and they get faster."
          >
            <Notice tone="info" title="No usual amounts were filled in">
              A usual amount is a figure only you can know, so every quick pick
              asks for the amount. Fill one in only where it really is always
              the same.
            </Notice>

            <ul className="mt-5 divide-y divide-line/60">
              {presets.map((preset) => (
                <li
                  key={preset.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span>
                    <span className="font-medium">{preset.label}</span>
                    {!preset.active ? (
                      <span className="ml-2">
                        <Tag>Hidden</Tag>
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted">
                      {expenseCategoryLabel(preset.category)} &middot;{" "}
                      {divisionName(preset.tag)} &middot;{" "}
                      {preset.defaultAmountCentavos === null
                        ? "asks for the amount"
                        : `₱${centavosToDecimalString(preset.defaultAmountCentavos)}`}
                    </span>
                  </span>
                  <PresetForm preset={preset} />
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <PresetForm />
            </div>
          </Card>

          <Card
            title="Suppliers"
            description="Who the shop buys from. Adding them here lets a delivery be recorded against a name, and lets you see what is still owed."
          >
            {suppliers.length === 0 ? (
              <Notice tone="info" title="No suppliers yet">
                Add the shops you buy paper, ink and vinyl from. Nothing is
                blocked without them.
              </Notice>
            ) : (
              <ul className="divide-y divide-line/60">
                {suppliers.map((supplier) => (
                  <li
                    key={supplier.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span>
                      <span className="font-medium">{supplier.name}</span>
                      {!supplier.active ? (
                        <span className="ml-2">
                          <Tag>No longer used</Tag>
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted">
                        {supplier.contactNumber ?? "No contact number"}
                        {supplier.address ? ` · ${supplier.address}` : ""}
                      </span>
                    </span>
                    <SupplierForm supplier={supplier} />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5">
              <SupplierForm />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
