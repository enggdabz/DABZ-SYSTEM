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
import { splitAmountByCategory } from "./ledger";
import { sumCentavos, type Centavos } from "./money";
import {
  rowIsPriced,
  rowTotal,
  summariseUniforms,
  type EncodedRow,
  type UniformSummary,
  type UniformType,
} from "./uniforms";

/*
  The size ladder moved to `uniforms.ts` in Phase 13, because it is vocabulary
  the encoding table and the summary need as much as the totals do. It is
  re-exported here so that every screen which already asks this file for it
  keeps working - one move, no churn.
*/
export {
  APPAREL_SIZES,
  isApparelSize,
  sizeExtra,
  type ApparelSize,
  type SizePrice,
} from "./uniforms";

/**
 * One person on a project: their own name, number, size, shorts and price.
 *
 * The word "roster" is kept because that is what fifteen names on a jersey
 * order have always been called here. Phase 13 gave each of them their own
 * uniform type and their own price - see `src/lib/uniforms.ts`.
 */
export type RosterEntry = EncodedRow;

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
  /**
   * The uniform type this item is (Phase 13). One item per type per project.
   * Null on an item written before then: "not recorded", never guessed.
   */
  uniformType: UniformType | null;
  customTypeName: string | null;
  /**
   * Set when encoding emptied this item but its bench marks had to be kept.
   * A retired item counts as NOTHING - its pieces are counted on another item
   * now, and adding them twice would overstate the order.
   */
  retiredAt: string | null;
}

export interface LineTotal {
  line: OrderLine;
  roster: RosterEntry[];
  /** Pieces: the rows' quantities where there are rows, else the typed one. */
  quantity: number;
  /** The rows' own prices, or the item's price each where they have none. */
  baseCentavos: Centavos;
  /** What the big sizes added, on rows written before Phase 13. */
  sizeExtrasCentavos: Centavos;
  totalCentavos: Centavos;
  /** Pieces nobody has priced. Warned about, never priced by the system. */
  piecesWithoutPrice: number;
  /** True when this item was retired: it counts as nothing (see OrderLine). */
  retired: boolean;
}

/**
 * One item's total.
 *
 * When the item has rows, THE ROWS ARE THE QUANTITY - fifteen names means
 * fifteen jerseys, and a nameless block of fifty says fifty on one row. A
 * typed quantity beside them would be a second answer to the same question,
 * and the rows are the one the customer checked.
 *
 * Each row costs what it says it costs. A row with no price of its own falls
 * back to the item's price each plus its own copied size add-on, which is
 * EXACTLY the arithmetic every order written before Phase 13 was totalled
 * with - so those orders come to the same figure, to the centavo. See
 * `rowPrice` in `src/lib/uniforms.ts`.
 */
export function lineTotal(
  line: OrderLine,
  roster: readonly RosterEntry[],
): LineTotal {
  const own = roster.filter((entry) => entry.lineId === line.id);

  if (line.retiredAt !== null) {
    return {
      line,
      roster: own,
      quantity: 0,
      baseCentavos: 0,
      sizeExtrasCentavos: 0,
      totalCentavos: 0,
      piecesWithoutPrice: 0,
      retired: true,
    };
  }

  if (own.length === 0) {
    // No rows at all: a plain block of pieces, priced on the item itself.
    const baseCentavos = line.unitPriceCentavos * line.quantity;
    return {
      line,
      roster: own,
      quantity: line.quantity,
      baseCentavos,
      sizeExtrasCentavos: 0,
      totalCentavos: baseCentavos,
      piecesWithoutPrice: line.unitPriceCentavos > 0 ? 0 : line.quantity,
      retired: false,
    };
  }

  const quantity = own.reduce((count, entry) => count + entry.quantity, 0);

  // Split in two only so the screen can still say "includes X of size add-ons"
  // on the orders that have them. The total is the same either way.
  const baseCentavos = sumCentavos(
    own.map((entry) =>
      entry.quantity *
      (entry.priceCentavos !== null ? entry.priceCentavos : line.unitPriceCentavos),
    ),
  );
  const sizeExtrasCentavos = sumCentavos(
    own.map((entry) =>
      entry.priceCentavos !== null ? 0 : entry.quantity * entry.sizeExtraCentavos,
    ),
  );

  return {
    line,
    roster: own,
    quantity,
    baseCentavos,
    sizeExtrasCentavos,
    totalCentavos: baseCentavos + sizeExtrasCentavos,
    piecesWithoutPrice: own.reduce(
      (count, entry) => count + (rowIsPriced(entry, line) ? 0 : entry.quantity),
      0,
    ),
    retired: false,
  };
}

