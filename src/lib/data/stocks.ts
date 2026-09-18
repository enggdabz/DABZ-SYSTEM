import "server-only";

/**
 * Reading stock items and their movements (spec 14).
 *
 * The quantity on hand is never read from a column, because there is no such
 * column: it is added up from the movements every time. See src/lib/stocks.ts
 * for why.
 */
import { cache } from "react";

import type { ExpenseTag } from "@/lib/divisions";
import {
  buildStockLines,
  itemsNeedingAttention,
  movementHistory,
  totalStockValue,
  type MovementKind,
  type StockItem,
  type StockLine,
  type StockMovement,
} from "@/lib/stocks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ITEM_COLUMNS =
  "id, name, unit, tag, reorder_level_thousandths, unit_cost_centavos, photo_path, supplier_id, note, active";

const MOVEMENT_COLUMNS =
  "id, stock_item_id, kind, delta_thousandths, unit_cost_centavos, reason, occurred_at, created_by";

function toItem(row: Record<string, unknown>): StockItem {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit),
    tag: String(row.tag) as ExpenseTag,
    reorderLevel:
      row.reorder_level_thousandths === null
        ? null
        : Number(row.reorder_level_thousandths),
    unitCostCentavos:
      row.unit_cost_centavos === null ? null : Number(row.unit_cost_centavos),
    photoPath: (row.photo_path as string | null) ?? null,
    supplierId: (row.supplier_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    active: Boolean(row.active),
  };
}

function toMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: String(row.id),
    stockItemId: String(row.stock_item_id),
    kind: String(row.kind) as MovementKind,
    delta: Number(row.delta_thousandths),
    unitCostCentavos:
      row.unit_cost_centavos === null ? null : Number(row.unit_cost_centavos),
    reason: (row.reason as string | null) ?? null,
    occurredAt: String(row.occurred_at),
    createdBy: (row.created_by as string | null) ?? null,
  };
}

export const getStockItems = cache(async (): Promise<StockItem[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select(ITEM_COLUMNS)
    .order("active", { ascending: false })
    .order("name");

  if (error || !data) return [];
  return data.map((row) => toItem(row as Record<string, unknown>));
});

export const getStockMovements = cache(
  async (options?: { limit?: number }): Promise<StockMovement[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("stock_movements")
      .select(MOVEMENT_COLUMNS)
      .order("occurred_at", { ascending: false })
      .limit(options?.limit ?? 2000);

    if (error || !data) return [];
    return data.map((row) => toMovement(row as Record<string, unknown>));
  },
);

export interface StockOverview {
  lines: StockLine[];
  needingAttention: StockLine[];
  value: ReturnType<typeof totalStockValue>;
}

export const getStockOverview = cache(async (): Promise<StockOverview> => {
  const [items, movements] = await Promise.all([
    getStockItems(),
    getStockMovements(),
  ]);

  const lines = buildStockLines(items, movements);

  return {
    lines,
    needingAttention: itemsNeedingAttention(lines),
    value: totalStockValue(lines.filter((line) => line.item.active)),
  };
});

/** One item's movements, oldest first, with the running quantity. */
export async function getItemHistory(itemId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select(MOVEMENT_COLUMNS)
    .eq("stock_item_id", itemId)
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return movementHistory(data.map((row) => toMovement(row as Record<string, unknown>)));
}
