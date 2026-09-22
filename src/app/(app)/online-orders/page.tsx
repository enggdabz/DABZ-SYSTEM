import Link from "next/link";
import { connection } from "next/server";

import { Card, Disclosure, Notice, TAP_AREA } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getOnlineOrders, getOnlineProducts, getProductionStages } from "@/lib/data/online";
import { formatPesos } from "@/lib/money";
import {
  applyOrderFilter,
  itemsLabel,
  listTiles,
  parseOrderFilter,
  sortOrders,
  ORDER_FILTERS,
} from "@/lib/online/list";
import { stageNote } from "@/lib/online/production";
import { isOverdue } from "@/lib/online/status";
import { summaryAwaitingQuote, summaryTotalLabel } from "@/lib/online/totals";
import { formatCivilDate, manilaToday } from "@/lib/period";

import { AddManualOrder } from "./AddManualOrder";
import { FilterChips } from "./FilterChips";
import { OnlineTabs } from "./OnlineTabs";
import { StatusBadge } from "./StatusBadge";
import { onlineTabs } from "./tabs";

export const metadata = { title: "Online orders · Dabz System" };

export default async function OnlineOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await connection();
  const user = await requirePermission("apparel_job_orders");

  const [params, orders, stages, products, settings] = await Promise.all([
    searchParams,
    getOnlineOrders(),
    getProductionStages(),
    getOnlineProducts(),
    getSettings(),
  ]);

  const today = manilaToday();
  const filter = parseOrderFilter(params.show);
  const tiles = listTiles(orders, today);
  const shown = sortOrders(applyOrderFilter(orders, filter, today), today);

  const counts = Object.fromEntries(
    ORDER_FILTERS.map((option) => [
      option,
      applyOrderFilter(orders, option, today).length,
    ]),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Online orders</h1>
        <p className="mt-2 text-muted">
          What customers have ordered from the shop, and the Messenger and
          walk-in orders you have typed in.
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(isOwnerOrAdmin(user))} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Open orders" value={String(tiles.openOrders)} />
        <Tile label="Need a quote" value={String(tiles.needAQuote)} />
        <Tile label="Due in 7 days" value={String(tiles.dueInSevenDays)} />
        <Tile
          label="Overdue"
          value={String(tiles.overdue)}
          attention={tiles.overdue > 0}
        />
        <Tile
          label="Unpaid balance"
          value={formatPesos(tiles.unpaidBalanceCentavos)}
          attention={tiles.unpaidBalanceCentavos > 0}
        />
      </section>

      <FilterChips current={filter} counts={counts} />

      {orders.length === 0 ? (
        <Notice tone="info" title="No online orders yet">
          <p>
            Nothing has come in from the shop, and nobody has typed one in.
            When a customer orders, it lands here with its number, and the
            owner&rsquo;s phone gets a notification.
          </p>
          {products.length === 0 ? (
            <p className="mt-2">
              The shop has no products on it yet, so there is nothing a
              customer could order.{" "}
              <Link href="/online-orders/products" className={`underline ${TAP_AREA}`}>
                Add the first one
              </Link>
              .
            </p>
          ) : null}
        </Notice>
      ) : null}

      <Disclosure label="Add an order that came in another way">
        <AddManualOrder
          products={products}
          minDaysAhead={settings.onlineMinDaysAhead}
        />
      </Disclosure>

      {shown.length === 0 && orders.length > 0 ? (
        <p className="text-muted">Nothing matches that filter.</p>
      ) : null}

      <section className="space-y-3">
        {shown.map((order) => {
          const late = isOverdue(order, today);
          const note =
            order.status === "in_production"
              ? stageNote(
                  stages,
                  order.productionPath,
                  order.doneStageKeys.map((stageKey) => ({
                    stageKey,
                    doneAt: "",
                    doneByName: null,
                    skipped: false,
                  })),
                )
              : null;

          return (
            <Card key={order.id} className="!p-0">
              <Link
                href={`/online-orders/${order.orderNo}`}
                className="flex flex-wrap items-start gap-x-6 gap-y-3 p-5"
              >
                <div className="min-w-32">
                  <p className="font-semibold tracking-tight">{order.orderNo}</p>
                  <p className="text-sm text-muted">{order.customerName}</p>
                  {order.source === "manual" ? (
                    <p className="text-xs text-muted">Typed in</p>
                  ) : null}
                </div>

                <div className="min-w-36 flex-1 text-sm">
                  <p>{itemsLabel(order)}</p>
                  <p className="text-muted">
                    {order.pieces} piece{order.pieces === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="min-w-28 text-sm">
                  <p className={late ? "font-medium text-accent" : undefined}>
                    {formatCivilDate(order.dateNeeded)}
                  </p>
                </div>

                <div className="min-w-28 text-sm">
                  <p className="font-medium">{summaryTotalLabel(order)}</p>
                  {/*
                    No balance at all while part of the order is unpriced: a
                    balance built on a missing figure is a bill for the wrong
                    amount.
                  */}
                  {summaryAwaitingQuote(order) ? null : (
                    <p
                      className={
                        order.balanceCentavos > 0 ? "text-accent" : "text-muted"
                      }
                    >
                      {formatPesos(order.balanceCentavos)} left
                    </p>
                  )}
                </div>

                <div className="min-w-36">
                  <StatusBadge status={order.status} overdue={late} />
                  {note ? (
                    <p className="mt-1 text-xs text-muted">{note}</p>
                  ) : null}
                </div>
              </Link>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="rounded-card bg-surface p-4 ring-1 ring-line/60">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          attention ? "text-accent" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
