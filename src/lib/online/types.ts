/**
 * The shapes the online shop passes around (docs/spec.md 6).
 *
 * One file, so a screen, a Server Action and a test all mean the same thing by
 * "an order". Nothing here reaches the database - the reads live in
 * `src/lib/data/online.ts` and hand back these.
 *
 * Money is `Centavos` throughout, the same as everywhere else in this system.
 */
import type { Centavos } from "@/lib/money";
import type { CivilDate } from "@/lib/period";

// ---------------------------------------------------------------------------
// The small closed sets
// ---------------------------------------------------------------------------

/** The sizes, in the order they are always shown (docs/spec.md 7.1). */
export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
export type Size = (typeof SIZES)[number];

export type PricingMode = "fixed" | "quote";
export type ProductionPath = "full" | "dtf";
export type FulfilMethod = "pickup" | "delivery";
export type OrderSource = "website" | "manual";

export const ORDER_STATUSES = [
  "new",
  "quoted",
  "confirmed",
  "in_production",
  "ready_to_ship",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "In production",
  ready_to_ship: "Ready to ship",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * `gateway` is here because the column can hold it (docs/spec.md 2), so a
 * payment gateway can be wired in later without a migration. Nothing in
 * version 1 writes it, and the database refuses it from the payment form.
 */
export const PAYMENT_METHODS = [
  "cash",
  "gcash_manual",
  "bank_transfer",
  "gateway",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The three a person may choose. `gateway` is not one of them. */
export const RECORDABLE_PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "gcash_manual",
  "bank_transfer",
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash_manual: "GCash (manual)",
  bank_transfer: "Bank transfer",
  gateway: "Paid online",
};

export const FULFIL_LABELS: Record<FulfilMethod, string> = {
  pickup: "Pick up",
  delivery: "Delivery",
};

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  slug: string;
  productionPath: ProductionPath;
  sortOrder: number;
}

export interface PriceVariant {
  id: string;
  label: string;
  priceCentavos: Centavos;
  sortOrder: number;
}

export interface ProductOption {
  id: string;
  name: string;
  choices: string[];
  sortOrder: number;
}

export interface ProductImage {
  id: string;
  storagePath: string;
  alt: string | null;
  sortOrder: number;
}

export interface Product {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  /** The slug the category chips and the URL carry. */
  categorySlug: string | null;
  /** Which way through the workshop, taken from the category. */
  productionPath: ProductionPath;
  name: string;
  slug: string;
  description: string | null;
  pricingMode: PricingMode;
  minOrderQty: number;
  leadTimeDays: number;
  usesSizes: boolean;
  usesRoster: boolean;
  usesDesignGallery: boolean;
  sizeChartPath: string | null;
  isVisible: boolean;
  createdAt: string;
  prices: PriceVariant[];
  options: ProductOption[];
  images: ProductImage[];
  /** From `online_product_stats`. Zero when nobody has ordered it. */
  orderedPieces: number;
  orderedCount: number;
}

export interface Design {
  id: string;
  code: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  isVisible: boolean;
  createdAt: string;
  /** The products this design is offered on. */
  productIds: string[];
}

// ---------------------------------------------------------------------------
// An order
// ---------------------------------------------------------------------------

export interface RosterEntry {
  position: number;
  playerName: string | null;
  playerNumber: string | null;
  size: Size;
}

export interface OrderFile {
  id: string;
  storagePath: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  /** A snapshot: what the product was called when it was ordered. */
  productName: string;
  categoryName: string;
  productionPath: ProductionPath;
  pricingMode: PricingMode;
  variantLabel: string | null;
  /** Null for a quote item, and null is not zero. */
  unitPriceCentavos: Centavos | null;
  options: Record<string, string>;
  qty: number;
  sizes: Partial<Record<Size, number>>;
  designId: string | null;
  designCode: string | null;
  designName: string | null;
  teamColors: string | null;
  notes: string | null;
  roster: RosterEntry[];
  files: OrderFile[];
}

export interface Payment {
  id: string;
  amountCentavos: Centavos;
  method: PaymentMethod;
  paidOn: string;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ProductionRow {
  stageKey: string;
  doneAt: string;
  doneByName: string | null;
  skipped: boolean;
}

export interface StatusLogEntry {
  id: string;
  event: string;
  actorLabel: string;
  createdAt: string;
}

export interface ProductionStage {
  key: string;
  label: string;
  customerLabel: string;
  description: string;
  position: number;
  inDtfPath: boolean;
}

/** An order as the list, the board and the calendar need it. */
export interface OrderSummary {
  id: string;
  orderNo: string;
  customerName: string;
  mobile: string;
  status: OrderStatus;
  method: FulfilMethod;
  dateNeeded: CivilDate;
  source: OrderSource;
  createdAt: string;
  quoteAmountCentavos: Centavos | null;
  /** From `online_order_totals`, which adds up the order's own rows. */
  fixedTotalCentavos: Centavos;
  totalCentavos: Centavos;
  paidCentavos: Centavos;
  balanceCentavos: Centavos;
  pieces: number;
  hasQuoteItems: boolean;
  /** The first item's name, and how many more there are. */
  firstItemName: string | null;
  extraItemCount: number;
  /** Which stages are done, for the stage note. */
  doneStageKeys: string[];
  productionPath: ProductionPath;
}

/** Everything the order page shows. */
export interface OrderDetail extends OrderSummary {
  facebookName: string | null;
  address: string | null;
  notes: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
  payments: Payment[];
  production: ProductionRow[];
  history: StatusLogEntry[];
}