/**
 * The project's summary: how many of each uniform type, per size, and the
 * shorts per size.
 *
 * Here rather than in either screen, so the project screen and the printed job
 * order sheet cannot disagree about what is being made - the same reason
 * `toCalendarOrder` and `toProductionItems` live beside the orders they map.
 *
 * An item with no rows on it is a plain block of pieces nobody has been named
 * for. It is reported separately rather than folded into the grid, because
 * nothing says what type or size those pieces are, and inventing a column for
 * them is exactly the confident wrong answer the person cutting would follow.
 */
export function summariseOrder(lines: readonly LineTotal[]): UniformSummary {
  return summariseUniforms({
    rows: lines.flatMap((entry) => entry.roster),
    unencoded: lines
      .filter((entry) => !entry.retired && entry.roster.length === 0)
      .map((entry) => ({
        lineId: entry.line.id,
        name: entry.line.name,
        quantity: entry.quantity,
      })),
  });
}

/** One row's whole cost, for a screen that lists rows rather than items. */
export function rosterEntryTotal(
  entry: RosterEntry,
  line: Pick<OrderLine, "unitPriceCentavos">,
): Centavos {
  return rowTotal(entry, line);
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
  /**
   * The payments the counter marked as a down payment, and everything else.
   *
   * Two figures rather than one because the owner asks for the project to say
   * "Total, Down payment, Other payments, Balance" at the top - and because a
   * customer can hand over a second down payment on a job that has not started
   * yet, so which is which is a CHOICE at the counter, not "the first one".
   * Neither is stored: both are added up from the payments every time.
   */
  downPaymentCentavos: Centavos;
  otherPaymentsCentavos: Centavos;
  /** Pieces on this project nobody has priced. */
  piecesWithoutPrice: number;
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
  const downPaymentCentavos = sumCentavos(
    options.payments
      .filter((payment) => payment.kind === "down_payment")
      .map((payment) => payment.amountCentavos),
  );

  const difference = totalCentavos - paidCentavos;

  return {
    lines,
    itemCount: lines.reduce((count, entry) => count + entry.quantity, 0),
    totalCentavos,
    paidCentavos,
    downPaymentCentavos,
    otherPaymentsCentavos: paidCentavos - downPaymentCentavos,
    piecesWithoutPrice: lines.reduce(
      (count, entry) => count + entry.piecesWithoutPrice,
      0,
    ),
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
  return splitAmountByCategory({
    weights: options.lines.map((entry) => ({
      category: entry.line.incomeCategory,
      weightCentavos: entry.totalCentavos,
    })),
    amountCentavos: options.amountCentavos,
    fallbackCategory: "sublimation_jerseys",
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
    | "unpriced_line"
    | "untyped_item";
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
  totals: Pick<OrderTotals, "balanceCentavos" | "lines" | "piecesWithoutPrice">;
}): OrderWarning[] {
  const warnings: OrderWarning[] = [];

  if (options.status === "released" && options.totals.balanceCentavos > 0) {
    warnings.push({
      kind: "released_with_balance",
      label: "Released with money still owed",
    });
  }

  /*
    Counted in PIECES rather than items since Phase 13, because the money is on
    the rows now: an item can be perfectly well priced on twenty-eight of its
    thirty people, and "1 item with no price" would send somebody looking at
    the wrong thing.
  */
  const unpriced = options.totals.piecesWithoutPrice;
  if (unpriced > 0) {
    warnings.push({
      kind: "unpriced_line",
      label: `${unpriced} piece${unpriced === 1 ? "" : "s"} with no price`,
    });
  }

  /*
    Only while the project is live. It is a prompt to go and set the types so
    the project joins the summary - and there is nothing to go and do on a job
    that has been released or cancelled, where the cutting is long finished.
    A warning nobody can act on is how people learn to scroll past warnings.
  */
  if (!isOpenOrder(options.status)) return warnings;

  const untyped = options.totals.lines.filter(
    (entry) => !entry.retired && entry.line.uniformType === null,
  );
  if (untyped.length > 0) {
    warnings.push({
      kind: "untyped_item",
      label: `${untyped.length} item${
        untyped.length === 1 ? "" : "s"
      } with no type of uniform recorded`,
    });
  }

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
      label:
        days === 0
          ? "Promised today"
          : `Promised in ${days} day${days === 1 ? "" : "s"}`,
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
