import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  AddNameForm, AddOrderLineForm, ApparelPaymentForm,
  OrderStatusForm, VoidApparelPaymentForm,
} from "@/app/admin/apparel/apparel-forms";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { MONEY_SOURCE_LABEL, humanise, type MoneySource } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Apparel order" };

export default async function OrderPage({ params }: PageProps<"/admin/apparel/[id]">) {
  const { id } = await params;
  const { role } = await requireUser();
  const canWork = await hasPermission("apparel_job_orders");
  const isManager = role === "owner" || role === "admin";

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("apparel_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: lines }, { data: payments }, { data: products }, { data: options }] =
    await Promise.all([
      supabase
        .from("apparel_order_lines")
        .select("id, name, fabric, collar, unit_price_centavos, quantity, income_category")
        .eq("order_id", id)
        .order("created_at"),
      supabase
        .from("apparel_payments")
        .select("id, amount_centavos, paid_on, source, kind, voided_at")
        .eq("order_id", id)
        .order("paid_on"),
      supabase.from("apparel_products").select("id, name").eq("active", true).order("sort_order"),
      supabase.from("apparel_options").select("kind, label").eq("active", true).order("sort_order"),
    ]);

  // `.in()` on an empty list simply matches nothing, so this needs no special
  // case — and the row type stays inferred rather than hand-written.
  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: names } = await supabase
    .from("apparel_order_names")
    .select("id, line_id, player_name, player_number, size, size_extra_centavos")
    .in("line_id", lineIds)
    .order("sort_order");

  const namesByLine = new Map<string, typeof names>();
  for (const row of names ?? []) {
    namesByLine.set(row.line_id, [...(namesByLine.get(row.line_id) ?? []), row]);
  }

  // The order is its lines plus every size surcharge on the name list.
  const lineTotal = (lines ?? []).reduce(
    (sum, l) => sum + l.unit_price_centavos * l.quantity,
    0,
  );
  const sizeExtras = (names ?? []).reduce(
    (sum, n) => sum + (n.size_extra_centavos ?? 0),
    0,
  );
  const charged = lineTotal + sizeExtras;
  const paid = (payments ?? [])
    .filter((p) => !p.voided_at)
    .reduce((sum, p) => sum + p.amount_centavos, 0);

  const fabrics = (options ?? []).filter((o) => o.kind === "fabric").map((o) => o.label);
  const collars = (options ?? []).filter((o) => o.kind === "collar").map((o) => o.label);

  return (
    <div>
      <PageHeader
        eyebrow="Apparel"
        title={order.order_number}
        description={order.team_name ?? undefined}
        actions={<Badge tone="brand">{humanise(order.status)}</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Lines" value={formatCentavos(lineTotal)} />
        <StatTile label="Size extras" value={formatCentavos(sizeExtras)} />
        <StatTile label="Paid" value={formatCentavos(paid)} />
        <StatTile label="Balance" value={formatCentavos(charged - paid)} />
      </div>

      {canWork ? (
        <Card className="mb-6">
          <CardHeader title="Status" />
          <div className="p-5">
            <OrderStatusForm orderId={order.id} status={order.status} />
          </div>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="Lines" />
        {(lines ?? []).length === 0 ? (
          <EmptyState message="No lines yet." />
        ) : (
          <ul className="divide-y divide-line">
            {(lines ?? []).map((line) => {
              const players = namesByLine.get(line.id) ?? [];
              return (
                <li key={line.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-fg">{line.name}</p>
                      <p className="text-xs text-fg-subtle">
                        {[line.fabric, line.collar].filter(Boolean).join(" · ") || "No options"}
                        {" · "}{players.length} name{players.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="text-sm tabular-nums text-fg">
                      {line.quantity} × {formatCentavos(line.unit_price_centavos)} ={" "}
                      {formatCentavos(line.unit_price_centavos * line.quantity)}
                    </p>
                  </div>

                  {players.length > 0 ? (
                    <ul className="flex flex-wrap gap-2 px-5 pb-3">
                      {players.map((player) => (
                        <li
                          key={player.id}
                          className="rounded-lg border border-line px-2.5 py-1 text-xs text-fg-muted"
                        >
                          {player.player_name ?? "—"}
                          {player.player_number ? ` #${player.player_number}` : ""} · {player.size}
                          {player.size_extra_centavos
                            ? ` (+${formatCentavos(player.size_extra_centavos)})`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {canWork ? <AddNameForm orderId={order.id} lineId={line.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {canWork ? (
          <div className="border-t border-line">
            <AddOrderLineForm
              orderId={order.id}
              products={products ?? []}
              fabrics={fabrics}
              collars={collars}
            />
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Payments" />
        {(payments ?? []).length === 0 ? (
          <EmptyState message="No payments taken." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Kind</Th><Th numeric>Amount</Th><Th>From</Th><Th>Status</Th></tr>
            </thead>
            <TBody>
              {(payments ?? []).map((payment) => (
                <tr key={payment.id}>
                  <Td muted>{payment.paid_on}</Td>
                  <Td muted>{humanise(payment.kind)}</Td>
                  <Td numeric>{formatCentavos(payment.amount_centavos)}</Td>
                  <Td muted>
                    {MONEY_SOURCE_LABEL[payment.source as MoneySource] ?? payment.source}
                  </Td>
                  <Td>
                    {payment.voided_at ? (
                      <Badge tone="bad">Voided</Badge>
                    ) : isManager ? (
                      <VoidApparelPaymentForm paymentId={payment.id} orderId={order.id} />
                    ) : (
                      <Badge tone="good">Taken</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        {canWork ? (
          <div className="border-t border-line">
            <ApparelPaymentForm orderId={order.id} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
