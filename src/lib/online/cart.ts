/**
 * The customer's order, before it is an order (docs/spec.md 8).
 *
 * It lives in the browser's own storage until the moment they press Place
 * order. There is no account, no login and no half-finished order sitting in
 * the shop's database waiting to be cleaned up.
 *
 * TWO THINGS TO HOLD ON TO.
 *
 * EVERY PRICE IN HERE IS A PREVIEW. The line totals exist so the page can add
 * up as the customer types; what gets stored is worked out again from the
 * database by `create_online_order`, which never sees these figures. A cart
 * that has been sitting in a phone since before a price changed is therefore
 * safe: the customer is quoted the new price, not the old one.
 *
 * EVERY READ IS GUARDED. Private browsing, cleared site data and a storage
 * quota all make `localStorage` throw or come back empty, and a shop that
 * white-screens because of that is a shop with no orders. So a cart that
 * cannot be read is an empty cart, and the customer starts again rather than
 * seeing an error.
 */
import type { Centavos } from "@/lib/money";

import type { CleanRosterEntry } from "./items";
import type { PricingMode, Size } from "./types";

export const CART_STORAGE_KEY = "dabz.shop.order.v1";

/** A file the customer attached, already uploaded and checked by the server. */
export interface CartFile {
  storagePath: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface CartItem {
  /** Only ever used to tell two lines apart in this browser. */
  key: string;
  productId: string;
  productSlug: string;
  productName: string;
  categoryName: string | null;
  pricingMode: PricingMode;
  variantLabel: string | null;
  /** A PREVIEW. The server re-reads it. Null for a quote item. */
  unitPriceCentavos: Centavos | null;
  options: Record<string, string>;
  qty: number;
  sizes: Partial<Record<Size, number>>;
  roster: CleanRosterEntry[];
  designId: string | null;
  designCode: string | null;
  designName: string | null;
  designImagePath: string | null;
  teamColors: string | null;
  notes: string | null;
  file: CartFile | null;
  /** The product's own picture, for the line in the cart. */
  imagePath: string | null;
}

export type Cart = CartItem[];

/**
 * Whatever came out of storage, turned into a cart.
 *
 * Deliberately forgiving about SHAPE and strict about TYPE: a line missing a
 * product id is dropped rather than carried into a checkout that would fail,
 * and anything that is not an array at all is simply an empty cart. Nothing
 * here throws, because the caller is a page render.
 */
export function parseCart(raw: string | null): Cart {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isCartItem).slice(0, 50);
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.key === "string" &&
    typeof item.productId === "string" &&
    typeof item.productName === "string" &&
    typeof item.qty === "number" &&
    item.qty > 0
  );
}

export function serialiseCart(cart: Cart): string {
  return JSON.stringify(cart);
}

/** A key for a new line. Never leaves this browser. */
export function newCartKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cartPieces(cart: Cart): number {
  return cart.reduce((total, item) => total + item.qty, 0);
}

/** The preview totals, in the same shape the order page will use. */
export function cartPreview(cart: Cart): {
  fixedTotalCentavos: Centavos;
  hasQuoteItems: boolean;
  pieces: number;
} {
  return {
    fixedTotalCentavos: cart
      .filter((item) => item.pricingMode === "fixed")
      .reduce((total, item) => total + (item.unitPriceCentavos ?? 0) * item.qty, 0),
    hasQuoteItems: cart.some((item) => item.pricingMode === "quote"),
    pieces: cartPieces(cart),
  };
}

/** What gets sent to the server: ids and choices, never prices. */
export function cartToOrderItems(cart: Cart): {
  product_id: string;
  variant_label: string | null;
  options: Record<string, string>;
  qty: number;
  sizes: Partial<Record<Size, number>>;
  roster: { player_name: string | null; player_number: string | null; size: Size }[];
  design_id: string | null;
  team_colors: string | null;
  notes: string | null;
  files: {
    storage_path: string;
    original_name: string;
    mime_type: string | null;
    size_bytes: number | null;
  }[];
}[] {
  return cart.map((item) => ({
    product_id: item.productId,
    variant_label: item.variantLabel,
    options: item.options,
    qty: item.qty,
    sizes: item.sizes,
    roster: item.roster.map((entry) => ({
      player_name: entry.playerName,
      player_number: entry.playerNumber,
      size: entry.size,
    })),
    design_id: item.designId,
    team_colors: item.teamColors,
    notes: item.notes,
    files: item.file
      ? [
          {
            storage_path: item.file.storagePath,
            original_name: item.file.originalName,
            mime_type: item.file.mimeType,
            size_bytes: item.file.sizeBytes,
          },
        ]
      : [],
  }));
}

// ---------------------------------------------------------------------------
// The browser side
// ---------------------------------------------------------------------------

/**
 * Everything below touches `localStorage`, and every one of them swallows its
 * own failure. See the note at the top: an unreadable cart is an empty cart.
 */

export function readCart(): Cart {
  if (typeof window === "undefined") return [];
  try {
    return parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeCart(cart: Cart): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, serialiseCart(cart));
  } catch {
    // Out of quota, or storage blocked. The page still works; the cart is
    // just not remembered, which is better than an error the customer cannot
    // do anything about.
  }
  notifyCartChanged();
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // As above.
  }
  notifyCartChanged();
}

/** Fired when the cart changes, so the header's count follows it. */
export const CART_CHANGED_EVENT = "dabz:cart-changed";

function notifyCartChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}
