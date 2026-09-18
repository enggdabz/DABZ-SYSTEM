/**
 * Dabz Apparel job orders (spec 8, open decision 17.10).
 *
 * "Your Jersey Market!" - so the shape of this file follows what a jersey
 * order actually is: a team orders one design, and every player needs their
 * own name, number and size. The sizes are where the money moves, because
 * anything above XL costs more to make.
 *
 * TWO RULES THAT MATTER MOST HERE
 *
 * 1. An order's total is added up from its own rows, never stored. A stored
 *    total and a list of names can disagree, and a customer holding a job
 *    order sheet will believe whichever is larger.
 *
 * 2. The balance is what is owed, and it is total less payments - so a payment
 *    is never "the balance" and the balance is never typed in. An order can be
 *    released with money still owed; the system says so rather than refusing,
 *    because a shop does let a regular customer take the jerseys.
 */
import { sumCentavos, type Centavos } from "./money";

// ---------------------------------------------------------------------------
// Sizes (spec 8, open decision 17.10)
// ---------------------------------------------------------------------------

/**
 * The standard jersey size ladder. The surcharge for the big sizes is a figure
 * only the owner can know, so every one of these starts with NO extra.
 */
export const APPAREL_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
] as const;
export type ApparelSize = (typeof APPAREL_SIZES)[number];

export interface SizePrice {
  size: ApparelSize;
  /** Extra on top of the item price. Null means the owner has not said. */
  extraCentavos: Centavos | null;
}

/** What a size adds, or null while nobody has said. Never assumed to be zero. */
export function sizeExtra(
  sizes: readonly SizePrice[],
  size: ApparelSize,
): Centavos | null {
  const found = sizes.find((entry) => entry.size === size);
  return found ? found.extraCentavos : null;
}

// ---------------------------------------------------------------------------
// Order status (spec 8)
// ---------------------------------------------------------------------------

/**
 * Where an order has got to.
 *
 * `layout_approved` is its own step on purpose: a sublimation order stalls
 * there more than anywhere else, waiting on the customer to say yes to the
 * design, and "in production" would hide that.
 */
export const ORDER_STATUSES = [
  "quoted",
  "confirmed",
  "layout_approved",
  "in_production",
  "ready",
  "released",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  quoted: "Quoted",
  confirmed: "Confirmed, down payment in",
  layout_approved: "Layout approved",
  in_production: "In production",
  ready: "Ready for pickup",
  released: "Released",
  cancelled: "Cancelled",
};

/** The steps an order moves through, in order. Cancelled is not one of them. */
export const ORDER_FLOW: OrderStatus[] = [
  "quoted",
  "confirmed",
  "layout_approved",
  "in_production",
  "ready",
  "released",
];

export function isOpenOrder(status: OrderStatus): boolean {
  return status !== "released" && status !== "cancelled";
}

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

export interface RosterEntry {
  id: string;
  lineId: string;
  playerName: string | null;
  playerNumber: string | null;
  size: ApparelSize;
  /**
   * The size surcharge as it was when the entry was added - copied, not looked
   * up. Raising the 2XL surcharge next month must not rewrite what a customer
   * was already quoted.
   */
  sizeExtraCentavos: Centavos;
}

export interface OrderLine {
  id: string;
  orderId: string;
  /** Copied from the price list, so renaming an item never rewrites an order. */
  name: string;
  fabric: string | null;
  collar: string | null;
  unitPriceCentavos: Centavos;
  /** Used only when the line has no roster - plain shirts, no names. */
  quantity: number;
  incomeCategory: string;
}

export interface LineTotal {
  line: OrderLine;
  roster: RosterEntry[];
  /** Roster entries if there are any, otherwise the typed quantity. */
  quantity: number;
  /** quantity x unit price. */
  baseCentavos: Centavos;
  /** What the big sizes add. */
  sizeExtrasCentavos: Centavos;
  totalCentavos: Centavos;
}

/**
 * One line's total.
 *
 * When the line has a roster, the roster IS the quantity - fifteen names means
 * fifteen jerseys. A typed quantity beside fifteen names is two answers to the
 * same question, and the names are the one the customer checked.
 */
