import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag, buttonClasses } from "@/components/ui";
import { ORDER_STATUS_LABELS, isOpenOrder } from "@/lib/apparel";
import {
  scheduleAll,
  scheduleNote,
  summariseProjects,
  type CalendarSummary,
} from "@/lib/apparel-calendar";
import { requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getApparelOrders, toCalendarOrder } from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { getProductionSteps, productionFor } from "@/lib/data/production";
import { DIVISIONS } from "@/lib/divisions";
import { productionSummaryLine, summariseProduction } from "@/lib/production";
import { formatPesos, sumCentavos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday, parseISODate } from "@/lib/period";

import { NewOrderForm } from "./ApparelForms";

export const metadata = { title: "Dabz Apparel · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * A calendar, drawn rather than typed.
 *
 * `aria-hidden` because the heading beside it already says "Project calendar";
 * a screen reader announcing it twice helps nobody.
 */
function CalendarGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      <rect x="2" y="3.5" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7.5h14M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A ticked list, drawn.
 *
 * `aria-hidden` for the same reason as the calendar's: the heading beside it
 * already says "Production report".
 */
function BenchGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      <path
        d="M2.5 5.25l1.5 1.5 2.5-2.75M2.5 12.25l1.5 1.5 2.5-2.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 5h6M9.5 12.5h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** What the calendar has to say today, in one line. Counts, never reassurance. */
function calendarLine(summary: CalendarSummary): string {
  const parts: string[] = [];

  if (summary.priority > 0) {
    parts.push(
      `${summary.priority} carried over and needing doing first`,
    );
  }
  if (summary.dueToday > 0) {
    parts.push(`${summary.dueToday} due off the bench today`);
  }

  if (parts.length === 0) {
    if (summary.nextOn) {
      const next = parseISODate(summary.nextOn);
      parts.push(`Nothing due off the bench today. Next on ${next ? formatCivilDate(next) : summary.nextOn}`);
    } else if (summary.undated > 0) {
      // Not "all clear": nobody has said when any of them is due.
      parts.push(
        `No promised dates set, so nothing can be planned yet - ${summary.undated} order${
          summary.undated === 1 ? "" : "s"
        } waiting on one`,
      );
    } else {
      parts.push("Nothing on the bench.");
    }
  } else if (summary.nextOn) {
    const next = parseISODate(summary.nextOn);
    parts.push(`next on ${next ? formatCivilDate(next) : summary.nextOn}`);
  }

  return `${parts.join(" \u00b7 ")}`;
}

export default async function ApparelPage() {
  await connection();

  const user = await requirePermission("apparel_job_orders");
  const canSetPrices = isOwnerOrAdmin(user);

  const today = manilaToday();
  const [orders, customers, marks] = await Promise.all([
    getApparelOrders(),
    getCustomers(),
    getProductionSteps(),
  ]);

  const open = orders.filter((entry) => isOpenOrder(entry.order.status));

  /*
    Production across the open orders only. A released project's benches are
    history, and counting them in "3 not started" would have the shop looking
    for work that has already gone out of the door.
  */
  const onTheBench = open.map((detail) => productionFor(detail, marks.steps));
  const closed = orders.filter((entry) => !isOpenOrder(entry.order.status));

  // A released order with money still owed stays in sight: the jerseys have
  // gone, so the only thing left to chase is the balance.
  const owing = orders.filter(
    (entry) =>
      entry.order.status === "released" && entry.totals.balanceCentavos > 0,
  );

  /*
    What the project calendar says about today, worked out from the orders
    already read rather than by asking again. A project whose target day
    passed with work left on it has been carried forward, and this screen is
    where the shop looks first in the morning.
  */
  const projects = scheduleAll({ orders: orders.map(toCalendarOrder), today });
  const summary = summariseProjects(projects, today);
  const priority = projects.filter((project) => project.priority);

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

      {/*
        The way into the project calendar, given its own row above everything
        else on the screen.

        It was a line of underlined text beside the red "New job order" button
        and the owner could not find it - which is the same mistake the
        Disclosure handle made in Phase 2: a way in that does not look like
        anything. So it is a real button now, in the accent as a tint rather
        than a fill (the screen's one filled red stays on New job order), and
        it carries the count beside it: a button that says "2 due off the
        bench today" is worth crossing the screen for in a way that the word
        "Calendar" is not.
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <CalendarGlyph />
              Project calendar
            </h2>
            <p className="mt-1 text-sm text-muted">{calendarLine(summary)}</p>
          </div>

          <Link
            href="/apparel/calendar"
            className={`${buttonClasses("feature")} w-full sm:w-auto`}
          >
            Open the project calendar
          </Link>
        </Card>

        {/*
          The same projects, by bench rather than by day. Beside the calendar
          rather than under it: the morning question is "what is due?", and the
          next one is "how far has it got?".
        */}
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <BenchGlyph />
              Production report
            </h2>
            <p className="mt-1 text-sm text-muted">
              {marks.failed
                ? "The benches could not be read, so nothing here says where the work has got to."
                : productionSummaryLine(summariseProduction(onTheBench))}
            </p>
          </div>

          <Link
            href="/production"
            className={`${buttonClasses("feature")} w-full sm:w-auto`}
          >
            Open the production report
          </Link>
        </Card>
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

      {priority.length > 0 ? (
        <Notice
          tone="attention"
          title={`${priority.length} priority project${
            priority.length === 1 ? "" : "s"
          } today`}
        >
          <p>
            {priority.length === 1 ? "This one" : "These"} should have been
            finished by now, so {priority.length === 1 ? "it has" : "they have"}{" "}
            been carried on to today.
          </p>
          <ul className="mt-2 space-y-1">
            {priority.map((project) => (
              <li key={project.id} className="text-sm">
                <Link
                  href={`/apparel/${project.id}`}
                  className={`font-medium underline underline-offset-2 ${TAP_AREA}`}
                >
                  {project.teamName ?? project.orderNumber}
                </Link>
                <span className="text-muted"> &middot; {scheduleNote(project)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link
              href="/apparel/calendar"
              className={`underline underline-offset-2 ${TAP_AREA}`}
            >
              Open the project calendar
            </Link>
          </p>
        </Notice>
      ) : null}

      {canSetPrices ? (
        <Notice tone="info" title="Nothing here is priced yet">
          The five items, the size surcharges and the down payment policy are
          all yours to set. Orders work without them &mdash; the price is asked
          for on each line.{" "}
          <Link href="/apparel/prices" className={`underline ${TAP_AREA}`}>
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
                      className={`text-lg font-semibold underline-offset-2 hover:underline ${TAP_AREA}`}
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
                    className={`font-medium underline-offset-2 hover:underline ${TAP_AREA}`}
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
