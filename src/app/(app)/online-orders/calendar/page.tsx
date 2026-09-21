import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getOnlineOrders, getProductionStages } from "@/lib/data/online";
import { buildOrderCalendar, shortOrderNo } from "@/lib/online/calendar";
import { fullMarker } from "@/lib/online/capacity";
import { stageNote } from "@/lib/online/production";
import { isOverdue } from "@/lib/online/status";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/online/types";
import {
  addMonths,
  currentPeriod,
  formatCivilDate,
  formatPeriod,
  manilaToday,
  parsePeriodKey,
  periodKey,
} from "@/lib/period";

import { OnlineTabs } from "../OnlineTabs";
import { StatusBadge } from "../StatusBadge";
import { onlineTabs } from "../tabs";

export const metadata = { title: "Order calendar · Dabz System" };

/**
 * Every status has its own FILL as well as its own word (docs/spec.md 5.3),
 * so a glance at the month reads even for somebody who cannot tell the
 * colours apart: early states are outlines, work in hand is solid ink, packed
 * is solid gold, and red belongs to overdue and nothing else.
 */
const ENTRY_STYLE: Record<OrderStatus, string> = {
  new: "bg-muted text-surface",
  quoted: "bg-surface text-ink ring-1 ring-gold",
  confirmed: "bg-surface text-ink ring-1 ring-ink",
  in_production: "bg-ink text-surface",
  ready_to_ship: "bg-gold text-on-gold",
  completed: "bg-muted/55 text-surface",
  cancelled: "hidden",
};

export default async function OrderCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await connection();
  const user = await requirePermission("apparel_job_orders");

  const [params, orders, stages, settings] = await Promise.all([
    searchParams,
    getOnlineOrders(),
    getProductionStages(),
    getSettings(),
  ]);

  const today = manilaToday();
  const period = parsePeriodKey(params.month ?? "") ?? currentPeriod();

  const calendar = buildOrderCalendar({
    orders,
    period,
    today,
    dailyCapacityPcs: settings.onlineDailyCapacityPcs,
  });

  const previous = periodKey(addMonths(period, -1));
  const next = periodKey(addMonths(period, 1));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Order calendar</h1>
        <p className="mt-2 text-muted">
          When every online order is promised for.
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(isOwnerOrAdmin(user))} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {formatPeriod(period)}
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href={`?month=${previous}`} className={`underline ${TAP_AREA}`}>
            <span aria-hidden="true">{"‹"}</span> Previous
          </Link>
          <Link href={`?month=${periodKey(currentPeriod())}`} className={`underline ${TAP_AREA}`}>
            Today
          </Link>
          <Link href={`?month=${next}`} className={`underline ${TAP_AREA}`}>
            Next <span aria-hidden="true">{"›"}</span>
          </Link>
        </div>
      </div>

      {settings.onlineDailyCapacityPcs === null ? (
        <Notice tone="info" title="No daily capacity set">
          <p>
            Nothing here says a day is full, because nobody has said how many
            pieces the shop can finish for one date. A made-up figure would
            turn a customer away from a day you were free.{" "}
            <Link href="/settings" className={`underline ${TAP_AREA}`}>
              Set it in Settings
            </Link>
            .
          </p>
        </Notice>
      ) : null}

      {calendar.overdueThisMonth > 0 ? (
        <Notice
          tone="attention"
          title={`${calendar.overdueThisMonth} order${
            calendar.overdueThisMonth === 1 ? " is" : "s are"
          } past their date this month`}
        />
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {(
          ["new", "quoted", "confirmed", "in_production", "ready_to_ship", "completed"] as OrderStatus[]
        ).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-3 rounded-sm ${ENTRY_STYLE[status]}`}
            />
            {ORDER_STATUS_LABELS[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-accent" />
          Overdue
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[42rem] table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <th
                  key={day}
                  className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.weeks.map((week) => (
              <tr key={week[0].date}>
                {week.map((day) => {
                  const marker = fullMarker(day.load);
                  return (
                    <td
                      key={day.date}
                      className={`h-24 align-top rounded-control p-1.5 ring-1 ring-line/60 ${
                        day.inMonth ? "bg-surface" : "bg-surface/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                            day.isToday
                              ? "bg-accent font-semibold text-on-accent"
                              : day.inMonth
                                ? ""
                                : "text-muted"
                          }`}
                        >
                          {day.day}
                        </span>
                        {marker ? (
                          <span className="text-[10px] font-semibold text-accent">
                            {marker}
                          </span>
                        ) : null}
                      </div>

                      <ul className="mt-1 space-y-0.5">
                        {day.orders.map((order) => {
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
                            <li key={order.id}>
                              <Link
                                href={`/online-orders/${order.orderNo}`}
                                title={`${order.orderNo} · ${order.customerName} · ${
                                  ORDER_STATUS_LABELS[order.status]
                                }${note ? ` · ${note}` : ""}${late ? " · Overdue" : ""}`}
                                className={`block truncate rounded px-1 py-0.5 text-[11px] ${
                                  late ? "bg-accent text-on-accent" : ENTRY_STYLE[order.status]
                                }`}
                              >
                                {/* A thin bar on a phone; the list below does the reading. */}
                                <span className="hidden sm:inline">
                                  {shortOrderNo(order.orderNo)} {order.customerName}
                                </span>
                                <span className="sm:hidden">&nbsp;</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card title={`Due in ${formatPeriod(period)}`}>
        {calendar.dueThisMonth.length === 0 ? (
          <p className="text-sm text-muted">Nothing is due this month.</p>
        ) : (
          <ul className="space-y-3">
            {calendar.dueThisMonth.map((order) => {
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
                <li key={order.id} className="border-t border-line/60 pt-3 first:border-0 first:pt-0">
                  <Link
                    href={`/online-orders/${order.orderNo}`}
                    className="flex flex-wrap items-start justify-between gap-3"
                  >
                    <span className="min-w-40">
                      <span className="block text-sm font-medium">
                        {formatCivilDate(order.dateNeeded)} &middot; {order.orderNo}
                      </span>
                      <span className="block text-sm text-muted">
                        {order.customerName} &middot; {order.pieces} pcs
                        {note ? ` · ${note}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={order.status} overdue={late} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
