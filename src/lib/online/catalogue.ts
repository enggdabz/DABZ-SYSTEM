/**
 * Searching and sorting the shop (docs/spec.md 7.6, 8.1).
 *
 * The rule worth naming: A PRODUCT WITH NO PRICE IS NOT A CHEAP PRODUCT. A
 * quote product has no price at all, so in both price sorts it comes after
 * everything priced rather than sorting as zero at the top of "low to high"
 * or vanishing to the bottom of "high to low" by accident.
 */
import { formatPesos, type Centavos } from "@/lib/money";

import type { Product } from "./types";

export const SHOP_SORTS = [
  "most_ordered",
  "newest",
  "price_low",
  "price_high",
  "name",
] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_SORT_LABELS: Record<ShopSort, string> = {
  most_ordered: "Most ordered",
  newest: "Newest",
  price_low: "Price: low to high",
  price_high: "Price: high to low",
  name: "Name: A to Z",
};

export const ADMIN_SORTS = [
  "newest",
  "oldest",
  "most_ordered",
  "least_ordered",
  "name",
  "price_low",
  "price_high",
] as const;
export type AdminSort = (typeof ADMIN_SORTS)[number];

export const ADMIN_SORT_LABELS: Record<AdminSort, string> = {
  newest: "Newest upload",
  oldest: "Oldest upload",
  most_ordered: "Most ordered",
  least_ordered: "Least ordered",
  name: "Name: A to Z",
  price_low: "Price: low to high",
  price_high: "Price: high to low",
};

/** The lowest price variant, or null for a product that is priced on quote. */
export function lowestPrice(product: Product): Centavos | null {
  if (product.pricingMode !== "fixed" || product.prices.length === 0) return null;
  return product.prices.reduce(
    (lowest, variant) => Math.min(lowest, variant.priceCentavos),
    product.prices[0].priceCentavos,
  );
}

export function highestPrice(product: Product): Centavos | null {
  if (product.pricingMode !== "fixed" || product.prices.length === 0) return null;
  return product.prices.reduce(
    (highest, variant) => Math.max(highest, variant.priceCentavos),
    product.prices[0].priceCentavos,
  );
}

/**
 * The price on a product card.
 *
 * "from PHP 450.00" when the variants differ, because one figure beside a
 * product that can cost more is a promise the counter would have to break.
 */
export function priceLabel(product: Product): string {
  const low = lowestPrice(product);
  if (low === null) return "Price on quote";
  const high = highestPrice(product);
  return high !== null && high !== low ? `from ${formatPesos(low)}` : formatPesos(low);
}

/** "Min 6 pcs · ready in about 10 days" */
export function termsLabel(product: Pick<Product, "minOrderQty" | "leadTimeDays">): string {
  const min =
    product.minOrderQty > 1 ? `Min ${product.minOrderQty} pcs` : "No minimum";
  return `${min} · ready in about ${product.leadTimeDays} day${
    product.leadTimeDays === 1 ? "" : "s"
  }`;
}

/**
 * Does this product match what was typed?
 *
 * Word by word rather than as one string, so "jersey sublimation" finds the
 * full sublimation jersey. Case and surrounding spaces are ignored; a person
 * searching on a phone with one thumb should not have to be tidy.
 */
export function matchesSearch(product: Product, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = [product.name, product.categoryName ?? "", product.description ?? ""]
    .join(" ")
    .toLowerCase();

  return words.every((word) => haystack.includes(word));
}

/**
 * Sorting, with the price rule above baked in.
 *
 * `compare` never returns 0 for two different products: every comparison falls
 * through to newest-first and then to the name, so a list does not shuffle
 * itself between two renders of the same data.
 */
function byNewest(a: Product, b: Product): number {
  return (
    b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)
  );
}

function byPrice(a: Product, b: Product, direction: 1 | -1): number {
  const priceA = lowestPrice(a);
  const priceB = lowestPrice(b);

  // Unpriced always last, whichever way the priced ones are going.
  if (priceA === null && priceB === null) return byNewest(a, b);
  if (priceA === null) return 1;
  if (priceB === null) return -1;

  return (priceA - priceB) * direction || byNewest(a, b);
}

export function sortForShop(products: readonly Product[], sort: ShopSort): Product[] {
  const sorted = [...products];

  switch (sort) {
    case "most_ordered":
      // Ties broken by newest, so a shop with no orders yet still reads as a
      // list of new arrivals rather than as a random order.
      return sorted.sort(
        (a, b) => b.orderedPieces - a.orderedPieces || byNewest(a, b),
      );
    case "newest":
      return sorted.sort(byNewest);
    case "price_low":
      return sorted.sort((a, b) => byPrice(a, b, 1));
    case "price_high":
      return sorted.sort((a, b) => byPrice(a, b, -1));
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name) || byNewest(a, b));
  }
}

export function sortForAdmin(products: readonly Product[], sort: AdminSort): Product[] {
  const sorted = [...products];

  switch (sort) {
    case "newest":
      return sorted.sort(byNewest);
    case "oldest":
      return sorted.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name),
      );
    case "most_ordered":
      return sorted.sort(
        (a, b) => b.orderedPieces - a.orderedPieces || byNewest(a, b),
      );
    case "least_ordered":
      return sorted.sort(
        (a, b) => a.orderedPieces - b.orderedPieces || byNewest(a, b),
      );
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name) || byNewest(a, b));
    case "price_low":
      return sorted.sort((a, b) => byPrice(a, b, 1));
    case "price_high":
      return sorted.sort((a, b) => byPrice(a, b, -1));
  }
}

export function parseShopSort(value: string | null | undefined): ShopSort {
  return (SHOP_SORTS as readonly string[]).includes(value ?? "")
    ? (value as ShopSort)
    : "most_ordered";
}

export function parseAdminSort(value: string | null | undefined): AdminSort {
  return (ADMIN_SORTS as readonly string[]).includes(value ?? "")
    ? (value as AdminSort)
    : "newest";
}

/** Search and category together, in the order the screen applies them. */
export function filterProducts(
  products: readonly Product[],
  { search, categorySlug }: { search: string; categorySlug: string | null },
): Product[] {
  return products.filter((product) => {
    // Matched on the slug the chips carry, which is what the URL holds. A
    // product with no category matches no chip, only "All".
    if (categorySlug !== null && product.categorySlug !== categorySlug) return false;
    return matchesSearch(product, search);
  });
}

/** "27 pcs · 2 orders", or the honest empty state. */
export function orderedLabel(product: Pick<Product, "orderedPieces" | "orderedCount">): string {
  if (product.orderedPieces === 0) return "None yet";
  return `${product.orderedPieces} pcs · ${product.orderedCount} order${
    product.orderedCount === 1 ? "" : "s"
  }`;
}
