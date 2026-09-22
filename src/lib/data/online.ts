import "server-only";

/**
 * Reading the online shop (docs/spec.md).
 *
 * WHICH CLIENT, AND WHY IT MATTERS
 *
 * The catalogue is read with the ORDINARY client - the one that carries
 * whoever is signed in, or nobody. That works for a visitor because the
 * catalogue tables have real `anon` policies: a stranger may select a product
 * that is visible and not deleted, and nothing else. So the shop window needs
 * no special powers, and hiding a product takes it off the shop the moment the
 * switch is flipped, without a single query remembering to filter.
 *
 * The orders are read with the same ordinary client, so a staff member sees
 * them only if their apparel permission says so. The one exception is
 * `trackOrder` at the bottom, which is a customer who is nobody asking about
 * their own order - and it is written to hand back only what that customer
 * already knows.
 *
 * NOTHING HERE IS A TOTAL FROM A COLUMN. `online_order_totals` adds an order
 * up from its own rows every time it is asked.
 */
import { cache } from "react";

import { parseISODate, type CivilDate } from "@/lib/period";
import { getPublicSettings } from "@/lib/data/public";
import {
  DEFAULT_SETTINGS,
  settingsFromRow,
  type AppSettings,
  type SettingsRow,
} from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Category,
  Design,
  FulfilMethod,
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderSummary,
  PaymentMethod,
  PricingMode,
  Product,
  ProductionPath,
  ProductionStage,
  Size,
} from "@/lib/online/types";
import { orderPath } from "@/lib/online/production";

/**
 * The client, or null when Supabase is not configured yet.
 *
 * Every read below returns an empty list rather than throwing, so a screen
 * opened before the project is wired up says "nothing here yet" instead of
 * showing a stack trace to whoever opened it.
 */
async function client() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

function toCivilDate(value: string | null): CivilDate | null {
  return value === null ? null : parseISODate(value);
}

/**
 * The shop's settings, for a visitor who is nobody.
 *
 * `getSettings()` in the DAL reads through the signed-in client, which hands a
 * stranger nothing at all - so the shop needs its own reader, the same way the
 * Phase 9 public page does. It comes back TYPED rather than as a raw row so
 * the pages read `settings.messengerUsername`, which is what the guard in
 * `src/lib/data/checklist.test.ts` looks for: a field printed on a page the
 * customer sees has to be one the To fill in screen knows about.
 */
export const getShopSettings = cache(async (): Promise<AppSettings> => {
  const row = await getPublicSettings();
  return row ? settingsFromRow(row as SettingsRow) : DEFAULT_SETTINGS;
});

/**
 * Is the shop taking orders?
 *
 * Every page a customer could order FROM asks this, and so does every Server
 * Action that could take one - because a Server Action is a public endpoint
 * and a hidden page is not a rule. The two that deliberately do NOT ask are
 * the track page and a receipt link: somebody who already ordered is owed
 * their order however long the shop stays shut.
 */
export async function isShopOpen(): Promise<boolean> {
  const settings = await getShopSettings();
  return settings.onlineShopEnabled;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const getOnlineCategories = cache(async (): Promise<Category[]> => {
  const supabase = await client();
  if (!supabase) return [];

  const { data } = await supabase
    .from("online_categories")
    .select("id, name, slug, production_path, sort_order")
    .order("sort_order")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    productionPath: row.production_path as ProductionPath,
    sortOrder: Number(row.sort_order ?? 0),
  }));
});

export const getProductionStages = cache(async (): Promise<ProductionStage[]> => {
  const supabase = await client();
  if (!supabase) return [];

  const { data } = await supabase
    .from("online_production_stages")
    .select("key, label, customer_label, description, position, in_dtf_path")
    .order("position");

  return (data ?? []).map((row) => ({
    key: row.key as string,
    label: row.label as string,
    customerLabel: row.customer_label as string,
    description: row.description as string,
    position: Number(row.position),
    inDtfPath: Boolean(row.in_dtf_path),
  }));
});

