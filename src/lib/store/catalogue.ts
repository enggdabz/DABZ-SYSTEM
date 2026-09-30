/**
 * The store's catalogue rules, with no database and no screen in sight.
 *
 * Pure on purpose: pricing, sorting and badges are the parts a customer
 * notices being wrong, and they are the parts that can be tested without
 * standing anything up.
 */
import { formatPesos, lineTotal, type Centavos } from "@/lib/money";

import type { Availability, StoreProduct, StoreVariant } from "./types";

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

export const REQUEST_QUOTE = "Request quote";

/** A quote-only product has no price to show; everything else does. */
export function isQuoteOnly(product: Pick<StoreProduct, "pricingMode">): boolean {
  return product.pricingMode === "quote";
}

/**
 * What one piece costs at this quantity and size, or null for a quote.
 *
 * The bulk tier is the WHOLE unit price at that quantity (the highest tier the
 * quantity reaches), and a size's surcharge is added on top of it - so a 2XL
 * in a bulk order still pays for being a 2XL.
 */
export function unitPriceFor(
  product: Pick<StoreProduct, "pricingMode" | "basePriceCentavos" | "tiers" | "sizeSurcharges">,
  quantity: number,
  size: string | null = null,
): Centavos | null {
  if (product.pricingMode === "quote" || product.basePriceCentavos === null) return null;

  let unit = product.basePriceCentavos;
  let reached = 0;
  for (const tier of product.tiers) {
    if (quantity >= tier.minQty && tier.minQty > reached) {
      reached = tier.minQty;
      unit = tier.unitPriceCentavos;
    }
  }

  const surcharge = size === null ? 0 : (product.sizeSurcharges[size] ?? 0);
  return unit + surcharge;
}

/** What the customer pays for `quantity` pieces of one size, or null for a quote. */
export function totalFor(
  product: Parameters<typeof unitPriceFor>[0],
  quantity: number,
  size: string | null = null,
): Centavos | null {
  const unit = unitPriceFor(product, quantity, size);
  return unit === null ? null : lineTotal(unit, quantity);
}

/** The price on a card: the figure, or "Request quote". */
export function priceLabel(product: StoreProduct): string {
  if (isQuoteOnly(product) || product.basePriceCentavos === null) return REQUEST_QUOTE;
  return formatPesos(product.basePriceCentavos);
}

/** "₱220.00 for 10+" for the cheapest tier, or null when there is none. */
export function bulkHint(product: StoreProduct): string | null {
  if (isQuoteOnly(product) || product.tiers.length === 0) return null;
  const cheapest = [...product.tiers].sort(
    (a, b) => a.unitPriceCentavos - b.unitPriceCentavos,
  )[0];
  return `${formatPesos(cheapest.unitPriceCentavos)} for ${cheapest.minQty}+`;
}

// ---------------------------------------------------------------------------
// Stock and badges
// ---------------------------------------------------------------------------

/**
 * The bucket for a whole product, from its variants.
 *
 * "Low" means everything a customer could buy is running low - one size in
 * short supply while the others are plentiful is not a low-stock product, and
 * a badge that cried wolf would be ignored on the day it was true. A variant
 * that is not tracked is made to order, so it is always available.
 */
export function productAvailability(variants: readonly StoreVariant[]): Availability {
  if (variants.length === 0) return "in_stock";
  if (variants.some((v) => v.availability === null || v.availability === "in_stock")) {
    return "in_stock";
  }
  if (variants.some((v) => v.availability === "low")) return "low";
  return "out";
}

export const NEW_BADGE_DAYS = 14;

export function isNew(createdAt: string, now: Date, days = NEW_BADGE_DAYS): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const age = now.getTime() - created;
  return age >= 0 && age < days * 24 * 60 * 60 * 1000;
}

export type BadgeKind = "new" | "low" | "out";

/**
 * The badges on a card. Sold counts and ratings arrive with orders and
 * reviews: showing "0 sold" beside every product until then would be a claim.
 */
