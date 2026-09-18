import type { Metadata } from "next";

import { CustomerForm } from "@/app/admin/inventory/inventory-forms";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("customers")
    .select("id, name, contact_number, facebook_name, email, active")
    .order("name");

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Customers"
        description="Anyone signed in can add a customer."
      />

      <Card className="mb-6">
        <CardHeader title="New customer" />
        <CustomerForm />
      </Card>

      <Card>
        <CardHeader title="Directory" />
        {rows.length === 0 ? (
          <EmptyState message="No customers yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th><Th>Contact</Th><Th>Facebook</Th><Th>Email</Th><Th>Status</Th>
              </tr>
            </thead>
            <TBody>
              {rows.map((customer) => (
                <tr key={customer.id}>
                  <Td>{customer.name}</Td>
                  <Td muted>{customer.contact_number ?? "—"}</Td>
                  <Td muted>{customer.facebook_name ?? "—"}</Td>
                  <Td muted>{customer.email ?? "—"}</Td>
                  <Td>
                    <Badge tone={customer.active ? "good" : "neutral"}>
                      {customer.active ? "Active" : "Inactive"}
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
