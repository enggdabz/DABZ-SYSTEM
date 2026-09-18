import type { Metadata } from "next";

import {
  AdjustStockForm, ReceiveStockForm, StockItemForm,
} from "@/app/admin/inventory/inventory-forms";
import {
  Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader,
  StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { TAG_LABEL, type Tag } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { role } = await requireUser();
  const isManager = role === "owner" || role === "admin";
  const canMove = await hasPermission("stock_in_out");

  const supabase = await createClient();
  const [{ data: items }, { data: movements }, { data: suppliers }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id, name, unit, tag, unit_cost_centavos, reorder_level_thousandths, active")
      .order("name"),
    supabase.from("stock_movements").select("stock_item_id, delta_thousandths"),
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
  ]);

  // On hand is the sum of every movement; there is no stored balance to drift.
  const onHand = new Map<string, number>();
  for (const move of movements ?? []) {
    onHand.set(
      move.stock_item_id,
      (onHand.get(move.stock_item_id) ?? 0) + move.delta_thousandths,
    );
  }

  // unit_cost_centavos and reorder_level_thousandths are nullable; treat an
  // unset value as zero so the arithmetic below has no nulls to guard.
  const rows = (items ?? []).map((item) => ({
    ...item,
    unit_cost_centavos: item.unit_cost_centavos ?? 0,
    reorder_level_thousandths: item.reorder_level_thousandths ?? 0,
  }));
  const active = rows.filter((i) => i.active);
  const low = active.filter(
    (i) => (onHand.get(i.id) ?? 0) <= i.reorder_level_thousandths,
  );
  const stockValue = active.reduce(
    (sum, i) => sum + Math.round(((onHand.get(i.id) ?? 0) * i.unit_cost_centavos) / 1000),
    0,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Stock"
        description="Levels are the running total of every movement."
        actions={
          <>
            <ButtonLink href="/admin/inventory/suppliers" variant="secondary">Suppliers</ButtonLink>
            <ButtonLink href="/admin/inventory/customers" variant="secondary">Customers</ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active items" value={active.length} />
        <StatTile label="At or below reorder" value={low.length} />
        <StatTile label="Stock value" value={formatCentavos(stockValue)} />
      </div>

      {canMove && active.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Receive stock" />
          <ReceiveStockForm
            items={active.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
            suppliers={suppliers ?? []}
          />
        </Card>
      ) : null}

      {isManager ? (
        <Card className="mb-6">
          <CardHeader title="New item" />
          <StockItemForm />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Items" />
        {rows.length === 0 ? (
          <EmptyState
            message="No stock items yet."
            hint={isManager ? "Add the first one above." : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Tag</Th>
                <Th numeric>On hand</Th>
                <Th numeric>Reorder at</Th>
                <Th numeric>Unit cost</Th>
                <Th>Status</Th>
                {canMove ? <Th>Movement</Th> : null}
              </tr>
            </thead>
            <TBody>
              {rows.map((item) => {
                const held = onHand.get(item.id) ?? 0;
                const isLow = held <= item.reorder_level_thousandths;
                return (
                  <tr key={item.id}>
                    <Td>
                      {item.name}
                      <span className="ml-1 text-xs text-fg-subtle">{item.unit}</span>
                    </Td>
                    <Td muted>{TAG_LABEL[item.tag as Tag] ?? item.tag}</Td>
                    <Td numeric>{formatQuantity(held)}</Td>
                    <Td numeric muted>{formatQuantity(item.reorder_level_thousandths)}</Td>
                    <Td numeric muted>{formatCentavos(item.unit_cost_centavos)}</Td>
                    <Td>
                      {!item.active ? (
                        <Badge>Inactive</Badge>
                      ) : isLow ? (
                        <Badge tone="warn">Reorder</Badge>
                      ) : (
                        <Badge tone="good">In stock</Badge>
                      )}
                    </Td>
                    {canMove ? (
                      <Td>
                        <AdjustStockForm itemId={item.id} />
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
