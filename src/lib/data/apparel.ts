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
import { isColumnMissingFromApi, type PostgrestLikeError } from "@/lib/postgrest";
import { isApparelSize, isUniformType, type UniformType } from "@/lib/uniforms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  Phase 13 added columns to four tables that every apparel screen reads, and
  the app deploys the moment a branch merges while `npm run db:push` is run by
  hand afterwards. In between, a read asking for `uniform_type` fails outright -
  and a failed read here comes back as an empty list, which is the shape of the
  bug that cost the owner a day in September: "no job orders" and "PHP 0.00"
  where the truth was "the database is behind".

  So a read that fails ONLY because a column is not there yet is sent again
  without the Phase 13 columns. The project opens, totals to the same centavo
  and prints; what the new columns would have said reads as "not recorded",
  which is true. The System check screen still names `0019` as the migration to
  apply, because that is where a database being behind belongs.
*/
type Read = { data: unknown[] | null; error: PostgrestLikeError | null };

async function readPast13<T extends Read>(
  withPhase13: () => PromiseLike<T>,
  withoutIt: () => PromiseLike<T>,
): Promise<T> {
  const first = await withPhase13();
  if (!first.error || !isColumnMissingFromApi(first.error)) return first;
  return withoutIt();
}

const PRODUCT_COLUMNS_BEFORE_13 =
  "id, name, base_price_centavos, income_category, sort_order, active, note";
const PRODUCT_COLUMNS = `${PRODUCT_COLUMNS_BEFORE_13}, uniform_type`;

const ORDER_COLUMNS_BEFORE_13 =
  "id, order_number, ordered_on, customer_id, team_name, status, promised_on, layout_note, note, cancel_reason, created_by";
const ORDER_COLUMNS = `${ORDER_COLUMNS_BEFORE_13}, contact_person, contact_number, address, facebook_link`;

const LINE_COLUMNS_BEFORE_13 =
  "id, order_id, name, fabric, collar, unit_price_centavos, quantity, income_category";
const LINE_COLUMNS = `${LINE_COLUMNS_BEFORE_13}, uniform_type, custom_type_name, retired_at`;

const ROSTER_COLUMNS_BEFORE_13 =
  "id, line_id, player_name, player_number, size, size_extra_centavos, sort_order";
const ROSTER_COLUMNS = `${ROSTER_COLUMNS_BEFORE_13}, uniform_type, custom_type_name, short_size, short_name, price_centavos, note, quantity, upper_included`;

export interface ApparelProduct {
  id: string;
  name: string;
  basePriceCentavos: number | null;
  incomeCategory: string;
  sortOrder: number;
  active: boolean;
  note: string | null;
  /**
   * Which of the six uniform types this priced item is (Phase 13), so the
   * encoding table can pre-fill a row's price. Null until the owner tags it -
   * guessing "Jersey" from the words "Sublimation jersey set" is exactly the
   * confident wrong answer this system does not give.
   */
  uniformType: UniformType | null;
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

/**
 * Has anything happened to this project - a payment, a bench mark, a release?
 *
 * Null when the question could not be asked, which the helper also answers to
 * anyone who is not Owner/Admin. The caller must treat null as "do not offer
 * the button": the delete policy refuses anything it cannot vouch for, so an
 * offered button would only produce a refusal.
 */
export async function getApparelOrderHasHistory(
  orderId: string,
): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("apparel_order_has_history", {
    p_order_id: orderId,
  });