export function badgesFor(product: StoreProduct, now: Date): BadgeKind[] {
  const badges: BadgeKind[] = [];
  const stock = productAvailability(product.variants);
  if (stock === "out") badges.push("out");
  else if (stock === "low") badges.push("low");
  if (isNew(product.createdAt, now)) badges.push("new");
  return badges;
}

export const BADGE_LABELS: Record<BadgeKind, string> = {
  new: "New",
  low: "Low stock",
  out: "Sold out",
};

// ---------------------------------------------------------------------------
// Sort and filter
// ---------------------------------------------------------------------------

/**
 * "Most ordered" and "Rating" are not here yet: they need orders and reviews,
 * and a sort that orders by a column of zeros is a control that lies.
 */
export const STORE_SORTS = ["newest", "price_low", "price_high"] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

export const STORE_SORT_LABELS: Record<StoreSort, string> = {
  newest: "Newest",
  price_low: "Price: low to high",
  price_high: "Price: high to low",
};

export function parseSort(value: string | string[] | undefined): StoreSort {
  const one = Array.isArray(value) ? value[0] : value;
  return STORE_SORTS.find((sort) => sort === one) ?? "newest";
}

/**
 * Sorts a copy. In BOTH price orders a quote-only product goes last: its price
 * is unknown, and "unknown" is not the cheapest thing in the shop any more
 * than it is the dearest.
 */
export function sortProducts(products: readonly StoreProduct[], sort: StoreSort): StoreProduct[] {
  const byNewest = (a: StoreProduct, b: StoreProduct) =>
    b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name);

  const priced = (a: StoreProduct, b: StoreProduct, direction: 1 | -1) => {
    const pa = a.basePriceCentavos;
    const pb = b.basePriceCentavos;
    if (pa === null && pb === null) return byNewest(a, b);
    if (pa === null) return 1;
    if (pb === null) return -1;
    return direction * (pa - pb) || byNewest(a, b);
  };

  const copy = [...products];
  if (sort === "price_low") return copy.sort((a, b) => priced(a, b, 1));
  if (sort === "price_high") return copy.sort((a, b) => priced(a, b, -1));
  return copy.sort(byNewest);
}

export function filterProducts(
  products: readonly StoreProduct[],
  options: { search?: string; categorySlug?: string | null },
): StoreProduct[] {
  const term = cleanSearchTerm(options.search ?? "").toLowerCase();
  return products.filter((product) => {
    if (options.categorySlug && product.categorySlug !== options.categorySlug) return false;
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) ||
      (product.categoryName ?? "").toLowerCase().includes(term) ||
      (product.description ?? "").toLowerCase().includes(term)
    );
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const MAX_SEARCH_LENGTH = 40;

/**
 * A search term made safe to put in an `ilike`: trimmed, capped, whitespace
 * collapsed, and the characters `ilike` treats as wildcards removed - a
 * visitor typing "%" should search for nothing, not for everything.
 */
export function cleanSearchTerm(input: string): string {
  return input
    .replace(/[%_\\,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

/** Names that START with the term first, then the rest, each alphabetically. */
export function rankSuggestions(names: readonly string[], term: string, limit: number): string[] {
  const needle = cleanSearchTerm(term).toLowerCase();
  if (needle.length < 2) return [];
  const unique = [...new Set(names)].filter((name) => name.toLowerCase().includes(needle));
  const starts = (name: string) => name.toLowerCase().startsWith(needle);
  return unique
    .sort((a, b) => Number(starts(b)) - Number(starts(a)) || a.localeCompare(b))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Recently viewed
// ---------------------------------------------------------------------------

export const RECENT_MAX = 12;

/** Most recent first, no repeats, capped. Returns a new list. */
export function pushRecent(ids: readonly string[], id: string, max = RECENT_MAX): string[] {
  return [id, ...ids.filter((existing) => existing !== id)].slice(0, max);
}

/** Related products: the same category, newest first, never the product itself. */
export function relatedProducts(
  products: readonly StoreProduct[],
  current: StoreProduct,
  limit = 8,
): StoreProduct[] {
  return sortProducts(
    products.filter(
      (p) => p.id !== current.id && current.categoryId !== null && p.categoryId === current.categoryId,
    ),
    "newest",
  ).slice(0, limit);
}
