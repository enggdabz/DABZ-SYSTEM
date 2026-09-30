/**
 * The store's catalogue as the storefront sees it (docs/store/progress.md).
 *
 * These are the shapes the pages work with, not the rows: `src/lib/data/store.ts`
 * turns rows into these, and everything else - sorting, pricing, badges -
 * works on these with no database in sight, so it can be tested that way.
 *
 * MONEY IS CENTAVOS. A price the owner has not given is `null`, never 0: a
 * quote-only product has no price to show, and a zero would read as free.
 */
export type PricingMode = "fixed" | "quote";

/** What a visitor may know about stock: a bucket, never a count. */
export type Availability = "in_stock" | "low" | "out";

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
}

export interface StorePhoto {
  path: string;
  alt: string | null;
}

/** "10 or more at this unit price" - the whole price, not a discount. */
export interface BulkTier {
  minQty: number;
  unitPriceCentavos: number;
}

export interface StoreVariant {
  id: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  /** Null when the variant is not stock-tracked (made to order). */
  availability: Availability | null;
}

export interface SizeChart {
  name: string;
  imagePath: string | null;
  columns: string[];
  rows: string[][];
  note: string | null;
}

export interface StoreProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  pricingMode: PricingMode;
  /** Null for a quote-only product. There is nothing to hide: it is not stored. */
  basePriceCentavos: number | null;
  minOrderQty: number;
  createdAt: string;
  photos: StorePhoto[];
  tiers: BulkTier[];
  /** Extra centavos per size, keyed by the size's name. */
  sizeSurcharges: Record<string, number>;
  variants: StoreVariant[];
  sizeChart: SizeChart | null;
}

export interface StoreBanner {
  id: string;
  imagePath: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
}
