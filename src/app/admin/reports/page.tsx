import type { Metadata } from "next";

import { BarChart, type Bar } from "@/components/bar-chart";
import {
  Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader,
  StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { MONEY_SOURCE_LABEL, TAG_LABEL, humanise, type MoneySource, type Tag } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

/** The last `count` dates, oldest first, as YYYY-MM-DD. */
function recentDates(count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - i);
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

export default async function ReportsPage() {
  await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const window = recentDates(14);
  const from = window[0];

  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("id, occurred_at, direction, amount_centavos, tag, category, source, note, voided_at")
    .gte("occurred_at", `${from}T00:00:00Z`)
    .order("occurred_at", { ascending: false })
    .limit(300);

  // A voided entry is still a row; it just no longer counts.
  const live = (entries ?? []).filter((e) => !e.voided_at);

  const takingsByDay = new Map<string, number>();
  let moneyIn = 0;
  let moneyOut = 0;
  for (const entry of live) {
    const day = entry.occurred_at.slice(0, 10);
    if (entry.direction === "in") {
      moneyIn += entry.amount_centavos;
      takingsByDay.set(day, (takingsByDay.get(day) ?? 0) + entry.amount_centavos);
    } else {
      moneyOut += entry.amount_centavos;
    }
  }

  const bars: Bar[] = window.map((date) => ({
    label: date.slice(8),
    value: takingsByDay.get(date) ?? 0,
  }));
  const hasTakings = bars.some((b) => b.value > 0);

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Ledger"
        description="Every entry from the last fortnight."
        actions={<ButtonLink href="/admin/reports/day-closing" variant="secondary">Day closing</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Money in" value={formatCentavos(moneyIn)} />
        <StatTile label="Money out" value={formatCentavos(moneyOut)} />
        <StatTile label="Net" value={formatCentavos(moneyIn - moneyOut)} />
      </div>

      {hasTakings ? (
        <Card className="mb-6">
          <div className="p-5">
            <BarChart bars={bars} caption="Takings per day, last 14 days" />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Entries" />
        {live.length === 0 ? (
          <EmptyState
            message="Nothing in the ledger for the last fortnight."
            hint="Sales, repairs, apparel payments and expenses all post here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th><Th>Direction</Th><Th numeric>Amount</Th>
                <Th>Tag</Th><Th>Category</Th><Th>Source</Th><Th>Note</Th>
              </tr>
            </thead>
            <TBody>
              {live.map((entry) => (
                <tr key={entry.id}>
                  <Td muted>{entry.occurred_at.slice(0, 10)}</Td>
                  <Td>
                    <Badge tone={entry.direction === "in" ? "good" : "neutral"}>
                      {entry.direction === "in" ? "In" : "Out"}
                    </Badge>
                  </Td>
                  <Td numeric>{formatCentavos(entry.amount_centavos)}</Td>
                  <Td muted>{TAG_LABEL[entry.tag as Tag] ?? entry.tag}</Td>
                  <Td muted>{humanise(entry.category)}</Td>
                  <Td muted>{MONEY_SOURCE_LABEL[entry.source as MoneySource] ?? entry.source}</Td>
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
