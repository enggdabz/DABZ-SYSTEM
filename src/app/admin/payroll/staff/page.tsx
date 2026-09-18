import type { Metadata } from "next";

import { StaffForm } from "@/app/admin/payroll/payroll-forms";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const [{ data: staff }, { data: profiles }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, full_name, position, contact_number, daily_rate_centavos, start_date, status")
      .order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  const rows = staff ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Staff"
        description="Employment records, separate from login accounts."
      />

      <Card className="mb-6">
        <CardHeader title="New staff record" />
        <StaffForm profiles={profiles ?? []} />
      </Card>

      <Card>
        <CardHeader title="Staff" />
        {rows.length === 0 ? (
          <EmptyState message="No staff records yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th><Th>Position</Th><Th>Contact</Th>
                <Th numeric>Daily rate</Th><Th>Started</Th><Th>Status</Th>
              </tr>
            </thead>
            <TBody>
              {rows.map((person) => (
                <tr key={person.id}>
                  <Td>{person.full_name}</Td>
                  <Td muted>{person.position ?? "—"}</Td>
                  <Td muted>{person.contact_number ?? "—"}</Td>
                  <Td numeric>{formatCentavos(person.daily_rate_centavos ?? 0)}</Td>
                  <Td muted>{person.start_date ?? "—"}</Td>
                  <Td>
                    <Badge tone={person.status === "active" ? "good" : "neutral"}>
                      {person.status}
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
