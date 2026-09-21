import "server-only";

/**
 * Reading Dabz Apparel job orders (spec 8).
 *
 * An order's total is never read from a column, because there is no such
 * column: it is added up from the lines and the roster every time. See
 * src/lib/apparel.ts for why.
 */
import { cache } from "react";

import { type CalendarOrder } from "@/lib/apparel-calendar";
import {
  orderTotals,
  orderWarnings,
  type ApparelSize,
  type OrderLine,
  type OrderPayment,
  type OrderStatus,
  type OrderTotals,
  type OrderWarning,
  type RosterEntry,
  type SizePrice,
} from "@/lib/apparel";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ApparelProduct {
  id: string;
  name: string;
  basePriceCentavos: number | null;
  incomeCategory: string;
  sortOrder: number;
  active: boolean;
  note: string | null;
}

/**
 * Which apparel items are already on a job order, so the price screen knows
 * which ones may still be deleted (see `src/lib/deletable.ts`).
 *
 * One call for the whole list rather than one per row, and it counts distinct
 * items rather than order lines. An empty set on failure is the safe
 * direction: the screen offers a Delete, the policy refuses it, and the owner
 * is told nothing was removed.
 */
export const getApparelProductsWithOrders = cache(
  async (): Promise<Set<string>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("apparel_products_with_orders");

    if (error || !data) return new Set();
    return new Set(
      (data as { apparel_product_id: string }[]).map((row) => row.apparel_product_id),
    );
  },
);

export interface ApparelOption {
  id: string;
  kind: "fabric" | "collar";
  label: string;
  extraCentavos: number | null;
  active: boolean;
}

export interface ApparelOrder {
  id: string;
  orderNumber: string;
  orderedOn: string;
  customerId: string | null;
  customerName: string | null;
  teamName: string | null;
  status: OrderStatus;
  promisedOn: string | null;
  layoutNote: string | null;
  note: string | null;
  cancelReason: string | null;
  createdBy: string | null;
}

export interface ApparelOrderDetail {
  order: ApparelOrder;
  lines: OrderLine[];
  roster: RosterEntry[];
  payments: OrderPayment[];
  totals: OrderTotals;
  warnings: OrderWarning[];
}

export const getApparelProducts = cache(async (): Promise<ApparelProduct[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("apparel_products")
    .select("id, name, base_price_centavos, income_category, sort_order, active, note")
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    basePriceCentavos:
      row.base_price_centavos === null ? null : Number(row.base_price_centavos),
    incomeCategory: row.income_category,
    sortOrder: Number(row.sort_order),
    active: row.active,
    note: row.note,
  }));
});

export const getSizePrices = cache(async (): Promise<SizePrice[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("apparel_size_prices")
    .select("size, extra_centavos, sort_order")
    .order("sort_order");

  if (error || !data) return [];

  return data.map((row) => ({
    size: row.size as ApparelSize,
    extraCentavos: row.extra_centavos === null ? null : Number(row.extra_centavos),
  }));
});

export const getApparelOptions = cache(async (): Promise<ApparelOption[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("apparel_options")
    .select("id, kind, label, extra_centavos, active, sort_order")
    .order("kind")
    .order("sort_order")
    .order("label");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    kind: row.kind === "collar" ? "collar" : "fabric",
    label: row.label,
    extraCentavos: row.extra_centavos === null ? null : Number(row.extra_centavos),
    active: row.active,
  }));
});

const ORDER_COLUMNS =
  "id, order_number, ordered_on, customer_id, team_name, status, promised_on, layout_note, note, cancel_reason, created_by";

function toOrder(
  row: Record<string, unknown>,
  customerNames: Map<string, string>,
): ApparelOrder {
  const customerId = (row.customer_id as string | null) ?? null;
  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    orderedOn: String(row.ordered_on),
    customerId,
    customerName: customerId ? customerNames.get(customerId) ?? null : null,
    teamName: (row.team_name as string | null) ?? null,
    status: String(row.status) as OrderStatus,
    promisedOn: (row.promised_on as string | null) ?? null,
    layoutNote: (row.layout_note as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

function toLine(row: Record<string, unknown>): OrderLine {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    name: String(row.name),
    fabric: (row.fabric as string | null) ?? null,
    collar: (row.collar as string | null) ?? null,
    unitPriceCentavos: Number(row.unit_price_centavos),
    quantity: Number(row.quantity),
    incomeCategory: String(row.income_category),
  };
}

function toRoster(row: Record<string, unknown>): RosterEntry {
  return {
    id: String(row.id),
    lineId: String(row.line_id),
    playerName: (row.player_name as string | null) ?? null,
    playerNumber: (row.player_number as string | null) ?? null,
    size: String(row.size) as ApparelSize,
    sizeExtraCentavos: Number(row.size_extra_centavos),
  };
}

function toPayment(row: Record<string, unknown>): OrderPayment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    amountCentavos: Number(row.amount_centavos),
    paidOn: String(row.paid_on),
    source: String(row.source),
    kind: row.kind === "down_payment" ? "down_payment" : "balance",
    note: (row.note as string | null) ?? null,
  };
}

