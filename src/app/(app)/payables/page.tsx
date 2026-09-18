import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getPayables, getSuppliers } from "@/lib/data/expenses";
import { payableStatus, payableTotals } from "@/lib/expenses";
import { formatPesos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday, parseISODate } from "@/lib/period";

import { PayableForm, PayForm } from "./PayableForms";

export const metadata = { title: "Owed to suppliers · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

export default async function PayablesPage() {
  await connection();

  // Debt, in the same class as bills and loans (spec 4.3). Staff cannot see it
  // at all - the database has no policy that would let them.
  await requireOwnerOrAdmin();

  const today = manilaToday();
  const todayISO = civilDateToISO(today);

  const [payables, suppliers] = await Promise.all([getPayables(), getSuppliers()]);
  const totals = payableTotals(payables, todayISO);

  const unpaid = payables.filter((payable) => payable.status === "unpaid");
  const paid = payables.filter((payable) => payable.status === "paid");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Owed to suppliers</h1>
        <p className="mt-2 text-muted">
          Stock you have received but not paid for yet. Receiving a delivery
          &ldquo;on account&rdquo; on the Stocks screen adds it here by itself.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Still owed">
          <p className="text-2xl font-semibold">
            {formatPesos(totals.unpaidCentavos)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {totals.unpaidCount === 0
              ? "Nothing outstanding."
              : `Across ${totals.unpaidCount} deliver${
                  totals.unpaidCount === 1 ? "y" : "ies"
                }.`}
          </p>
        </Card>

        <Card title="Needs attention">
          <p className="text-2xl font-semibold">{totals.needingAttentionCount}</p>
          <p className="mt-1 text-sm text-muted">
            {totals.needingAttentionCount === 0
              ? "Nothing overdue or undated."
              : "Overdue, due soon, or with no due date set."}
          </p>
        </Card>

        <Card title="Add one by hand">
          <p className="mt-1 text-sm text-muted">
            For a delivery that did not go through the Stocks screen.
          </p>
          <div className="mt-4">
            <PayableForm suppliers={suppliers} today={todayISO} />
          </div>
        </Card>
      </div>

      <Card
        title="Unpaid"
        description="Marking one paid records the money in Money in/out at the same moment, so the two can never disagree."
      >
        {unpaid.length === 0 ? (
          <Notice tone="success" title="Nothing owed to suppliers">
            Everything received has been paid for.
          </Notice>
        ) : (
          <ul className="space-y-6">
            {unpaid.map((payable) => {
              const status = payableStatus(payable, todayISO);
              return (
                <li
                  key={payable.id}
                  className="border-t border-line/60 pt-6 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <div>
                      <h3 className="font-semibold">{payable.description}</h3>
                      <p className="text-xs text-muted">
                        {payable.supplierName ?? "Supplier not recorded"} &middot;
                        received {showDate(payable.receivedOn)} &middot; due{" "}
                        {showDate(payable.dueOn)}
                      </p>
                      {payable.note ? (
                        <p className="mt-1 text-sm text-ink/80">{payable.note}</p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-semibold">
                        {formatPesos(payable.amountCentavos)}
                      </p>
                      {status.warn ? (
                        <p className="text-xs text-attention">
                          <span aria-hidden="true">{"⚠"} </span>
                          {status.label}
                        </p>
                      ) : (
                        <p className="text-xs text-muted">{status.label}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <PayForm
                      payableId={payable.id}
                      amountLabel={formatPesos(payable.amountCentavos)}
                      today={todayISO}
                    />
                    <PayableForm
                      payable={payable}
                      suppliers={suppliers}
                      today={todayISO}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {paid.length > 0 ? (
        <Card title="Paid" description="Kept, so a supplier's own records can be checked against yours.">
          <ul className="divide-y divide-line/60">
            {paid.map((payable) => (
              <li
                key={payable.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span>
                  <span className="font-medium">{payable.description}</span>
                  <span className="block text-xs text-muted">
                    {payable.supplierName ?? "Supplier not recorded"} &middot; paid{" "}
                    {showDate(payable.paidOn)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Tag tone="success">Paid</Tag>
                  <span className="font-semibold">
                    {formatPesos(payable.amountCentavos)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
