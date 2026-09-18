import type { Metadata } from "next";

import { ClosingForm } from "@/app/admin/reports/day-closing/closing-form";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Day closing" };

export default async function DayClosingPage() {
  const { role } = await requireUser();
  const isManager = role === "owner" || role === "admin";
  const canClose = await hasPermission("add_sales");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: closings }, { data: sales }, { data: ledger }] = await Promise.all([
    supabase
      .from("day_closings")
      .select("id, closing_date, expected_cash_centavos, counted_cash_centavos, difference_centavos, total_sales_centavos, target_centavos, target_reached, note")
      .order("closing_date", { ascending: false })
      .limit(30),
    supabase
      .from("sales")
      .select("total_centavos, payment_method, voided_at")
      .eq("sale_date", today),
    // The ledger is owner/admin only, so staff see a zero expectation and the
    // owner reconciles. Better than showing a figure we cannot stand behind.
    isManager
      ? supabase
          .from("ledger_entries")
          .select("direction, amount_centavos, source, voided_at")
          .gte("occurred_at", `${today}T00:00:00Z`)
      : Promise.resolve({ data: [] as { direction: string; amount_centavos: number; source: string; voided_at: string | null }[] }),
  ]);

  const liveSales = (sales ?? []).filter((s) => !s.voided_at);
  const totalSales = liveSales.reduce((sum, s) => sum + s.total_centavos, 0);
  const byMethod = (method: string) =>
    liveSales.filter((s) => s.payment_method === method).reduce((sum, s) => sum + s.total_centavos, 0);

  const expectedCash = (ledger ?? [])
    .filter((e) => !e.voided_at && e.source === "cash_drawer")
    .reduce((sum, e) => sum + (e.direction === "in" ? e.amount_centavos : -e.amount_centavos), 0);

  const alreadyClosed = (closings ?? []).some((c) => c.closing_date === today);

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Day closing"
        description="Count the drawer against what the ledger expects."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Sales today" value={formatCentavos(totalSales)} />
        <StatTile label="Cash sales" value={formatCentavos(byMethod("cash"))} />
        <StatTile label="GCash" value={formatCentavos(byMethod("gcash"))} />
        <StatTile label="Expected in drawer" value={isManager ? formatCentavos(expectedCash) : "—"} />
      </div>

      {canClose && !alreadyClosed ? (
        <Card className="mb-6">
          <CardHeader title={`Close ${today}`} />
          <ClosingForm
            date={today}
            expectedCash={expectedCash}
            totalSales={totalSales}
            gcash={byMethod("gcash")}
            maya={byMethod("maya")}
            bank={byMethod("bank")}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Closing history" />
        {(closings ?? []).length === 0 ? (
          <EmptyState message="No days closed yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th numeric>Sales</Th><Th numeric>Expected</Th>
                <Th numeric>Counted</Th><Th numeric>Difference</Th><Th>Target</Th>
              </tr>
            </thead>
            <TBody>
              {(closings ?? []).map((closing) => (
                <tr key={closing.id}>
                  <Td muted>{closing.closing_date}</Td>
                  <Td numeric>{formatCentavos(closing.total_sales_centavos)}</Td>
                  <Td numeric muted>{formatCentavos(closing.expected_cash_centavos)}</Td>
                  <Td numeric>{formatCentavos(closing.counted_cash_centavos)}</Td>
                  <Td numeric>
                    {closing.difference_centavos === 0 ? (
                      <span className="text-fg-muted">Balanced</span>
                    ) : (
                      <span className="text-brand">
                        {closing.difference_centavos > 0 ? "Over " : "Short "}
                        {formatCentavos(Math.abs(closing.difference_centavos))}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {closing.target_centavos > 0 ? (
                      <Badge tone={closing.target_reached ? "good" : "warn"}>
                        {closing.target_reached ? "Reached" : "Missed"}
                      </Badge>
                    ) : (
                      <span className="text-fg-subtle">—</span>
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
