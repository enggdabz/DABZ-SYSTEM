import type { Metadata } from "next";

import { PayPayableForm, SupplierForm } from "@/app/admin/inventory/inventory-forms";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const { role } = await requireUser();
  const isManager = role === "owner" || role === "admin";

  const supabase = await createClient();
  const [{ data: suppliers }, { data: payables }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, contact_number, address, active")
      .order("name"),
    // Row level security limits this to owners and admins.
    supabase
      .from("supplier_payables")
      .select("id, supplier_id, description, amount_centavos, received_on, due_on, status, paid_on")
      .order("received_on", { ascending: false }),
  ]);

  const rows = suppliers ?? [];
  const bills = payables ?? [];
  const unpaid = bills.filter((p) => p.status === "unpaid");
  const owed = unpaid.reduce((sum, p) => sum + p.amount_centavos, 0);
  const nameOf = new Map(rows.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader eyebrow="Inventory" title="Suppliers" />

      {isManager ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatTile label="Suppliers" value={rows.filter((s) => s.active).length} />
          <StatTile label="Unpaid payables" value={unpaid.length} />
          <StatTile label="Owed" value={formatCentavos(owed)} />
        </div>
      ) : null}

      {isManager ? (
        <Card className="mb-6">
          <CardHeader title="New supplier" />
          <SupplierForm />
        </Card>
      ) : null}

      {isManager ? (
        <Card className="mb-6">
          <CardHeader title="Payables" />
          {bills.length === 0 ? (
            <EmptyState message="Nothing owed to suppliers." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Supplier</Th>
                  <Th>Description</Th>
                  <Th>Received</Th>
                  <Th>Due</Th>
                  <Th numeric>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <TBody>
                {bills.map((payable) => (
                  <tr key={payable.id}>
                    <Td>{payable.supplier_id ? (nameOf.get(payable.supplier_id) ?? "—") : "—"}</Td>
                    <Td muted>{payable.description}</Td>
                    <Td muted>{payable.received_on}</Td>
                    <Td muted>{payable.due_on ?? "—"}</Td>
                    <Td numeric>{formatCentavos(payable.amount_centavos)}</Td>
                    <Td>
                      {payable.status === "paid" ? (
                        <Badge tone="good">Paid {payable.paid_on}</Badge>
                      ) : (
                        <PayPayableForm payableId={payable.id} />
                      )}
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Directory" />
        {rows.length === 0 ? (
          <EmptyState message="No suppliers yet." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Contact</Th><Th>Address</Th><Th>Status</Th></tr>
            </thead>
            <TBody>
              {rows.map((supplier) => (
                <tr key={supplier.id}>
                  <Td>{supplier.name}</Td>
                  <Td muted>{supplier.contact_number ?? "—"}</Td>
                  <Td muted>{supplier.address ?? "—"}</Td>
                  <Td>
                    <Badge tone={supplier.active ? "good" : "neutral"}>
                      {supplier.active ? "Active" : "Inactive"}
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
