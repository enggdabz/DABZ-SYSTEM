import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { ORDER_STATUS_LABELS, isOpenOrder } from "@/lib/apparel";
import { requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getApparelOrders } from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos, sumCentavos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday, parseISODate } from "@/lib/period";

import { NewOrderForm } from "./ApparelForms";

export const metadata = { title: "Dabz Apparel · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

export default async function ApparelPage() {
  await connection();

  const user = await requirePermission("apparel_job_orders");
  const canSetPrices = isOwnerOrAdmin(user);

  const today = manilaToday();
  const [orders, customers] = await Promise.all([
    getApparelOrders(),
    getCustomers(),
  ]);

  const open = orders.filter((entry) => isOpenOrder(entry.order.status));
  const closed = orders.filter((entry) => !isOpenOrder(entry.order.status));

  // A released order with money still owed stays in sight: the jerseys have
  // gone, so the only thing left to chase is the balance.
  const owing = orders.filter(
    (entry) =>
      entry.order.status === "released" && entry.totals.balanceCentavos > 0,
  );

  const outstanding = sumCentavos(
    orders
      .filter((entry) => entry.order.status !== "cancelled")
      .map((entry) => entry.totals.balanceCentavos),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dabz Apparel</h1>
          <p className="mt-2 text-muted">
            {DIVISIONS.apparel.tagline} &middot; job orders, name lists and what
            is still owed.
          </p>
        </div>
        <NewOrderForm
          customers={customers
            .filter((customer) => customer.active)
            .map((customer) => ({ id: customer.id, name: customer.name }))}
          today={civilDateToISO(today)}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Orders in progress">
          <p className="text-2xl font-semibold">{open.length}</p>
          <p className="mt-1 text-sm text-muted">
            {open.length === 0
              ? "Nothing being made right now."
              : "From quoted through to ready for pickup."}
          </p>
        </Card>

        <Card title="Still owed">
          <p className="text-2xl font-semibold">{formatPesos(outstanding)}</p>
          <p className="mt-1 text-sm text-muted">
            Across every order that has not been cancelled.
          </p>
        </Card>

        <Card title="Released, not paid">
          <p className="text-2xl font-semibold">{owing.length}</p>
          <p className="mt-1 text-sm text-muted">
            {owing.length === 0
              ? "Everything released has been paid for."
              : "The goods have gone; the money has not come."}
          </p>
        </Card>
      </div>

      {canSetPrices ? (
        <Notice tone="info" title="Nothing here is priced yet">
          The five items, the size surcharges and the down payment policy are
          all yours to set. Orders work without them &mdash; the price is asked
          for on each line.{" "}
          <Link href="/apparel/prices" className="underline">
            Set the apparel prices
          </Link>
          .
        </Notice>
      ) : null}

      <Card
        title={`In progress (${open.length})`}
        description="Newest first. Anything overdue or waiting on a price is marked."
      >
        {open.length === 0 ? (
          <Notice tone="info" title="No open job orders">
            Press <strong>New job order</strong> to start one.
          </Notice>
        ) : (
          <ul className="space-y-5">
            {open.map(({ order, totals, warnings }) => (
              <li
                key={order.id}
                className="border-t border-line/60 pt-5 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <Link
                      href={`/apparel/${order.id}`}
                      className="text-lg font-semibold underline-offset-2 hover:underline"
                    >
                      {order.teamName ?? order.orderNumber}
                    </Link>
                    <p className="text-xs text-muted">
                      {order.orderNumber} &middot;{" "}
                      {ORDER_STATUS_LABELS[order.status]} &middot; promised{" "}
                      {showDate(order.promisedOn)}
                      {order.customerName ? ` · ${order.customerName}` : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold">
                      {formatPesos(totals.totalCentavos)}
                    </p>
                    <p className="text-xs text-muted">
                      {totals.itemCount} item
                      {totals.itemCount === 1 ? "" : "s"} &middot;{" "}
                      {totals.balanceCentavos > 0
                        ? `${formatPesos(totals.balanceCentavos)} owed`
                        : "paid"}
                    </p>
                  </div>
                </div>

                {warnings.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {warnings.map((warning) => (
                      <li key={warning.kind} className="text-xs text-attention">
                        <span aria-hidden="true">{"⚠"} </span>
                        {warning.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {closed.length > 0 ? (
        <Card
          title="Finished and cancelled"
          description="Kept, because the customer may still be holding the job order sheet."
        >
          <ul className="divide-y divide-line/60">
            {closed.map(({ order, totals, warnings }) => (
              <li
                key={order.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="min-w-0">
                  <Link
                    href={`/apparel/${order.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {order.teamName ?? order.orderNumber}
                  </Link>
                  <span className="block text-xs text-muted">
                    {order.orderNumber} &middot; {showDate(order.orderedOn)}
                    {order.cancelReason ? ` · ${order.cancelReason}` : ""}
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-3 text-right">
                  {order.status === "cancelled" ? (
                    <Tag>Cancelled</Tag>
                  ) : warnings.some(
                      (warning) => warning.kind === "released_with_balance",
                    ) ? (
                    <Tag tone="attention">
                      {"⚠"} {formatPesos(totals.balanceCentavos)} owed
                    </Tag>
                  ) : (
                    <Tag tone="success">Paid</Tag>
                  )}
                  <span className="font-semibold">
                    {formatPesos(totals.totalCentavos)}
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