/**
 * Every product, with its prices, options, pictures and how often it has been
 * ordered.
 *
 * Five reads rather than one per product: a shop of forty products would
 * otherwise be a hundred and sixty round trips, and this runs on every visit
 * to the catalogue.
 *
 * `includeHidden` is for the admin list only. On the shop it stays false, and
 * even then the policy would refuse a hidden row to a visitor - the flag saves
 * a query from asking for something it may not have.
 */
export const getOnlineProducts = cache(
  async (includeHidden = false): Promise<Product[]> => {
    const supabase = await client();
    if (!supabase) return [];

    const productQuery = supabase
      .from("online_products")
      .select(
        "id, category_id, name, slug, description, pricing_mode, min_order_qty, lead_time_days, uses_sizes, uses_roster, uses_design_gallery, size_chart_path, is_visible, created_at",
      )
      .is("deleted_at", null);

    const [products, categories, prices, options, images, stats] = await Promise.all([
      includeHidden ? productQuery : productQuery.eq("is_visible", true),
      getOnlineCategories(),
      supabase
        .from("online_product_prices")
        .select("id, product_id, label, price_centavos, sort_order")
        .order("sort_order"),
      supabase
        .from("online_product_options")
        .select("id, product_id, name, choices, sort_order")
        .order("sort_order"),
      supabase
        .from("online_product_images")
        .select("id, product_id, storage_path, alt, sort_order")
        .order("sort_order"),
      supabase.from("online_product_stats").select("product_id, pieces, order_count"),
    ]);

    const byCategory = new Map(categories.map((category) => [category.id, category]));
    const statsById = new Map(
      (stats.data ?? []).map((row) => [
        row.product_id as string,
        { pieces: Number(row.pieces ?? 0), orders: Number(row.order_count ?? 0) },
      ]),
    );

    return (products.data ?? []).map((row) => {
      const category = row.category_id ? byCategory.get(row.category_id as string) : undefined;
      const stat = statsById.get(row.id as string);

      return {
        id: row.id as string,
        categoryId: (row.category_id as string | null) ?? null,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        // Which way through the workshop comes from the CATEGORY, so adding a
        // division later is data rather than a branch in the code.
        productionPath: category?.productionPath ?? "full",
        name: row.name as string,
        slug: row.slug as string,
        description: (row.description as string | null) ?? null,
        pricingMode: row.pricing_mode as PricingMode,
        minOrderQty: Number(row.min_order_qty ?? 1),
        leadTimeDays: Number(row.lead_time_days ?? 7),
        usesSizes: Boolean(row.uses_sizes),
        usesRoster: Boolean(row.uses_roster),
        usesDesignGallery: Boolean(row.uses_design_gallery),
        sizeChartPath: (row.size_chart_path as string | null) ?? null,
        isVisible: Boolean(row.is_visible),
        createdAt: row.created_at as string,
        prices: (prices.data ?? [])
          .filter((price) => price.product_id === row.id)
          .map((price) => ({
            id: price.id as string,
            label: price.label as string,
            priceCentavos: Number(price.price_centavos),
            sortOrder: Number(price.sort_order ?? 0),
          })),
        options: (options.data ?? [])
          .filter((option) => option.product_id === row.id)
          .map((option) => ({
            id: option.id as string,
            name: option.name as string,
            choices: (option.choices as string[]) ?? [],
            sortOrder: Number(option.sort_order ?? 0),
          })),
        images: (images.data ?? [])
          .filter((image) => image.product_id === row.id)
          .map((image) => ({
            id: image.id as string,
            storagePath: image.storage_path as string,
            alt: (image.alt as string | null) ?? null,
            sortOrder: Number(image.sort_order ?? 0),
          })),
        orderedPieces: stat?.pieces ?? 0,
        orderedCount: stat?.orders ?? 0,
      };
    });
  },
);

export async function getOnlineProductBySlug(
  slug: string,
  includeHidden = false,
): Promise<Product | null> {
  const products = await getOnlineProducts(includeHidden);
  return products.find((product) => product.slug === slug) ?? null;
}

