import type { Metadata } from "next";

import { Badge, Card, EmptyState, PageHeader, TBody, Table, Td, Th } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { humanise } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

const DESTRUCTIVE = new Set(["delete", "void", "deactivate", "permission_revoke"]);

export default async function AuditPage() {
  await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("audit_log")
    .select("id, occurred_at, actor_username, action, entity, summary")
    .order("occurred_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Audit log"
        description="The 200 most recent changes."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState message="Nothing recorded yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <TBody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td muted>{new Date(row.occurred_at).toLocaleString()}</Td>
                  <Td>{row.actor_username ?? "—"}</Td>
                  <Td>
                    <Badge tone={DESTRUCTIVE.has(row.action) ? "bad" : "neutral"}>
                      {humanise(row.action)}
                    </Badge>
                  </Td>
                  <Td muted>{row.entity}</Td>
                  <Td>{row.summary}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