/**
 * Every order, with its totals worked out.
 *
 * Read in four queries rather than one joined one, because a join would
 * multiply the payments by the roster rows and the totals would be nonsense.
 */
export const getApparelOrders = cache(
  async (options?: { limit?: number }): Promise<ApparelOrderDetail[]> => {
    const supabase = await createSupabaseServerClient();
    const today = civilDateToISO(manilaToday());

    const { data: orderRows, error } = await supabase
      .from("apparel_orders")
      .select(ORDER_COLUMNS)
      .order("ordered_on", { ascending: false })
      .limit(options?.limit ?? 200);

    if (error || !orderRows || orderRows.length === 0) return [];

    const [{ data: lineRows }, { data: rosterRows }, { data: paymentRows }, { data: customerRows }] =
      await Promise.all([
        supabase
          .from("apparel_order_lines")
          .select(
            "id, order_id, name, fabric, collar, unit_price_centavos, quantity, income_category",
          ),
        supabase
          .from("apparel_order_names")
          .select("id, line_id, player_name, player_number, size, size_extra_centavos, sort_order")
          .order("sort_order"),
        // Voided payments are skipped, exactly as voided ledger entries are:
        // a balance that still counts money handed back is a wrong balance.
        supabase
          .from("apparel_payments")
          .select("id, order_id, amount_centavos, paid_on, source, kind, note, voided_at")
          .order("paid_on", { ascending: false }),
        supabase.from("customers").select("id, name"),
      ]);

    const customerNames = new Map(
      (customerRows ?? []).map((row) => [row.id as string, row.name as string]),
    );

    const allLines = (lineRows ?? []).map((row) => toLine(row as Record<string, unknown>));
    const allRoster = (rosterRows ?? []).map((row) => toRoster(row as Record<string, unknown>));
    const livePayments = (paymentRows ?? [])
      .filter((row) => row.voided_at === null)
      .map((row) => toPayment(row as Record<string, unknown>));

    const lineIdsByOrder = new Map<string, Set<string>>();
    for (const line of allLines) {
      const set = lineIdsByOrder.get(line.orderId) ?? new Set<string>();
      set.add(line.id);
      lineIdsByOrder.set(line.orderId, set);
    }

    return orderRows.map((row) => {
      const order = toOrder(row as Record<string, unknown>, customerNames);
      const lines = allLines.filter((line) => line.orderId === order.id);
      const ownLineIds = lineIdsByOrder.get(order.id) ?? new Set<string>();
      const roster = allRoster.filter((entry) => ownLineIds.has(entry.lineId));
      const payments = livePayments.filter((payment) => payment.orderId === order.id);

      const totals = orderTotals({ lines, roster, payments });

      return {
        order,
        lines,
        roster,
        payments,
        totals,
        warnings: orderWarnings({
          status: order.status,
          promisedOn: order.promisedOn,
          today,
          totals,
        }),
      };
    });
  },
);

/**
 * An order as the production calendar needs it (see
 * `src/lib/apparel-calendar.ts`).
 *
 * Here rather than in either screen, because two screens ask the same
 * question - the Apparel list wants the count of priority projects, the
 * calendar wants the projects themselves - and two copies of this mapping
 * would be two chances for them to disagree about what a project is.
 */
export function toCalendarOrder(detail: ApparelOrderDetail): CalendarOrder {
  return {
    id: detail.order.id,
    orderNumber: detail.order.orderNumber,
    teamName: detail.order.teamName,
    customerName: detail.order.customerName,
    status: detail.order.status,
    promisedOn: detail.order.promisedOn,
    itemCount: detail.totals.itemCount,
    totalCentavos: detail.totals.totalCentavos,
    balanceCentavos: detail.totals.balanceCentavos,
  };
}

export async function getApparelOrder(
  orderId: string,
): Promise<ApparelOrderDetail | null> {
  const orders = await getApparelOrders();
  return orders.find((entry) => entry.order.id === orderId) ?? null;
}

/** Voided payments, shown on the order so a void can be explained. */
export async function getVoidedPayments(
  orderId: string,
): Promise<{ id: string; amountCentavos: number; voidReason: string | null }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("apparel_payments")
    .select("id, order_id, amount_centavos, void_reason, voided_at")
    .eq("order_id", orderId)
    .order("paid_on", { ascending: false });

  if (error || !data) return [];

  return data
    .filter((row) => row.voided_at !== null)
    .map((row) => ({
      id: row.id,
      amountCentavos: Number(row.amount_centavos),
      voidReason: row.void_reason,
    }));
}
