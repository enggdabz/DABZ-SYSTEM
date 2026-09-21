import "server-only";

/**
 * Reading the counter's data: products, customers and sales (spec 5, 6, 7).
 *
 * Row Level Security decides what comes back, so a staff member sees the sales
 * they rang up and the owner sees all of them, without the screens having to
 * know the difference.
 */
import { cache } from "react";

import type { DivisionId } from "@/lib/divisions";
import type { Centavos } from "@/lib/money";
import type { PriceTier } from "@/lib/pos";
import {
  civilDateToISO,
  manilaToday,
  parseISODate,
  type CivilDate,
} from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Product {
  id: string;
  name: string;
  division: DivisionId;
  /** Null means the price is asked for at the counter each time. */
  priceCentavos: Centavos | null;
  manualPrice: boolean;
  unit: string | null;
  section: string;
  sortOrder: number;
  incomeCategory: string;
  active: boolean;
  /** Carries the row id too, so a rule can be removed again. */
  tiers: (PriceTier & { id: string })[];
}

/** The order the sections appear on the counter screen. */
export const PRODUCT_SECTIONS = [
  "printing",
  "photocopy",
  "souvenirs",
  "other",
] as const;

export const SECTION_LABELS: Record<string, string> = {
  printing: "Printing",
  photocopy: "Photocopy",
  souvenirs: "Mugs & souvenirs",
  other: "Saved products",
};

export const getProducts = cache(async (): Promise<Product[]> => {
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, { data: tierRows }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, division, price_centavos, manual_price, unit, section, sort_order, income_category, active",
      )
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("product_price_tiers")
      .select("id, product_id, min_quantity, unit_price_centavos"),
  ]);

  if (error || !data) return [];

  const tiersByProduct = new Map<string, (PriceTier & { id: string })[]>();
  for (const row of tierRows ?? []) {
    const list = tiersByProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      minQuantity: Number(row.min_quantity),
      unitPriceCentavos: Number(row.unit_price_centavos),
    });
    tiersByProduct.set(row.product_id, list);
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    division: row.division as DivisionId,
    priceCentavos: row.price_centavos === null ? null : Number(row.price_centavos),
    manualPrice: row.manual_price,
    unit: row.unit,
    section: row.section,
    sortOrder: Number(row.sort_order),
    incomeCategory: row.income_category,
    active: row.active,
    tiers: tiersByProduct.get(row.id) ?? [],
  }));
});

/** Every product, including deactivated ones, for the Products screen. */
export const getAllProducts = cache(async (): Promise<Product[]> => {
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, { data: tierRows }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, division, price_centavos, manual_price, unit, section, sort_order, income_category, active",
      )
      .order("active", { ascending: false })
      .order("sort_order")
      .order("name"),
    supabase
      .from("product_price_tiers")
      .select("id, product_id, min_quantity, unit_price_centavos"),
  ]);

  if (error || !data) return [];

  const tiersByProduct = new Map<string, (PriceTier & { id: string })[]>();
  for (const row of tierRows ?? []) {
    const list = tiersByProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      minQuantity: Number(row.min_quantity),
      unitPriceCentavos: Number(row.unit_price_centavos),
    });
    tiersByProduct.set(row.product_id, list);
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    division: row.division as DivisionId,
    priceCentavos: row.price_centavos === null ? null : Number(row.price_centavos),
    manualPrice: row.manual_price,
    unit: row.unit,
    section: row.section,
    sortOrder: Number(row.sort_order),
    incomeCategory: row.income_category,
    active: row.active,
    tiers: tiersByProduct.get(row.id) ?? [],
  }));
});

/**
 * Which products have been sold, so the Products screen knows which ones may
 * still be deleted (see `src/lib/deletable.ts`).
 *
 * A database function rather than a read of `sale_lines`, for two reasons: it
 * answers for every product in one call instead of one per card, and it counts
 * distinct products rather than lines, so a shop with fifty thousand sale
 * lines does not fetch fifty thousand rows to learn about thirty products.
 *
 * An empty set on failure is the safe direction: the screen offers a Delete,
 * the delete policy refuses it, and the owner is told nothing was removed.
 */
export const getProductsWithSales = cache(async (): Promise<Set<string>> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("products_with_sales");

  if (error || !data) return new Set();
  return new Set((data as { product_id: string }[]).map((row) => row.product_id));
});

