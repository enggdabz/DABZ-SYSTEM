import type { Metadata } from "next";
import Link from "next/link";

import { NewOrderForm } from "@/app/admin/apparel/apparel-forms";
import {
  Alert, Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { humanise, type ApparelStatus } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Apparel" };

const TONE: Partial<Record<ApparelStatus, "good" | "warn" | "bad" | "neutral">> = {
  quoted: "neutral", confirmed: "warn", layout_approved: "warn",
  in_production: "warn", ready: "good", released: "good", cancelled: "bad",
};

export default async function ApparelPage() {
  const { role } = await requireUser();
  const canWork = await hasPermission("apparel_job_orders");
  const isManager = role === "owner" || role === "admin";

  if (!canWork && !isManager) {
    return (
      <div>
        <PageHeader eyebrow="Apparel" title="Job orders" />
        <Alert>You do not have permission to see apparel orders.</Alert>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: orders }, { data: customers }] = await Promise.all([
    supabase
      .from("apparel_orders")
      .select("id, order_number, ordered_on, team_name, status, promised_on")
      .order("ordered_on", { ascending: false })
      .limit(100),
    supabase.from("customers").select("id, name").eq("active", true).order("name"),
  ]);

  const rows = orders ?? [];
  const open = rows.filter((o) => !["released", "cancelled"].includes(o.status));

  return (
    <div>
      <PageHeader eyebrow="Apparel" title="Job orders" description="Printed apparel orders." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Open orders" value={open.length} />
        <StatTile label="In production" value={rows.filter((o) => o.status === "in_production").length} />
        <StatTile label="Shown here" value={rows.length} />
      </div>

      {canWork ? (
        <Card className="mb-6">
          <CardHeader title="New order" />
          <NewOrderForm customers={customers ?? []} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Orders" />
        {rows.length === 0 ? (
          <EmptyState message="No apparel orders yet." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Order</Th><Th>Ordered</Th><Th>Team</Th><Th>Promised</Th><Th>Status</Th></tr>
            </thead>
            <TBody>
              {rows.map((order) => (
                <tr key={order.id}>
                  <Td>
                    <Link
                      href={`/admin/apparel/${order.id}`}
                      className="font-medium text-fg underline underline-offset-4 hover:text-brand"
                    >
                      {order.order_number}
                    </Link>
                  </Td>
                  <Td muted>{order.ordered_on}</Td>
                  <Td>{order.team_name}</Td>
                  <Td muted>{order.promised_on ?? "—"}</Td>
                  <Td>
                    <Badge tone={TONE[order.status as ApparelStatus] ?? "neutral"}>
                      {humanise(order.status)}
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