export function lineTotal(
  line: OrderLine,
  roster: readonly RosterEntry[],
): LineTotal {
  const own = roster.filter((entry) => entry.lineId === line.id);
  const quantity = own.length > 0 ? own.length : line.quantity;

  const baseCentavos = line.unitPriceCentavos * quantity;
  const sizeExtrasCentavos = sumCentavos(
    own.map((entry) => entry.sizeExtraCentavos),
  );

  return {
    line,
    roster: own,
    quantity,
    baseCentavos,
    sizeExtrasCentavos,
    totalCentavos: baseCentavos + sizeExtrasCentavos,
  };
}

export interface OrderPayment {
  id: string;
  orderId: string;
  amountCentavos: Centavos;
  paidOn: string;
  source: string;
  kind: "down_payment" | "balance";
  note: string | null;
}

export interface OrderTotals {
  lines: LineTotal[];
  itemCount: number;
  totalCentavos: Centavos;
  paidCentavos: Centavos;
  /** Total less what has been paid. Never below zero. */
  balanceCentavos: Centavos;
  /** True when more was paid than the order comes to. */
  overpaid: boolean;
  overpaidByCentavos: Centavos;
  fullyPaid: boolean;
}

export function orderTotals(options: {
  lines: readonly OrderLine[];
  roster: readonly RosterEntry[];
  payments: readonly OrderPayment[];
}): OrderTotals {
  const lines = options.lines.map((line) => lineTotal(line, options.roster));

  const totalCentavos = sumCentavos(lines.map((entry) => entry.totalCentavos));
  const paidCentavos = sumCentavos(
    options.payments.map((payment) => payment.amountCentavos),
  );

  const difference = totalCentavos - paidCentavos;

  return {
    lines,
    itemCount: lines.reduce((count, entry) => count + entry.quantity, 0),
    totalCentavos,
    paidCentavos,
    balanceCentavos: Math.max(0, difference),
    overpaid: difference < 0,
    overpaidByCentavos: Math.max(0, -difference),
    fullyPaid: difference <= 0 && totalCentavos > 0,
  };
}

// ---------------------------------------------------------------------------
// Down payment (open decision 17.10)
// ---------------------------------------------------------------------------

export interface DownPaymentAdvice {
  /** What the policy asks for, or null while no policy is set. */
  expectedCentavos: Centavos | null;
  /** True when the policy exists and has not been met. */
  short: boolean;
  shortByCentavos: Centavos;
  /** True when nobody has set a policy - shown, never guessed. */
  policyMissing: boolean;
}

/**
 * How much down payment the shop's own policy asks for.
 *
 * The percentage is a figure only the owner can know (17.10 suggests 50% as an
 * example, which is not the same as the owner saying so). While it is unset,
 * this says so and asks for nothing - a made-up policy would have staff
 * turning away a customer who paid what the owner actually wanted.
 */
export function downPaymentAdvice(options: {
  totalCentavos: Centavos;
  paidCentavos: Centavos;
  percent: number | null;
}): DownPaymentAdvice {
  if (options.percent === null) {
    return {
      expectedCentavos: null,
      short: false,
      shortByCentavos: 0,
      policyMissing: true,
    };
  }

  // Rounded UP, so a 50% policy on an odd total asks for the larger half
  // rather than leaving the shop a centavo short of its own rule.
  const expectedCentavos = Math.ceil(
    (options.totalCentavos * options.percent) / 100,
  );
  const shortByCentavos = Math.max(0, expectedCentavos - options.paidCentavos);

  return {
    expectedCentavos,
    short: shortByCentavos > 0,
    shortByCentavos,
    policyMissing: false,
  };
}

// ---------------------------------------------------------------------------
// Where the money lands (spec 10.1)
// ---------------------------------------------------------------------------

/**
 * A payment split across the income categories in the order.
 *
 * An order can hold jerseys and jackets at once, and the books are kept per
 * category, so a part payment has to be shared out. Each category carries the
 * same proportion of the payment as it does of the order.
 *
 * The last category absorbs the rounding, so the parts always add back up to
 * the payment exactly - the same rule as splitting a discount across divisions
 * in src/lib/pos.ts. Without it a one-centavo hole appears in the day's books.
 */