export interface Customer {
  id: string;
  name: string;
  contactNumber: string | null;
  address: string | null;
  facebookName: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
}

export const getCustomers = cache(async (): Promise<Customer[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, contact_number, address, facebook_name, email, note, active")
    .eq("active", true)
    .order("name")
    .limit(1000);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    contactNumber: row.contact_number,
    address: row.address,
    facebookName: row.facebook_name,
    email: row.email,
    note: row.note,
    active: row.active,
  }));
});

export interface SaleLineRow {
  id: string;
  saleId: string;
  name: string;
  division: DivisionId;
  quantity: number;
  unitPriceCentavos: Centavos;
  lineTotalCentavos: Centavos;
}

export interface SaleRow {
  id: string;
  saleNumber: string;
  occurredAt: string;
  saleDate: CivilDate;
  customerId: string | null;
  subtotalCentavos: Centavos;
  discountCentavos: Centavos;
  discountKind: "none" | "amount" | "percent";
  discountPercent: number | null;
  totalCentavos: Centavos;
  paymentMethod: "cash" | "gcash" | "maya" | "bank";
  referenceNumber: string | null;
  moneyGivenCentavos: Centavos | null;
  changeCentavos: Centavos | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: string | null;
}

function toSaleRow(row: Record<string, unknown>): SaleRow | null {
  const saleDate = parseISODate(String(row.sale_date));
  if (!saleDate) return null;

  return {
    id: String(row.id),
    saleNumber: String(row.sale_number),
    occurredAt: String(row.occurred_at),
    saleDate,
    customerId: (row.customer_id as string | null) ?? null,
    subtotalCentavos: Number(row.subtotal_centavos),
    discountCentavos: Number(row.discount_centavos),
    discountKind: row.discount_kind as SaleRow["discountKind"],
    discountPercent:
      row.discount_percent === null ? null : Number(row.discount_percent),
    totalCentavos: Number(row.total_centavos),
    paymentMethod: row.payment_method as SaleRow["paymentMethod"],
    referenceNumber: (row.reference_number as string | null) ?? null,
    moneyGivenCentavos:
      row.money_given_centavos === null ? null : Number(row.money_given_centavos),
    changeCentavos:
      row.change_centavos === null ? null : Number(row.change_centavos),
    voidedAt: (row.voided_at as string | null) ?? null,
    voidReason: (row.void_reason as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

const SALE_COLUMNS =
  "id, sale_number, occurred_at, sale_date, customer_id, subtotal_centavos, discount_centavos, discount_kind, discount_percent, total_centavos, payment_method, reference_number, money_given_centavos, change_centavos, voided_at, void_reason, created_by";

export const getSales = cache(
  async (options?: { date?: CivilDate; limit?: number }): Promise<SaleRow[]> => {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("sales")
      .select(SALE_COLUMNS)
      .order("occurred_at", { ascending: false })
      .limit(options?.limit ?? 100);

    if (options?.date) query = query.eq("sale_date", civilDateToISO(options.date));

    const { data, error } = await query;
    if (error || !data) return [];

    return data.flatMap((row) => {
      const sale = toSaleRow(row as Record<string, unknown>);
      return sale ? [sale] : [];
    });
  },
);

export const getSaleById = cache(async (saleId: string): Promise<SaleRow | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("id", saleId)
    .maybeSingle();

  if (error || !data) return null;
  return toSaleRow(data as Record<string, unknown>);
});

export const getSaleLines = cache(
  async (saleId: string): Promise<SaleLineRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("sale_lines")
      .select("id, sale_id, name, division, quantity, unit_price_centavos, line_total_centavos")
      .eq("sale_id", saleId);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      saleId: row.sale_id,
      name: row.name,
      division: row.division as DivisionId,
      quantity: Number(row.quantity),
      unitPriceCentavos: Number(row.unit_price_centavos),
      lineTotalCentavos: Number(row.line_total_centavos),
    }));
  },
);

export interface VoidRequestRow {
  id: string;
  saleId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export const getVoidRequests = cache(async (): Promise<VoidRequestRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("void_requests")
    .select("id, sale_id, reason, status, requested_by, decision_note, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    saleId: row.sale_id,
    reason: row.reason,
    status: row.status as VoidRequestRow["status"],
    requestedBy: row.requested_by,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  }));
});

