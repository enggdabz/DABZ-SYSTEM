import type { Metadata } from "next";

import { AttendanceForm } from "@/app/admin/payroll/payroll-forms";
import {
  Card, CardHeader, EmptyState, PageHeader, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const { role } = await requireUser();
  const isManager = role === "owner" || role === "admin";

  const supabase = await createClient();
  // Row level security narrows both of these to the caller's own rows unless
  // they are an owner or admin.
  const [{ data: entries }, { data: staff }] = await Promise.all([
    supabase
      .from("attendance_entries")
      .select("id, staff_id, work_date, time_in, time_out, note")
      .order("work_date", { ascending: false })
      .limit(100),
    supabase.from("staff").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  const rows = entries ?? [];
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Attendance"
        description={isManager ? "Everyone's entries." : "Your entries."}
      />

      {(staff ?? []).length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Record attendance" />
          <AttendanceForm staff={staff ?? []} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Entries" />
        {rows.length === 0 ? (
          <EmptyState message="No attendance recorded yet." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Staff</Th><Th>In</Th><Th>Out</Th><Th>Note</Th></tr>
            </thead>
            <TBody>
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <Td muted>{entry.work_date}</Td>
                  <Td>{nameOf.get(entry.staff_id) ?? "—"}</Td>
                  <Td muted>{entry.time_in ?? "—"}</Td>
                  <Td muted>{entry.time_out ?? "—"}</Td>
                  <Td muted>{entry.note ?? "—"}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
