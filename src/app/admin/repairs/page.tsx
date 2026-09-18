import type { Metadata } from "next";
import Link from "next/link";

import { NewTicketForm } from "@/app/admin/repairs/repair-forms";
import {
  Alert, Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { REPAIR_UNIT_KIND_LABEL, humanise, type RepairStatus, type RepairUnitKind } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Repairs" };

const TONE: Partial<Record<RepairStatus, "good" | "warn" | "bad" | "neutral">> = {
  received: "neutral", checking: "warn", quoted: "warn", repairing: "warn",
  ready: "good", released: "good", declined: "bad", unrepairable: "bad",
};

export default async function RepairsPage() {
  const { role } = await requireUser();
  const canWork = await hasPermission("dabztech_tickets");
  const isManager = role === "owner" || role === "admin";

  if (!canWork && !isManager) {
    return (
      <div>
        <PageHeader eyebrow="DabzTech" title="Repairs" />
        <Alert>You do not have permission to see repair tickets.</Alert>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: tickets }, { data: customers }] = await Promise.all([
    supabase
      .from("repair_tickets")
      .select("id, ticket_number, received_on, customer_name, unit_kind, brand, model, status, promised_on")
      .order("received_on", { ascending: false })
      .limit(100),
    supabase.from("customers").select("id, name").eq("active", true).order("name"),
  ]);

  const rows = tickets ?? [];
  const open = rows.filter(
    (t) => !["released", "declined", "unrepairable"].includes(t.status),
  );
  const ready = rows.filter((t) => t.status === "ready");

  return (
    <div>
      <PageHeader
        eyebrow="DabzTech"
        title="Repairs"
        description="Units booked in for repair."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Open tickets" value={open.length} />
        <StatTile label="Ready for pickup" value={ready.length} />
        <StatTile label="Shown here" value={rows.length} />
      </div>

      {canWork ? (
        <Card className="mb-6">
          <CardHeader title="Book in a unit" />
          <NewTicketForm customers={customers ?? []} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Tickets" />
        {rows.length === 0 ? (
          <EmptyState message="No repair tickets yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ticket</Th><Th>Received</Th><Th>Customer</Th>
                <Th>Unit</Th><Th>Status</Th>
              </tr>
            </thead>
            <TBody>
              {rows.map((ticket) => (
                <tr key={ticket.id}>
                  <Td>
                    <Link
                      href={`/admin/repairs/${ticket.id}`}
                      className="font-medium text-fg underline underline-offset-4 hover:text-brand"
                    >
                      {ticket.ticket_number}
                    </Link>
                  </Td>
                  <Td muted>{ticket.received_on}</Td>
                  <Td>{ticket.customer_name}</Td>
                  <Td muted>
                    {REPAIR_UNIT_KIND_LABEL[ticket.unit_kind as RepairUnitKind] ?? ticket.unit_kind}
                    {ticket.brand ? ` · ${ticket.brand}` : ""}
                    {ticket.model ? ` ${ticket.model}` : ""}
                  </Td>
                  <Td>
                    <Badge tone={TONE[ticket.status as RepairStatus] ?? "neutral"}>
                      {humanise(ticket.status)}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
