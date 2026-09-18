import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getSales, getVoidRequests } from "@/lib/data/pos";
import { formatManilaDateTime } from "@/lib/datetime";
import { formatPesos, sumCentavos } from "@/lib/money";
import { formatCivilDate, manilaToday } from "@/lib/period";

import { DecideVoidForm, RequestVoidForm } from "./SalesForms";

export const metadata = { title: "Sales · Dabz System" };

export default async function SalesPage() {
  await connection();

  // Any signed-in person may open this; Row Level Security decides what they
  // see - their own sales, or all of them with the daily report permission.
  const user = await requireUser();

  const today = manilaToday();
  const [sales, voidRequests] = await Promise.all([
    getSales({ date: today, limit: 200 }),
    getVoidRequests(),
  ]);

  const live = sales.filter((sale) => sale.voidedAt === null);
  const pending = voidRequests.filter((request) => request.status === "pending");
  const canDecide = isOwnerOrAdmin(user);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Sales</h1>
        <p className="mt-2 text-muted">
          {formatCivilDate(today)}
          {canDecide ? "" : " · the sales you rang up"}
        </p>
      </div>

      {canDecide && pending.length > 0 ? (
        <Card
          title={`Void requests waiting (${pending.length})`}
          description="A staff member thinks one of these sales was a mistake. Nothing changes until you decide."
        >
          <ul className="space-y-5">
            {pending.map((request) => {
              const sale = sales.find((entry) => entry.id === request.saleId);
              return (
                <li key={request.id} className="border-t border-line/60 pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {sale ? sale.saleNumber : "Sale"}{" "}
                      {sale ? `· ${formatPesos(sale.totalCentavos)}` : ""}
                    </span>
                    <span className="text-xs text-muted">
                      {formatManilaDateTime(request.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{request.reason}</p>
                  <div className="mt-3">
                    <DecideVoidForm requestId={request.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-muted">Sales today</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {live.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Taken today</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(sumCentavos(live.map((sale) => sale.totalCentavos)))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Voided</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {sales.length - live.length}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title={`Today's sales (${sales.length})`}>
        {sales.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing rung up yet today.{" "}
            <Link href="/pos" className="underline">
              Open the counter
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {sales.map((sale) => {
              const request = voidRequests.find(
                (entry) => entry.saleId === sale.id && entry.status === "pending",
              );

              return (
                <li key={sale.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className={sale.voidedAt ? "opacity-60" : ""}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-lg font-semibold tracking-tight ${
                            sale.voidedAt ? "line-through" : ""
                          }`}
                        >
                          {formatPesos(sale.totalCentavos)}
                        </span>
                        <Tag>{sale.saleNumber}</Tag>
                        <Tag>{sale.paymentMethod}</Tag>
                        {sale.voidedAt ? (
                          <Tag tone="attention">{"⚠"} Voided</Tag>
                        ) : null}
                        {request ? <Tag tone="attention">Void requested</Tag> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {formatManilaDateTime(sale.occurredAt)}
                        {sale.discountCentavos > 0
                          ? ` · ${formatPesos(sale.discountCentavos)} discount`
                          : ""}
                      </p>
                      {sale.voidReason ? (
                        <p className="mt-1 text-xs text-attention">
                          Voided: {sale.voidReason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`/sales/${sale.id}/receipt`}
                        className="text-sm underline"
                      >
                        Receipt
                      </Link>
                      {!sale.voidedAt && !request ? (
                        canDecide ? null : (
                          <RequestVoidForm saleId={sale.id} />
                        )
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!canDecide ? (
        <Notice tone="info" title="You cannot undo a sale yourself">
          <p>
            That is on purpose. If one was a mistake, ask to void it and the
            owner decides. The sale stands until then, so the books never
            disagree with the drawer.
          </p>
        </Notice>
      ) : null}
    </div>
  );
}