export function splitPaymentByCategory(options: {
  lines: readonly LineTotal[];
  amountCentavos: Centavos;
}): { category: string; amountCentavos: Centavos }[] {
  const byCategory = new Map<string, Centavos>();

  for (const entry of options.lines) {
    if (entry.totalCentavos <= 0) continue;
    byCategory.set(
      entry.line.incomeCategory,
      (byCategory.get(entry.line.incomeCategory) ?? 0) + entry.totalCentavos,
    );
  }

  const categories = [...byCategory.entries()];

  // Nothing priced yet: the money is real, so it still has to land somewhere.
  if (categories.length === 0) {
    return options.amountCentavos > 0
      ? [{ category: "sublimation_jerseys", amountCentavos: options.amountCentavos }]
      : [];
  }

  const orderTotal = sumCentavos(categories.map(([, total]) => total));
  let remaining = options.amountCentavos;

  return categories.map(([category, total], index) => {
    const isLast = index === categories.length - 1;
    const amountCentavos = isLast
      ? remaining
      : Math.round((total * options.amountCentavos) / orderTotal);
    remaining -= amountCentavos;
    return { category, amountCentavos };
  });
}

// ---------------------------------------------------------------------------
// Order numbers (spec 8)
// ---------------------------------------------------------------------------

/** "A-260918-003" - A for Apparel, then the date, then the count for the day. */
export function formatOrderNumber(options: {
  year: number;
  month: number;
  day: number;
  sequence: number;
}): string {
  const { year, month, day, sequence } = options;
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `A-${yy}${mm}${dd}-${String(sequence).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// What needs looking at
// ---------------------------------------------------------------------------

export interface OrderWarning {
  kind:
    | "overdue"
    | "due_soon"
    | "no_promised_date"
    | "released_with_balance"
    | "unpriced_line";
  label: string;
}

/** How many days ahead counts as "due soon", matching the bill reminder. */
export const PROMISE_REMINDER_DAYS = 3;

/**
 * Everything about this order the owner should see at a glance.
 *
 * A released order with a balance stays on the list on purpose: the jerseys
 * have gone, so the only thing left to chase is the money, and an order that
 * disappears is an order nobody chases.
 */
export function orderWarnings(options: {
  status: OrderStatus;
  promisedOn: string | null;
  today: string;
  totals: Pick<OrderTotals, "balanceCentavos" | "lines">;
}): OrderWarning[] {
  const warnings: OrderWarning[] = [];

  if (options.status === "released" && options.totals.balanceCentavos > 0) {
    warnings.push({
      kind: "released_with_balance",
      label: "Released with money still owed",
    });
  }

  const unpriced = options.totals.lines.filter(
    (entry) => entry.line.unitPriceCentavos <= 0,
  );
  if (unpriced.length > 0) {
    warnings.push({
      kind: "unpriced_line",
      label: `${unpriced.length} item${unpriced.length === 1 ? "" : "s"} with no price`,
    });
  }

  if (!isOpenOrder(options.status)) return warnings;

  if (options.promisedOn === null) {
    warnings.push({ kind: "no_promised_date", label: "No promised date set" });
    return warnings;
  }

  const days = daysBetweenISO(options.today, options.promisedOn);

  if (days < 0) {
    const late = Math.abs(days);
    warnings.push({
      kind: "overdue",
      label: `${late} day${late === 1 ? "" : "s"} past the promised date`,
    });
  } else if (days <= PROMISE_REMINDER_DAYS) {
    warnings.push({
      kind: "due_soon",
      label: days === 0 ? "Promised today" : `Promised in ${days} days`,
    });
  }

  return warnings;
}

/**
 * Whole days from one Manila date to another, both written as YYYY-MM-DD.
 *
 * Built from the date parts rather than by subtracting timestamps, so a
 * daylight-saving jump somewhere else in the world cannot shift the answer.
 */
function daysBetweenISO(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((end - start) / 86_400_000);
}