export interface DayClosingRow {
  id: string;
  closingDate: CivilDate;
  expectedCashCentavos: Centavos;
  countedCashCentavos: Centavos;
  differenceCentavos: Centavos;
  gcashCentavos: Centavos;
  mayaCentavos: Centavos;
  bankCentavos: Centavos;
  totalSalesCentavos: Centavos;
  note: string | null;
  /**
   * Which door the day's money came through, frozen at the moment it was
   * counted (Phase 10).
   *
   * Null for every day closed before Phase 10, and it stays null: nobody can
   * reconstruct it, and a row of zeroes beside a day that took PHP 8,000 would
   * read as a fault rather than as an absence.
   */
  breakdown: DayClosingBreakdown | null;
}

export interface DayClosingBreakdown {
  ownersPocketCentavos: Centavos;
  counterCashCentavos: Centavos;
  counterTotalCentavos: Centavos;
  apparelCashCentavos: Centavos;
  apparelTotalCentavos: Centavos;
  apparelDownPaymentCentavos: Centavos;
  apparelBalanceCentavos: Centavos;
  dabztechCashCentavos: Centavos;
  dabztechTotalCentavos: Centavos;
  dabztechDownPaymentCentavos: Centavos;
  dabztechBalanceCentavos: Centavos;
}

export const getDayClosing = cache(
  async (date?: CivilDate): Promise<DayClosingRow | null> => {
    const supabase = await createSupabaseServerClient();
    const on = date ?? manilaToday();

    const { data, error } = await supabase
      .from("day_closings")
      .select(
        "id, closing_date, expected_cash_centavos, counted_cash_centavos, difference_centavos, gcash_centavos, maya_centavos, bank_centavos, total_sales_centavos, note, owners_pocket_centavos, counter_cash_centavos, counter_total_centavos, apparel_cash_centavos, apparel_total_centavos, apparel_down_payment_centavos, apparel_balance_centavos, dabztech_cash_centavos, dabztech_total_centavos, dabztech_down_payment_centavos, dabztech_balance_centavos",
      )
      .eq("closing_date", civilDateToISO(on))
      .maybeSingle();

    if (error || !data) return null;

    const closingDate = parseISODate(data.closing_date);
    if (!closingDate) return null;

    return {
      id: data.id,
      closingDate,
      expectedCashCentavos: Number(data.expected_cash_centavos),
      countedCashCentavos: Number(data.counted_cash_centavos),
      differenceCentavos: Number(data.difference_centavos),
      gcashCentavos: Number(data.gcash_centavos),
      mayaCentavos: Number(data.maya_centavos),
      bankCentavos: Number(data.bank_centavos),
      totalSalesCentavos: Number(data.total_sales_centavos),
      note: data.note,
      breakdown: toBreakdown(data as Record<string, unknown>),
    };
  },
);

/**
 * The stored breakdown, or null when the day predates Phase 10.
 *
 * One null column is enough to make the whole breakdown absent rather than
 * partly invented: the writer fills all eleven together, so any missing one
 * means no breakdown was ever recorded.
 */
function toBreakdown(row: Record<string, unknown>): DayClosingBreakdown | null {
  const columns = [
    "owners_pocket_centavos",
    "counter_cash_centavos",
    "counter_total_centavos",
    "apparel_cash_centavos",
    "apparel_total_centavos",
    "apparel_down_payment_centavos",
    "apparel_balance_centavos",
    "dabztech_cash_centavos",
    "dabztech_total_centavos",
    "dabztech_down_payment_centavos",
    "dabztech_balance_centavos",
  ] as const;

  if (columns.some((column) => row[column] === null || row[column] === undefined)) {
    return null;
  }

  return {
    ownersPocketCentavos: Number(row.owners_pocket_centavos),
    counterCashCentavos: Number(row.counter_cash_centavos),
    counterTotalCentavos: Number(row.counter_total_centavos),
    apparelCashCentavos: Number(row.apparel_cash_centavos),
    apparelTotalCentavos: Number(row.apparel_total_centavos),
    apparelDownPaymentCentavos: Number(row.apparel_down_payment_centavos),
    apparelBalanceCentavos: Number(row.apparel_balance_centavos),
    dabztechCashCentavos: Number(row.dabztech_cash_centavos),
    dabztechTotalCentavos: Number(row.dabztech_total_centavos),
    dabztechDownPaymentCentavos: Number(row.dabztech_down_payment_centavos),
    dabztechBalanceCentavos: Number(row.dabztech_balance_centavos),
  };
}
