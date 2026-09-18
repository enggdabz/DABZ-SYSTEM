import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  AddLineForm, FitPartForm, RepairPaymentForm, StatusForm, VoidPaymentForm,
} from "@/app/admin/repairs/repair-forms";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { MONEY_SOURCE_LABEL, humanise, type MoneySource } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Repair ticket" };

export default async function TicketPage({ params }: PageProps<"/admin/repairs/[id]">) {
  const { id } = await params;
  const { role } = await requireUser();
  const canWork = await hasPermission("dabztech_tickets");
  const isManager = role === "owner" || role === "admin";

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!ticket) notFound();

  const [{ data: lines }, { data: payments }, { data: services }, { data: items }] =
    await Promise.all([
      supabase
        .from("repair_lines")
        .select("id, kind, name, unit_price_centavos, quantity, income_category")
        .eq("ticket_id", id)
        .order("created_at"),
      supabase
        .from("repair_payments")
        .select("id, amount_centavos, paid_on, source, reference_number, voided_at, void_reason")
        .eq("ticket_id", id)
        .order("paid_on"),
      supabase.from("repair_services").select("id, name, unit_kind").eq("active", true).order("sort_order"),
      supabase.from("stock_items").select("id, name").eq("active", true).order("name"),
    ]);

  const charged = (lines ?? []).reduce(
    (sum, line) => sum + line.unit_price_centavos * line.quantity,
    0,
  );
  const paid = (payments ?? [])
    .filter((p) => !p.voided_at)
    .reduce((sum, p) => sum + p.amount_centavos, 0);
  const balance = charged - paid;

  const details = [
    { label: "Customer", value: ticket.customer_name },
    { label: "Contact", value: ticket.contact_number ?? "—" },
    { label: "Unit", value: `${humanise(ticket.unit_kind)}${ticket.brand ? ` · ${ticket.brand}` : ""}` },
    { label: "Serial", value: ticket.serial_number ?? "—" },
    { label: "Received", value: ticket.received_on },
    { label: "Warranty", value: `${ticket.warranty_days ?? 0} days` },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="DabzTech"
        title={ticket.ticket_number}
        description={ticket.problem}
        actions={<Badge tone="brand">{humanise(ticket.status)}</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Charged" value={formatCentavos(charged)} />
        <StatTile label="Paid" value={formatCentavos(paid)} />
        <StatTile label="Balance" value={formatCentavos(balance)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Details" />
        <dl className="grid gap-px bg-line sm:grid-cols-3">
          {details.map((d) => (
            <div key={d.label} className="bg-card p-4">
              <dt className="label-caps text-fg-subtle">{d.label}</dt>
              <dd className="mt-1 text-sm text-fg">{d.value}</dd>
            </div>
          ))}
        </dl>
        {canWork ? (
          <div className="border-t border-line p-5">
            <StatusForm ticketId={ticket.id} status={ticket.status} />
          </div>
        ) : null}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Work and parts" />
        {(lines ?? []).length === 0 ? (
          <EmptyState message="Nothing charged yet." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Item</Th><Th>Kind</Th><Th numeric>Qty</Th><Th numeric>Price</Th><Th numeric>Total</Th></tr>
            </thead>
            <TBody>
              {(lines ?? []).map((line) => (
                <tr key={line.id}>
                  <Td>{line.name}</Td>
                  <Td muted>{humanise(line.kind)}</Td>
                  <Td numeric>{line.quantity}</Td>
                  <Td numeric muted>{formatCentavos(line.unit_price_centavos)}</Td>
                  <Td numeric>{formatCentavos(line.unit_price_centavos * line.quantity)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        {canWork ? (
          <>
            <div className="border-t border-line">
              <AddLineForm ticketId={ticket.id} services={services ?? []} />
            </div>
            <div className="border-t border-line">
              <FitPartForm ticketId={ticket.id} items={items ?? []} />
            </div>
          </>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Payments" />
        {(payments ?? []).length === 0 ? (
          <EmptyState message="No payments taken." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th numeric>Amount</Th><Th>From</Th><Th>Status</Th></tr>
            </thead>
            <TBody>
              {(payments ?? []).map((payment) => (
                <tr key={payment.id}>
                  <Td muted>{payment.paid_on}</Td>
                  <Td numeric>{formatCentavos(payment.amount_centavos)}</Td>
                  <Td muted>
                    {MONEY_SOURCE_LABEL[payment.source as MoneySource] ?? payment.source}
                  </Td>
                  <Td>
                    {payment.voided_at ? (
                      <Badge tone="bad">Voided</Badge>
                    ) : isManager ? (
                      <VoidPaymentForm paymentId={payment.id} ticketId={ticket.id} />
                    ) : (
                      <Badge tone="good">Taken</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        {canWork ? (
          <div className="border-t border-line">
            <RepairPaymentForm ticketId={ticket.id} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