export const getOnlineDesigns = cache(
  async (includeHidden = false): Promise<Design[]> => {
    const supabase = await client();
    if (!supabase) return [];

    const query = supabase
      .from("online_designs")
      .select("id, code, name, description, image_path, is_visible, created_at")
      .is("deleted_at", null)
      .order("code");

    const [designs, links] = await Promise.all([
      includeHidden ? query : query.eq("is_visible", true),
      supabase.from("online_design_products").select("design_id, product_id"),
    ]);

    return (designs.data ?? []).map((row) => ({
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      imagePath: (row.image_path as string | null) ?? null,
      isVisible: Boolean(row.is_visible),
      createdAt: row.created_at as string,
      productIds: (links.data ?? [])
        .filter((link) => link.design_id === row.id)
        .map((link) => link.product_id as string),
    }));
  },
);

/** The designs offered on one product page: linked, visible, and allowed. */
export async function getDesignsForProduct(product: Product): Promise<Design[]> {
  if (!product.usesDesignGallery) return [];
  const designs = await getOnlineDesigns();
  return designs.filter((design) => design.productIds.includes(product.id));
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const ORDER_COLUMNS =
  "id, order_no, customer_name, mobile, facebook_name, method, address, date_needed, notes, status, quote_amount_centavos, source, cancel_reason, completed_at, cancelled_at, created_at";

interface TotalsRow {
  order_id: string;
  fixed_total_centavos: number | string;
  quote_amount_centavos: number | string | null;
  has_quote_items: boolean;
  total_centavos: number | string;
  paid_centavos: number | string;
  balance_centavos: number | string;
  pieces: number | string;
}

/**
 * Every order, newest work first.
 *
 * Four reads whatever the size of the list: the orders, their totals, enough
 * of their items to name the first one, and which steps are done. The
 * alternative - a query per order - is what makes a list screen feel dead on
 * the counter's connection.
 */
export const getOnlineOrders = cache(async (): Promise<OrderSummary[]> => {
  const supabase = await client();
  if (!supabase) return [];

  const { data: orders } = await supabase
    .from("online_orders")
    .select(ORDER_COLUMNS)
    .order("date_needed")
    .order("created_at", { ascending: false });

  if (!orders || orders.length === 0) return [];

  const ids = orders.map((order) => order.id as string);

  const [totals, items, production] = await Promise.all([
    supabase.from("online_order_totals").select("*").in("order_id", ids),
    supabase
      .from("online_order_items")
      .select("order_id, product_name, production_path, position")
      .in("order_id", ids)
      .order("position"),
    supabase
      .from("online_order_production")
      .select("order_id, stage_key")
      .in("order_id", ids),
  ]);

  const totalsById = new Map(
    ((totals.data ?? []) as TotalsRow[]).map((row) => [row.order_id, row]),
  );

  return orders.map((row) => {
    const orderItems = (items.data ?? []).filter((item) => item.order_id === row.id);
    const totalsRow = totalsById.get(row.id as string);

    return {
      id: row.id as string,
      orderNo: row.order_no as string,
      customerName: row.customer_name as string,
      mobile: row.mobile as string,
      status: row.status as OrderStatus,
      method: row.method as FulfilMethod,
      dateNeeded: toCivilDate(row.date_needed as string) ?? { year: 1970, month: 1, day: 1 },
      source: row.source as OrderSummary["source"],
      createdAt: row.created_at as string,
      quoteAmountCentavos:
        row.quote_amount_centavos === null ? null : Number(row.quote_amount_centavos),
      fixedTotalCentavos: Number(totalsRow?.fixed_total_centavos ?? 0),
      totalCentavos: Number(totalsRow?.total_centavos ?? 0),
      paidCentavos: Number(totalsRow?.paid_centavos ?? 0),
      balanceCentavos: Number(totalsRow?.balance_centavos ?? 0),
      pieces: Number(totalsRow?.pieces ?? 0),
      hasQuoteItems: Boolean(totalsRow?.has_quote_items),
      firstItemName: (orderItems[0]?.product_name as string | undefined) ?? null,
      extraItemCount: Math.max(0, orderItems.length - 1),
      doneStageKeys: (production.data ?? [])
        .filter((step) => step.order_id === row.id)
        .map((step) => step.stage_key as string),
      productionPath: orderPath(
        orderItems.map((item) => ({
          productionPath: item.production_path as ProductionPath,
        })),
      ),
    };
  });
});

export async function getOnlineOrder(orderNo: string): Promise<OrderDetail | null> {
  const supabase = await client();
  if (!supabase) return null;

  const { data: row } = await supabase
    .from("online_orders")
    .select(ORDER_COLUMNS)
    .eq("order_no", orderNo)
    .maybeSingle();

  if (!row) return null;
  const id = row.id as string;

  const [totals, items, payments, production, history] = await Promise.all([
    supabase.from("online_order_totals").select("*").eq("order_id", id).maybeSingle(),
    supabase
      .from("online_order_items")
      .select("*")
      .eq("order_id", id)
      .order("position"),
    supabase
      .from("online_payments")
      .select("id, amount_centavos, method, paid_on, note, voided_at, void_reason")
      .eq("order_id", id)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("online_order_production")
      .select("stage_key, done_at, done_by_name, skipped")
      .eq("order_id", id),
    supabase
      .from("online_status_log")
      .select("id, event, actor_label, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const itemIds = (items.data ?? []).map((item) => item.id as string);

  const [roster, files] = await Promise.all([
    itemIds.length === 0
      ? { data: [] }
      : supabase
          .from("online_order_roster")
          .select("order_item_id, position, player_name, player_number, size")
          .in("order_item_id", itemIds)
          .order("position"),
    itemIds.length === 0
      ? { data: [] }
      : supabase
          .from("online_order_files")
          .select("id, order_item_id, storage_path, original_name, mime_type, size_bytes")
          .in("order_item_id", itemIds),
  ]);

  const totalsRow = (totals.data ?? null) as TotalsRow | null;

  const orderItems: OrderItem[] = (items.data ?? []).map((item) => ({
    id: item.id as string,
    productId: (item.product_id as string | null) ?? null,
    productName: item.product_name as string,
    categoryName: item.category_name as string,
    productionPath: item.production_path as ProductionPath,
    pricingMode: item.pricing_mode as PricingMode,
    variantLabel: (item.variant_label as string | null) ?? null,
    unitPriceCentavos:
      item.unit_price_centavos === null ? null : Number(item.unit_price_centavos),
    options: (item.options as Record<string, string>) ?? {},
    qty: Number(item.qty),
    sizes: (item.sizes as Partial<Record<Size, number>>) ?? {},
    designId: (item.design_id as string | null) ?? null,
    designCode: (item.design_code as string | null) ?? null,
    designName: (item.design_name as string | null) ?? null,
    teamColors: (item.team_colors as string | null) ?? null,
    notes: (item.notes as string | null) ?? null,
    roster: (roster.data ?? [])
      .filter((entry) => entry.order_item_id === item.id)
      .map((entry) => ({
        position: Number(entry.position),
        playerName: (entry.player_name as string | null) ?? null,
        playerNumber: (entry.player_number as string | null) ?? null,
        size: entry.size as Size,
      })),
    files: (files.data ?? [])
      .filter((file) => file.order_item_id === item.id)
      .map((file) => ({
        id: file.id as string,
        storagePath: file.storage_path as string,
        originalName: file.original_name as string,
        mimeType: (file.mime_type as string | null) ?? null,
        sizeBytes: file.size_bytes === null ? null : Number(file.size_bytes),
      })),
  }));

  return {
    id,
    orderNo: row.order_no as string,
    customerName: row.customer_name as string,
    mobile: row.mobile as string,
    facebookName: (row.facebook_name as string | null) ?? null,
    method: row.method as FulfilMethod,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    status: row.status as OrderStatus,
    dateNeeded: toCivilDate(row.date_needed as string) ?? { year: 1970, month: 1, day: 1 },
    source: row.source as OrderSummary["source"],
    createdAt: row.created_at as string,
    quoteAmountCentavos:
      row.quote_amount_centavos === null ? null : Number(row.quote_amount_centavos),
    fixedTotalCentavos: Number(totalsRow?.fixed_total_centavos ?? 0),
    totalCentavos: Number(totalsRow?.total_centavos ?? 0),
    paidCentavos: Number(totalsRow?.paid_centavos ?? 0),
    balanceCentavos: Number(totalsRow?.balance_centavos ?? 0),
    pieces: Number(totalsRow?.pieces ?? 0),
    hasQuoteItems: Boolean(totalsRow?.has_quote_items),
    firstItemName: orderItems[0]?.productName ?? null,
    extraItemCount: Math.max(0, orderItems.length - 1),
    doneStageKeys: (production.data ?? []).map((step) => step.stage_key as string),
    productionPath: orderPath(orderItems),
    items: orderItems,
    payments: (payments.data ?? []).map((payment) => ({
      id: payment.id as string,
      amountCentavos: Number(payment.amount_centavos),
      method: payment.method as PaymentMethod,
      paidOn: payment.paid_on as string,
      note: (payment.note as string | null) ?? null,
      voidedAt: (payment.voided_at as string | null) ?? null,
      voidReason: (payment.void_reason as string | null) ?? null,
    })),
    production: (production.data ?? []).map((step) => ({
      stageKey: step.stage_key as string,
      doneAt: step.done_at as string,
      doneByName: (step.done_by_name as string | null) ?? null,
      skipped: Boolean(step.skipped),
    })),
    history: (history.data ?? []).map((entry) => ({
      id: entry.id as string,
      event: entry.event as string,
      actorLabel: entry.actor_label as string,
      createdAt: entry.created_at as string,
    })),
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportData {
  orders: {
    id: string;
    status: OrderStatus;
    createdAt: string;
    totalCentavos: number;
    pieces: number;
    quoteAmountCentavos: number | null;
    items: {
      productName: string;
      pricingMode: PricingMode;
      unitPriceCentavos: number | null;
      qty: number;
    }[];
  }[];
  payments: { paidOn: string; amountCentavos: number; voidedAt: string | null }[];
}

/**
 * Everything the reports add up.
 *
 * Read whole rather than summed in SQL, because every figure on that screen
 * is built from the SAME two lists by the pure functions in
 * `src/lib/online/reports.ts` - which is what stops a tile and the chart under
 * it disagreeing. A shop of a few thousand orders is a small read; if it ever
 * stops being one, the answer is a view, not a second way of counting.
 */
export const getReportData = cache(async (): Promise<ReportData> => {
  const supabase = await client();
  if (!supabase) return { orders: [], payments: [] };

  const [orders, totals, items, payments] = await Promise.all([
    supabase
      .from("online_orders")
      .select("id, status, created_at, quote_amount_centavos"),
    supabase.from("online_order_totals").select("order_id, total_centavos, pieces"),
    supabase
      .from("online_order_items")
      .select("order_id, product_name, pricing_mode, unit_price_centavos, qty"),
    supabase.from("online_payments").select("paid_on, amount_centavos, voided_at"),
  ]);

  const totalsById = new Map(
    (totals.data ?? []).map((row) => [
      row.order_id as string,
      { total: Number(row.total_centavos ?? 0), pieces: Number(row.pieces ?? 0) },
    ]),
  );

  return {
    orders: (orders.data ?? []).map((row) => {
      const totalsRow = totalsById.get(row.id as string);
      return {
        id: row.id as string,
        status: row.status as OrderStatus,
        createdAt: row.created_at as string,
        totalCentavos: totalsRow?.total ?? 0,
        pieces: totalsRow?.pieces ?? 0,
        quoteAmountCentavos:
          row.quote_amount_centavos === null ? null : Number(row.quote_amount_centavos),
        items: (items.data ?? [])
          .filter((item) => item.order_id === row.id)
          .map((item) => ({
            productName: item.product_name as string,
            pricingMode: item.pricing_mode as PricingMode,
            unitPriceCentavos:
              item.unit_price_centavos === null ? null : Number(item.unit_price_centavos),
            qty: Number(item.qty),
          })),
      };
    }),
    payments: (payments.data ?? []).map((row) => ({
      paidOn: row.paid_on as string,
      amountCentavos: Number(row.amount_centavos),
      voidedAt: (row.voided_at as string | null) ?? null,
    })),
  };
});
