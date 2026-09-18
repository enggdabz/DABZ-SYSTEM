import type { Metadata } from "next";

import { DecideVoidForm, VoidForm } from "@/app/admin/sales/sale-forms";
import {
  Alert, Badge, ButtonLink, Card, CardHeader, EmptyState,
  PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: PageProps<"/admin/sales">) {
  const { role } = await requireUser();
  const params = await searchParams;
  const completed = typeof params.completed === "string" ? params.completed : null;

  const isManager = role === "owner" || role === "admin";
  const [canSell, canSeeAll] = await Promise.all([
    hasPermission("add_sales"),
    hasPermission("view_daily_sales_report"),
  ]);

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Row level security already limits this to the caller's own sales unless
  // they may view the daily report; no extra filter is needed here.
  const [{ data: sales }, { data: requests }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, sale_date, total_centavos, payment_method, voided_at, void_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    isManager
      ? supabase
          .from("void_requests")
          .select("id, sale_id, reason, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; sale_id: string; reason: string; status: string; created_at: string }[] }),
  ]);

  const rows = sales ?? [];
  const live = rows.filter((s) => !s.voided_at);
  const todays = live.filter((s) => s.sale_date === today);
  const takings = todays.reduce((sum, s) => sum + s.total_centavos, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Sales"
        description={canSeeAll ? "All sales." : "Sales you rang up."}
        actions={canSell ? <ButtonLink href="/admin/sales/new">New sale</ButtonLink> : null}
      />

      {completed ? (
        <div className="mb-6">
          <Alert tone="good">Sale {completed} completed.</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Sales today" value={todays.length} />
        <StatTile label="Takings today" value={formatCentavos(takings)} />
        <StatTile label="Shown here" value={rows.length} />
      </div>

      {isManager && (requests ?? []).length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Void requests" />
          <ul className="divide-y divide-line">
            {(requests ?? []).map((request) => {
              const sale = rows.find((s) => s.id === request.sale_id);
              return (
                <li key={request.id} className="space-y-2 px-5 py-4">
                  <p className="text-sm text-fg">
                    <span className="font-medium">{sale?.sale_number ?? "Sale"}</span> — {request.reason}
                  </p>
                  <DecideVoidForm requestId={request.id} />
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Recent sales" />
        {rows.length === 0 ? (
          <EmptyState
            message="No sales recorded yet."
            hint={canSell ? "Ring up the first one with New sale." : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th numeric>Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <TBody>
              {rows.map((sale) => (
                <tr key={sale.id}>
                  <Td>{sale.sale_number}</Td>
                  <Td muted>{sale.sale_date}</Td>
                  <Td muted>
                    {PAYMENT_METHOD_LABEL[sale.payment_method as PaymentMethod] ?? sale.payment_method}
                  </Td>
                  <Td numeric>{formatCentavos(sale.total_centavos)}</Td>
                  <Td>
                    {sale.voided_at ? (
                      <Badge tone="bad">Voided</Badge>
                    ) : isManager ? (
                      <VoidForm saleId={sale.id} mode="void" />
                    ) : canSell ? (
                      <VoidForm saleId={sale.id} mode="request" />
                    ) : (
                      <Badge tone="good">Completed</Badge>
                    )}
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
