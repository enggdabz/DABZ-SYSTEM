import { badgesFor, bulkHint, priceLabel, type BadgeKind } from "./catalogue";
import type { StoreProduct } from "./types";

/**
 * What a product card needs, already worked out.
 *
 * The strip of recently viewed products is drawn in the browser from JSON the
 * server sends, and the browser has no Supabase address to build a picture's
 * URL from - so the server does that, and the card is the same plain object
 * whether it is drawn on the server or the client.
 */
export interface StoreCard {
  id: string;
  slug: string;
  name: string;
  categoryName: string | null;
  price: string;
  isQuote: boolean;
  bulk: string | null;
  badges: BadgeKind[];
  imageUrl: string | null;
  imageAlt: string;
}

export function toCard(
  product: StoreProduct,
  now: Date,
  imageUrl: (path: string | null) => string | null,
): StoreCard {
  const photo = product.photos[0] ?? null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    categoryName: product.categoryName,
    price: priceLabel(product),
    isQuote: product.pricingMode === "quote",
    bulk: bulkHint(product),
    badges: badgesFor(product, now),
    imageUrl: imageUrl(photo?.path ?? null),
    imageAlt: photo?.alt || product.name,
  };
}