  if (error || data === null || data === undefined) return null;
  return data === true;
}

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
  /*
    The project's OWN contact details (Phase 13). On the order rather than on
    the customer record, because a team's contact person is a fact about this
    project: next season it is a different manager, and the sheet has to say
    who was actually spoken to. Where one is empty the screen shows the linked
    customer's value, clearly labelled as coming from there - shown, never
    copied in, and never written back.
  */
  contactPerson: string | null;
  contactNumber: string | null;
  address: string | null;
  facebookLink: string | null;
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
  const { data, error } = await readPast13(
    () =>
      supabase
        .from("apparel_products")
        .select(PRODUCT_COLUMNS)
        .order("active", { ascending: false })
        .order("sort_order")
        .order("name"),
    () =>
      supabase
        .from("apparel_products")
        .select(PRODUCT_COLUMNS_BEFORE_13)
        .order("active", { ascending: false })
        .order("sort_order")
        .order("name"),
  );

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    basePriceCentavos:
      row.base_price_centavos === null || row.base_price_centavos === undefined
        ? null
        : Number(row.base_price_centavos),
    incomeCategory: String(row.income_category),
    sortOrder: Number(row.sort_order),
    active: row.active !== false,
    note: (row.note as string | null) ?? null,
    uniformType:
      typeof row.uniform_type === "string" && isUniformType(row.uniform_type)
        ? row.uniform_type
        : null,
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
    contactPerson: (row.contact_person as string | null) ?? null,
    contactNumber: (row.contact_number as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    facebookLink: (row.facebook_link as string | null) ?? null,
  };
}

function toLine(row: Record<string, unknown>): OrderLine {
  const type = (row.uniform_type as string | null) ?? null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    name: String(row.name),
    fabric: (row.fabric as string | null) ?? null,
    collar: (row.collar as string | null) ?? null,
    unitPriceCentavos: Number(row.unit_price_centavos),
    quantity: Number(row.quantity),
    incomeCategory: String(row.income_category),
    // A type this app does not know is impossible - a check constraint refuses
    // one - but a row written by a newer copy of the app would be, and reading
    // it as "not recorded" is safer than drawing a line nothing can label.
    uniformType: type !== null && isUniformType(type) ? type : null,
    customTypeName: (row.custom_type_name as string | null) ?? null,
    retiredAt: (row.retired_at as string | null) ?? null,
  };
}

function toRoster(row: Record<string, unknown>): RosterEntry {
  const type = (row.uniform_type as string | null) ?? null;
  const size = (row.size as string | null) ?? null;
  const shortSize = (row.short_size as string | null) ?? null;
  const price = row.price_centavos;

  return {
    id: String(row.id),
    lineId: String(row.line_id),
    uniformType: type !== null && isUniformType(type) ? type : null,
    customTypeName: (row.custom_type_name as string | null) ?? null,
    playerName: (row.player_name as string | null) ?? null,
    playerNumber: (row.player_number as string | null) ?? null,
    // A size may now be left empty while encoding, so null is a real answer
    // rather than a read that went wrong.
    size: size !== null && isApparelSize(size) ? size : null,
    shortSize: shortSize !== null && isApparelSize(shortSize) ? shortSize : null,
    shortName: (row.short_name as string | null) ?? null,
    // Null is what makes a row fall back to its item's price each, which is
    // how every order written before Phase 13 still totals the same.
    priceCentavos: price === null || price === undefined ? null : Number(price),
    note: (row.note as string | null) ?? null,
    quantity: Number(row.quantity ?? 1),
    upperIncluded: row.upper_included !== false,
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

    const limit = options?.limit ?? 200;

    const { data: orderRows, error } = await readPast13(
      () =>
        supabase
          .from("apparel_orders")
          .select(ORDER_COLUMNS)
          .order("ordered_on", { ascending: false })
          .limit(limit),
      () =>
        supabase
          .from("apparel_orders")
          .select(ORDER_COLUMNS_BEFORE_13)
          .order("ordered_on", { ascending: false })
          .limit(limit),
    );

    if (error || !orderRows || orderRows.length === 0) return [];

    const [{ data: lineRows }, { data: rosterRows }, { data: paymentRows }, { data: customerRows }] =
      await Promise.all([
        readPast13(
          () => supabase.from("apparel_order_lines").select(LINE_COLUMNS),
          () => supabase.from("apparel_order_lines").select(LINE_COLUMNS_BEFORE_13),
        ),
        readPast13(
          () =>
            supabase
              .from("apparel_order_names")
              .select(ROSTER_COLUMNS)
              .order("sort_order"),
          () =>
            supabase
              .from("apparel_order_names")
              .select(ROSTER_COLUMNS_BEFORE_13)
              .order("sort_order"),
        ),
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
