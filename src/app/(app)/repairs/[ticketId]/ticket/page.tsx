import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { getRepairTicket } from "@/lib/data/repairs";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";
import { formatCivilDate, parseISODate } from "@/lib/period";
import {
  TICKET_STATUS_LABELS,
  UNIT_KIND_LABELS,
  UNLOCK_METHOD_LABELS,
} from "@/lib/repairs";

export const metadata = { title: "Claim stub · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * The claim stub (spec 9.1).
 *
 * The customer walks out with this, and comes back holding it. So it carries
 * the three things an argument later turns on: what was brought in, what came
 * with it, and what it looked like on arrival.
 *
 * It also carries no password, and says so - because the customer should know
 * the shop does not keep one (spec 9.3).
 */
export default async function ClaimStubPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  await connection();

  await requirePermission("dabztech_tickets");
  const settings = await getSettings();
  const { ticketId } = await params;

  const detail = await getRepairTicket(ticketId, settings.unclaimedUnitDays);
  // Not found rather than forbidden: if the policies did not return it, this
  // ticket is not this person's to know about.
  if (!detail) notFound();

  const { ticket, totals, warranty } = detail;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/repairs/${ticket.id}`} className={`text-sm underline ${TAP_AREA}`}>
          {"←"} Back to the ticket
        </Link>
        <span className="text-sm text-muted">
          Use your browser&apos;s Print (Ctrl+P). One for the customer, one for
          the unit.
        </span>
      </div>

      <article className="mx-auto max-w-2xl bg-white p-8 text-black shadow-sm ring-1 ring-black/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        {/* A text wordmark, not the crest: the logos are built for black
            backgrounds and would vanish on white paper (spec 3.3). */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-lg font-bold tracking-tight">DABZTECH SOLUTIONS</p>
              <p className="text-xs font-medium">
                &ldquo;{DIVISIONS.dabztech.tagline}&rdquo;
              </p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold">{ticket.ticketNumber}</p>
              <p className="text-xs">{TICKET_STATUS_LABELS[ticket.status]}</p>
            </div>
          </div>
        </header>

        <section className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              Customer
            </p>
            <p className="font-medium">{ticket.customerName}</p>
            {ticket.contactNumber ? (
              <p className="text-xs">{ticket.contactNumber}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide">Dates</p>
            <p className="text-xs">Received: {showDate(ticket.receivedOn)}</p>
            <p className="text-xs font-medium">
              Promised: {showDate(ticket.promisedOn)}
            </p>
          </div>
        </section>

        <section className="mt-4 border border-black/40 p-3 text-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide">
            The unit
          </p>
          <p className="font-medium">
            {UNIT_KIND_LABELS[ticket.unitKind]}
            {ticket.brand ? ` · ${ticket.brand}` : ""}
            {ticket.model ? ` ${ticket.model}` : ""}
          </p>
          {ticket.serialNumber ? (
            <p className="text-xs">Serial: {ticket.serialNumber}</p>
          ) : null}

          <dl className="mt-2 space-y-1 text-xs">
            <div>
              <dt className="inline font-semibold">Reported problem: </dt>
              <dd className="inline">{ticket.problem}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Came with it: </dt>
              <dd className="inline">{ticket.accessories ?? "nothing recorded"}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Condition on arrival: </dt>
              <dd className="inline">
                {ticket.conditionNote ?? "nothing recorded"}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">Unlocking: </dt>
              <dd className="inline">
                {UNLOCK_METHOD_LABELS[ticket.unlockMethod]}
              </dd>
            </div>
          </dl>
        </section>

        {ticket.diagnosis ? (
          <section className="mt-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              What we found
            </p>
            <p>{ticket.diagnosis}</p>
          </section>
        ) : null}

        {/* ---- What is being charged ------------------------------------- */}
        {totals.lines.length > 0 ? (
          <section className="mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="pb-1 font-semibold">Charge</th>
                  <th className="w-16 pb-1 font-semibold">Qty</th>
                  <th className="w-24 pb-1 text-right font-semibold">Each</th>
                  <th className="w-24 pb-1 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {totals.lines.map((entry) => (
                  <tr key={entry.line.id} className="border-b border-black/20">
                    <td className="py-1">{entry.line.name}</td>
                    <td className="py-1">{entry.line.quantity}</td>
                    <td className="py-1 text-right">
                      {entry.line.unitPriceCentavos > 0
                        ? formatPesos(entry.line.unitPriceCentavos)
                        : "—"}
                    </td>
                    <td className="py-1 text-right">
                      {formatPesos(entry.totalCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="mt-4 border-t-2 border-black pt-2 text-sm">
          <Row label="Total" value={formatPesos(totals.totalCentavos)} bold />
          <Row label="Paid" value={formatPesos(totals.paidCentavos)} />
          <div className="border-t border-black pt-1">
            <Row label="BALANCE" value={formatPesos(totals.balanceCentavos)} bold />
          </div>
        </section>

        {ticket.releasedOn ? (
          <section className="mt-4 border border-black p-3 text-sm">
            <p className="font-bold">
              Released {showDate(ticket.releasedOn)} &middot;{" "}
              {ticket.warrantyDays ?? 0}-day warranty
            </p>
            {warranty.untilISO ? (
              <p className="text-xs">
                Covered on this repair until {showDate(warranty.untilISO)}. Bring
                this slip.
              </p>
            ) : null}
          </section>
        ) : null}

        <p className="mt-4 border border-black/40 p-2 text-xs">
          <span className="font-semibold">We do not keep your password. </span>
          Nothing in our system has a place to write one down. If your unit needs
          unlocking, we will call you.
        </p>

        <footer className="mt-6 grid gap-8 text-xs sm:grid-cols-2">
          <div>
            <div className="h-10 border-b border-black" />
            <p className="mt-1">Received by / date</p>
          </div>
          <div>
            <div className="h-10 border-b border-black" />
            <p className="mt-1">Collected by / date</p>
          </div>
        </footer>

        <p className="mt-4 text-center text-[10px]">
          DabzTech Solutions &middot; San Carlos City, Pangasinan &middot; Units
          not collected after {settings.unclaimedUnitDays} days will be followed
          up. Please keep this slip.
        </p>
      </article>
    </div>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
