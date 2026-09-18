import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getStockOverview } from "@/lib/data/stocks";
import { getCustomers } from "@/lib/data/pos";
import {
  getRepairServices,
  getRepairTicket,
  getVoidedRepairPayments,
} from "@/lib/data/repairs";
import { MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday, parseISODate } from "@/lib/period";
import {
  LINE_KIND_LABELS,
  TICKET_FLOW,
  TICKET_STATUS_LABELS,
  UNIT_KIND_LABELS,
  UNLOCK_METHOD_LABELS,
} from "@/lib/repairs";

import {
  AddLineForm,
  FitPartForm,
  PaymentForm,
  RemoveLineForm,
  TicketDetailsForm,
  TicketStatusForm,
  VoidPaymentForm,
} from "../RepairForms";

export const metadata = { title: "Repair ticket · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

export default async function RepairTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  await connection();

  const user = await requirePermission("dabztech_tickets");
  const canVoid = isOwnerOrAdmin(user);
  const settings = await getSettings();

  const { ticketId } = await params;

  const [detail, services, customers, stock, voided] = await Promise.all([
    getRepairTicket(ticketId, settings.unclaimedUnitDays),
    getRepairServices(),
    getCustomers(),
    getStockOverview(),
    getVoidedRepairPayments(ticketId),
  ]);

  if (!detail) notFound();

  const { ticket, totals, warnings, warranty, unclaimed } = detail;
  const today = civilDateToISO(manilaToday());
  const stepIndex = TICKET_FLOW.indexOf(ticket.status);

  // Services for this machine, plus the ones that apply to anything.
  const relevant = services.filter(
    (service) =>
      service.active &&
      (service.unitKind === "any" || service.unitKind === ticket.unitKind),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/repairs" className="text-sm text-muted underline">
          &larr; All repair tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {ticket.customerName}
            </h1>
            <p className="mt-1 text-muted">
              {ticket.ticketNumber} &middot; {UNIT_KIND_LABELS[ticket.unitKind]}
              {ticket.brand ? ` ${ticket.brand}` : ""}
              {ticket.model ? ` ${ticket.model}` : ""} &middot; in{" "}
              {showDate(ticket.receivedOn)}
            </p>
          </div>
          <Link
            href={`/repairs/${ticket.id}/ticket`}
            className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
          >
            Print the claim stub
          </Link>
        </div>
      </div>

      {warnings.length > 0 ? (
        <Notice
          tone="attention"
          title={
            warnings.length === 1
              ? "One thing to look at"
              : `${warnings.length} things to look at`
          }
        >
          <ul className="space-y-1">
            {warnings.map((warning) => (
              <li key={warning.kind}>{warning.label}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {ticket.declineReason ? (
        <Notice
          tone="attention"
          title={
            ticket.status === "declined"
              ? "The customer said no"
              : "This unit cannot be repaired"
          }
        >
          {ticket.declineReason}
          {unclaimed.waiting ? ` · ${unclaimed.label}.` : ""}
        </Notice>
      ) : null}

      {/* ---- Where it is up to -------------------------------------------- */}
      <Card title="Where it is up to">
        <ol className="flex flex-wrap gap-2">
          {TICKET_FLOW.map((step, index) => (
            <li key={step}>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                  stepIndex >= 0 && index < stepIndex
                    ? "bg-success/10 text-success ring-success/20"
                    : index === stepIndex
                      ? "bg-accent/10 text-accent ring-accent/20"
                      : "bg-ink/5 text-muted ring-line"
                }`}
              >
                {stepIndex >= 0 && index < stepIndex ? "✓ " : ""}
                {TICKET_STATUS_LABELS[step]}
              </span>
            </li>
          ))}
          {stepIndex < 0 ? (
            <li>
              <Tag tone="attention">
                {"⚠"} {TICKET_STATUS_LABELS[ticket.status]}
              </Tag>
            </li>
          ) : null}
        </ol>

        <div className="mt-5">
          <TicketStatusForm
            ticketId={ticket.id}
            status={ticket.status}
            warrantyDays={ticket.warrantyDays ?? settings.defaultWarrantyDays}
          />
        </div>

        {warranty.kind === "under_warranty" || warranty.kind === "expired" ? (
          <p className="mt-4 text-sm">
            <span className="font-medium">Warranty: </span>
            {warranty.label}
            {warranty.untilISO ? ` (until ${showDate(warranty.untilISO)})` : ""}
            <span className="block text-xs text-muted">
              {ticket.warrantyDays} days, as it stood when the unit was released.
              Changing the shop default later does not change this.
            </span>
          </p>
        ) : null}
      </Card>

      {/* ---- The unit ----------------------------------------------------- */}
      <Card title="The unit">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">What is wrong</dt>
            <dd className="mt-1">{ticket.problem}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">What we found</dt>
            <dd className="mt-1">
              {ticket.diagnosis ?? (
                <span className="text-muted">Not checked yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Serial number</dt>
            <dd className="mt-1">{ticket.serialNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Came with it</dt>
            <dd className="mt-1">{ticket.accessories ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Condition on arrival</dt>
            <dd className="mt-1">{ticket.conditionNote ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Getting into it</dt>
            <dd className="mt-1">{UNLOCK_METHOD_LABELS[ticket.unlockMethod]}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Contact</dt>
            <dd className="mt-1">{ticket.contactNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Promised</dt>
            <dd className="mt-1">{showDate(ticket.promisedOn)}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-muted">
          There is no password on this ticket, and no box for one anywhere in the
          system. If the unit needs unlocking, the customer does it.
        </p>

        {ticket.note ? (
          <p className="mt-2 text-sm text-ink/80">{ticket.note}</p>
        ) : null}

        <div className="mt-5">
          <TicketDetailsForm
            ticket={ticket}
            customers={customers
              .filter((customer) => customer.active)
              .map((customer) => ({ id: customer.id, name: customer.name }))}
          />
        </div>
      </Card>

      {/* ---- What is being charged ---------------------------------------- */}
      <Card
        title="What is being charged"
        description="The total adds up these rows. It is never stored, so it cannot disagree with them."
      >
        {totals.lines.length === 0 ? (
          <Notice tone="info" title="Nothing charged yet">
            Add the checking fee, the work and any parts.
          </Notice>
        ) : (
          <ul className="divide-y divide-line/60">
            {totals.lines.map((entry) => (
              <li
                key={entry.line.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="min-w-0">
                  <span className="font-medium">{entry.line.name}</span>
                  <span className="block text-xs text-muted">
                    {LINE_KIND_LABELS[entry.line.kind]} &middot;{" "}
                    {entry.line.quantity} &times;{" "}
                    {entry.line.unitPriceCentavos > 0
                      ? formatPesos(entry.line.unitPriceCentavos)
                      : "no price set"}
                    {entry.line.stockItemId ? " · from stock" : ""}
                  </span>
                  {entry.line.unitPriceCentavos === 0 ? (
                    <span className="block text-xs text-attention">
                      <span aria-hidden="true">{"⚠"} </span>
                      Nobody has priced this, so it adds nothing to the total.
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3 text-right">
                  <span className="font-semibold">
                    {formatPesos(entry.totalCentavos)}
                  </span>
                  {ticket.status !== "released" ? (
                    <RemoveLineForm ticketId={ticket.id} lineId={entry.line.id} />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}

        {totals.lines.length > 0 ? (
          <dl className="mt-5 space-y-1 border-t border-line/60 pt-4 text-sm">
            <Row label="Checking fee" value={formatPesos(totals.checkingFeeCentavos)} />
            <Row label="Work" value={formatPesos(totals.labourCentavos)} />
            <Row label="Parts" value={formatPesos(totals.partsCentavos)} />
          </dl>
        ) : null}

        {ticket.status !== "released" ? (
          <div className="mt-6 flex flex-wrap items-start gap-3 border-t border-line/60 pt-6">
            <AddLineForm
              ticketId={ticket.id}
              services={relevant.map((service) => ({
                id: service.id,
                name: service.name,
                unitKind: service.unitKind,
                priceCentavos: service.priceCentavos,
              }))}
            />
            <FitPartForm
              ticketId={ticket.id}
              stockItems={stock.lines
                .filter((line) => line.item.active)
                .map((line) => ({
                  id: line.item.id,
                  name: line.item.name,
                  unit: line.item.unit,
                  unitCostCentavos: line.item.unitCostCentavos,
                }))}
            />
          </div>
        ) : null}
      </Card>

      {/* ---- Money -------------------------------------------------------- */}
      <Card title="Money">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-muted">Ticket comes to</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.totalCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Paid</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(totals.paidCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Still owed</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                totals.balanceCentavos > 0 ? "text-attention" : ""
              }`}
            >
              {formatPesos(totals.balanceCentavos)}
            </dd>
          </div>
        </dl>

        {totals.overpaid ? (
          <div className="mt-4">
            <Notice
              tone="attention"
              title={`Paid ${formatPesos(totals.overpaidByCentavos)} more than the ticket comes to`}
            >
              Either a charge is missing, or the customer is due change. Nothing
              was adjusted on its own.
            </Notice>
          </div>
        ) : null}

        <div className="mt-5">
          <PaymentForm
            ticketId={ticket.id}
            balanceLabel={formatPesos(totals.balanceCentavos)}
            today={today}
          />
        </div>

        {detail.payments.length > 0 ? (
          <ul className="mt-6 divide-y divide-line/60 border-t border-line/60">
            {detail.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span>
                  <span className="font-medium">
                    {formatPesos(payment.amountCentavos)}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {showDate(payment.paidOn)} &middot;{" "}
                    {MONEY_SOURCE_LABELS[
                      payment.source as keyof typeof MONEY_SOURCE_LABELS
                    ] ?? payment.source}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </span>
                </span>
                {canVoid ? (
                  <VoidPaymentForm ticketId={ticket.id} paymentId={payment.id} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {voided.length > 0 ? (
          <div className="mt-4 space-y-1">
            {voided.map((payment) => (
              <p key={payment.id} className="text-xs text-muted">
                <Tag>Voided</Tag>{" "}
                <span className="line-through">
                  {formatPesos(payment.amountCentavos)}
                </span>{" "}
                {payment.voidReason ?? ""}
              </p>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
