import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getRepairTickets } from "@/lib/data/repairs";
import { getCustomers } from "@/lib/data/pos";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos, sumCentavos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday, parseISODate } from "@/lib/period";
import {
  TICKET_STATUS_LABELS,
  UNIT_KIND_LABELS,
  isAwaitingCollection,
  isOpenTicket,
} from "@/lib/repairs";

import { NewTicketForm } from "./RepairForms";

export const metadata = { title: "DabzTech repairs · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

export default async function RepairsPage() {
  await connection();

  const user = await requirePermission("dabztech_tickets");
  const canSetPrices = isOwnerOrAdmin(user);

  const settings = await getSettings();
  const today = manilaToday();

  const [tickets, customers] = await Promise.all([
    getRepairTickets({ unclaimedAfterDays: settings.unclaimedUnitDays }),
    getCustomers(),
  ]);

  const onTheBench = tickets.filter(
    (entry) => isOpenTicket(entry.ticket.status) && !isAwaitingCollection(entry.ticket.status),
  );
  const waitingForPickup = tickets.filter((entry) =>
    isAwaitingCollection(entry.ticket.status),
  );
  const released = tickets.filter((entry) => entry.ticket.status === "released");
  const unclaimed = tickets.filter((entry) => entry.unclaimed.unclaimed);

  const owed = sumCentavos(tickets.map((entry) => entry.totals.balanceCentavos));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DabzTech Solutions</h1>
          <p className="mt-2 text-muted">
            {DIVISIONS.dabztech.tagline} &middot; Epson printers, laptops and
            desktop PCs.
          </p>
        </div>
        <NewTicketForm
          customers={customers
            .filter((customer) => customer.active)
            .map((customer) => ({ id: customer.id, name: customer.name }))}
          today={civilDateToISO(today)}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="On the bench">
          <p className="text-2xl font-semibold">{onTheBench.length}</p>
          <p className="mt-1 text-sm text-muted">
            Received, being checked, quoted or under repair.
          </p>
        </Card>

        <Card title="Waiting for pickup">
          <p className="text-2xl font-semibold">{waitingForPickup.length}</p>
          <p className="mt-1 text-sm text-muted">
            {unclaimed.length > 0 ? (
              <>
                <span aria-hidden="true">{"⚠"} </span>
                {unclaimed.length} of them for {settings.unclaimedUnitDays} days or
                more.
              </>
            ) : (
              "Nothing has been sitting too long."
            )}
          </p>
        </Card>

        <Card title="Still owed">
          <p className="text-2xl font-semibold">{formatPesos(owed)}</p>
          <p className="mt-1 text-sm text-muted">Across every ticket.</p>
        </Card>
      </div>

      {canSetPrices ? (
        <Notice tone="info" title="Nothing here is priced yet">
          The checking fee and every repair are yours to set. Tickets work
          without them &mdash; the price is asked for on each charge.{" "}
          <Link href="/repairs/prices" className="underline">
            Set the repair prices
          </Link>
          .
        </Notice>
      ) : null}

      {unclaimed.length > 0 ? (
        <Notice
          tone="attention"
          title={`${unclaimed.length} unit${
            unclaimed.length === 1 ? "" : "s"
          } left uncollected`}
        >
          <ul className="mt-1 space-y-1">
            {unclaimed.map(({ ticket, unclaimed: status }) => (
              <li key={ticket.id}>
                <Link href={`/repairs/${ticket.id}`} className="underline">
                  {ticket.ticketNumber}
                </Link>{" "}
                &mdash; {ticket.customerName}&apos;s{" "}
                {UNIT_KIND_LABELS[ticket.unitKind].toLowerCase()},{" "}
                {status.daysWaiting} days.
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card
        title={`On the bench (${onTheBench.length})`}
        description="Newest first. Anything overdue, unpriced or waiting on the customer is marked."
      >
        {onTheBench.length === 0 ? (
          <Notice tone="info" title="Nothing on the bench">
            Press <strong>Take a unit in</strong> when something arrives.
          </Notice>
        ) : (
          <ul className="space-y-5">
            {onTheBench.map(({ ticket, totals, warnings }) => (
              <li
                key={ticket.id}
                className="border-t border-line/60 pt-5 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <Link
                      href={`/repairs/${ticket.id}`}
                      className="text-lg font-semibold underline-offset-2 hover:underline"
                    >
                      {ticket.customerName}
                    </Link>
                    <p className="text-xs text-muted">
                      {ticket.ticketNumber} &middot;{" "}
                      {UNIT_KIND_LABELS[ticket.unitKind]}
                      {ticket.brand ? ` ${ticket.brand}` : ""}
                      {ticket.model ? ` ${ticket.model}` : ""} &middot;{" "}
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </p>
                    <p className="mt-1 truncate text-sm text-ink/80">
                      {ticket.problem}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold">
                      {formatPesos(totals.totalCentavos)}
                    </p>
                    <p className="text-xs text-muted">
                      promised {showDate(ticket.promisedOn)}
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

      {waitingForPickup.length > 0 ? (
        <Card
          title={`Waiting for pickup (${waitingForPickup.length})`}
          description="Finished, refused or unrepairable — all of them still physically in the shop."
        >
          <ul className="divide-y divide-line/60">
            {waitingForPickup.map(({ ticket, totals, unclaimed: status }) => (
              <li
                key={ticket.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="min-w-0">
                  <Link
                    href={`/repairs/${ticket.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {ticket.customerName}
                  </Link>
                  <span className="block text-xs text-muted">
                    {ticket.ticketNumber} &middot;{" "}
                    {UNIT_KIND_LABELS[ticket.unitKind]} &middot;{" "}
                    {TICKET_STATUS_LABELS[ticket.status]}
                    {ticket.declineReason ? ` — ${ticket.declineReason}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3 text-right">
                  <span
                    className={`text-xs ${
                      status.unclaimed ? "text-attention" : "text-muted"
                    }`}
                  >
                    {status.unclaimed ? <span aria-hidden="true">{"⚠"} </span> : null}
                    {status.label}
                  </span>
                  <span className="font-semibold">
                    {formatPesos(totals.balanceCentavos)} owed
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {released.length > 0 ? (
        <Card
          title="Released"
          description="Kept, so a warranty claim can be checked against what was actually done."
        >
          <ul className="divide-y divide-line/60">
            {released.map(({ ticket, totals, warranty }) => (
              <li
                key={ticket.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="min-w-0">
                  <Link
                    href={`/repairs/${ticket.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {ticket.customerName}
                  </Link>
                  <span className="block text-xs text-muted">
                    {ticket.ticketNumber} &middot;{" "}
                    {UNIT_KIND_LABELS[ticket.unitKind]} &middot; released{" "}
                    {showDate(ticket.releasedOn)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3 text-right">
                  {warranty.kind === "under_warranty" ? (
                    <Tag tone="success">{warranty.label}</Tag>
                  ) : warranty.kind === "expired" ? (
                    <Tag>Warranty ended</Tag>
                  ) : (
                    <Tag tone="attention">{"⚠"} No warranty recorded</Tag>
                  )}
                  {totals.balanceCentavos > 0 ? (
                    <span className="text-xs text-attention">
                      <span aria-hidden="true">{"⚠"} </span>
                      {formatPesos(totals.balanceCentavos)} owed
                    </span>
                  ) : null}
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
