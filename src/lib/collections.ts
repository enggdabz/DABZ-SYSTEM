/**
 * Everything the shop collected, from all three doors at once (spec 6, 8, 9).
 *
 * Money arrives through the Counter, through a Dabz Apparel job order and
 * through a DabzTech repair ticket. All three already write to the same
 * ledger; what this file does is let one screen show them side by side, and
 * say which door each peso came through.
 *
 * TWO RULES THAT MATTER MOST HERE
 *
 * 1. NOTHING IN THIS FILE WRITES ANYTHING. A collection row is a view of a
 *    record that has already reached the ledger through complete_sale,
 *    record_apparel_payment or record_repair_payment. If a total here ever
 *    disagrees with the ledger, the ledger is right and this is the bug -
 *    which is why `12_phase10_rls.test.sql` asserts the two are equal.
 *
 * 2. A VOIDED ROW IS NOT A TOTAL. It stays visible, struck through, because a
 *    customer may be holding the receipt - but every sum here runs over
 *    `liveCollections` first, exactly as every ledger sum runs over
 *    `liveEntries`.
 */
import { DIVISION_IDS, type DivisionId } from "./divisions";
import { MONEY_SOURCES, type MoneySource } from "./ledger";
import { sumCentavos, type Centavos } from "./money";
import {
  addDays,
  civilDateToISO,
  daysBetween,
  parseISODate,
  type CivilDate,
} from "./period";

// ---------------------------------------------------------------------------
// One money event
// ---------------------------------------------------------------------------

export const COLLECTION_KINDS = [
  "counter_sale",
  "apparel_payment",
  "repair_payment",
] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/**
 * What the money was for.
 *
 * Null is a real answer, not a gap: a DabzTech payment taken before Phase 10
 * has no kind recorded, and nobody can now say whether it was a down payment
 * or a balance. Those read as plain "Payment" rather than being guessed at.
 */
export type PaymentKind = "sale" | "down_payment" | "balance" | null;

export interface CollectionRow {
  /** The id of the sale, apparel payment or repair payment underneath. */
  id: string;
  kind: CollectionKind;
  /** Which door the money came through. */
  division: DivisionId;
  paymentKind: PaymentKind;
  /** Sale number, job order number or ticket number. */
  reference: string;
  /** Null for a walk-in at the counter. */
  customerName: string | null;
  amountCentavos: Centavos;
  source: MoneySource;
  /** GCash / Maya / bank reference, where there is one. */
  referenceNumber: string | null;
  /** When the row was written, in UTC. Shown in Manila time. */
  takenAt: string;
  /**
   * The date somebody typed in, which is usually the same day and occasionally
   * is not - a balance entered the morning after it was handed over. Kept so a
   * backdated payment can say so; never used for totals, because the ledger
   * entry it belongs to is stamped with `takenAt`.
   */
  recordedForISO: string;
  /** Who took it. Null when the reader may not see that person's profile. */
  takenBy: string | null;
  voidedAt: string | null;
  /** Where the row goes when tapped. */
  href: string;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** "Counter" rather than "Dabz Printshoppe": on this screen it is a door. */
export const DIVISION_DOOR_LABELS: Record<DivisionId, string> = {
  printshoppe: "Counter",
  apparel: "Apparel",
  dabztech: "DabzTech",
};

export function paymentKindLabel(row: Pick<CollectionRow, "paymentKind">): string {
  switch (row.paymentKind) {
    case "sale":
      return "Sale";
    case "down_payment":
      return "Down payment";
    case "balance":
      return "Balance";
    // Taken before the kind was recorded. Saying "Payment" is the whole of
    // what is known, and is better than a confident wrong "Balance".
    default:
      return "Payment";
  }
}

/** The methods a collection can arrive by, in the order they are shown. */
export const COLLECTION_SOURCES: readonly MoneySource[] = MONEY_SOURCES;

// ---------------------------------------------------------------------------
// What a read of the feed actually came back with
// ---------------------------------------------------------------------------

/**
 * A read of the collections feed, and whether it is the WHOLE of it.
 *
 * WHY THIS IS NOT JUST AN ARRAY
 * `public.collections` is `security_invoker`, so what comes back depends on
 * who asked, and the read can also fail outright or hit its row cap. In all
 * three cases the rows still add up to a number, and that number reads on a
 * screen as "this is what the shop took today". It is not. An empty array
 * from a failed query says "nothing came in", which is the most confidently
 * wrong thing this system could print beside money.
 *
 * So every read carries what it knows about itself, and the screens decide
 * what to say. Same rule as `unknown` in `target.ts`: a zero is a claim.
 */
export interface CollectionsRead {
  rows: CollectionRow[];
  /** The query itself failed. The rows are UNKNOWN, not "none". */
  failed: boolean;
  /** The cap was reached, so these are only the newest of the window. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// How much of a door this person actually sees
// ---------------------------------------------------------------------------

/**
 * What a given account sees of one door's money.
 *
 *   all  - every payment through that door
 *   own  - only what this person took themselves
 *   none - nothing at all
 *
 * WHY THIS IS NOT A BOOLEAN, AND WHY IT LIVES HERE
 * `public.collections` is `security_invoker`, so the three tables' own
 * policies decide what comes back, and they do not all say the same thing.
 * Apparel and DabzTech are all-or-nothing on a permission. The COUNTER is
 * not: without `view_daily_sales_report`, `sales_read_own` returns only the
 * rows this person created, so the figure is real but it is theirs, not the
 * counter's.
 *
 * That middle case is the one that went wrong. Treating the counter as simply
 * "visible" printed one assistant's PHP 1,200 under the whole counter's name,
 * with no warning - and End of day froze the same shortfall into the books.
 * So the rule is written once, here, where it can be tested, rather than
 * three times across two screens and a Server Action.
 */
export type DoorVisibility = "all" | "own" | "none";

export interface DoorViewer {
  isOwnerOrAdmin: boolean;
  canViewDailySalesReport: boolean;
  canApparelJobOrders: boolean;
  canDabztechTickets: boolean;
}

export function doorVisibility(
  division: DivisionId,
  viewer: DoorViewer,
): DoorVisibility {
  if (viewer.isOwnerOrAdmin) return "all";

  switch (division) {
    case "apparel":
      return viewer.canApparelJobOrders ? "all" : "none";
    case "dabztech":
      return viewer.canDabztechTickets ? "all" : "none";
    default:
      return viewer.canViewDailySalesReport ? "all" : "own";
  }
}

/** True when every door is fully visible, so a total may be called the day's. */
export function seesWholeDay(viewer: DoorViewer): boolean {
  return DIVISION_IDS.every((id) => doorVisibility(id, viewer) === "all");
}

/** A read nobody should quote a total from without saying so. */
export function isPartialRead(read: CollectionsRead): boolean {
  return read.failed || read.truncated;
}

/**
 * The one wording for a read that cannot be trusted whole, so every screen
 * that shows one says the same thing - the reason `deletable.ts` exists.
 */
export function partialReadWarning(read: CollectionsRead): string | null {
  if (read.failed) {
    /*
      "Your takings are safe" earns its place here. A read failing touches no
      row - it is a question that did not arrive, not an answer that came back
      empty - and the one time this fired for real, that was the sentence the
      owner needed and did not get. Reassurance is not padding when the
      alternative is somebody believing their money is gone.
    */
    return "The payments for this day could not be read, so no figure here is the shop's takings. This is a fault, not an empty day, and your takings are safe - nothing has been lost. Show it to whoever maintains the system.";
  }
  if (read.truncated) {
    return "There were more payments in this period than this screen reads at once, so the figures below are short. Ask for a shorter period.";
  }
  return null;
}

/**
 * May a peso figure be printed from this read at all?
 *
 * WHY THIS IS NOT THE SAME QUESTION AS `partialReadWarning`
 * That function answers "is there something to say about this read". This one
 * answers "is there a NUMBER here", and the two differ in the case that
 * matters:
 *
 *   * `truncated` - the figures are a FLOOR. Real money, just not all of it.
 *     Print them, with the warning beside them.
 *   * `failed` - the figures are UNKNOWN. `collectedTotal([])` is 0, and that
 *     zero is not a small number, it is the absence of an answer wearing the
 *     costume of one.
 *
 * WHAT WENT WRONG WITHOUT IT
 * The owner's database was missing the `collections` view, so every read
 * failed. The screen printed PHP 0.00 across the day and all three doors in
 * 4xl type, with the explanation in 12px grey underneath - and the owner spent
 * a day believing the shop's takings had been wiped. The warning was right
 * there and lost the argument to the big number, because a big number always
 * wins. So on a failed read there is now no number to lose to.
 *
 * Same family as `unknown` in `target.ts` and a NULL day-closing breakdown: a
 * zero is a claim, and this system does not make claims it cannot support.
 */
export function figuresAreKnown(read: CollectionsRead): boolean {
  return !read.failed;
}

// ---------------------------------------------------------------------------
// Which day the feed is being asked about
// ---------------------------------------------------------------------------

/**
 * The day the Sales screen is showing, and where its arrows go.
 *
 * WHY THIS EXISTS
 * The screen was hard-wired to today and had no way to ask for another day.
 * That is unremarkable at four in the afternoon and alarming at nine in the
 * morning: every figure reads PHP 0.00, and an owner who took PHP 4,000
 * yesterday opens a screen called "Sales", finds nothing on it, and concludes
 * the system has lost the lot. Nothing was lost - yesterday's money was on
 * yesterday, and there was no way to go there.
 *
 * So the day is a parameter, and an empty one says WHICH day it was empty on.
 * Same rule as `unknown` in `target.ts`: a zero is a claim, and a claim has to
 * say what it is about.
 */
export interface SalesDay {
  date: CivilDate;
  /** "2026-09-21" - for the URL, and for the date box. */
  iso: string;
  isToday: boolean;
  /**
   * A day that has not arrived yet, reachable only by typing one into the URL
   * or the date box. It is empty for a reason that has nothing to do with the
   * shop, and the screen has to say so rather than "nothing was taken".
   */
  isFuture: boolean;
  /** The day before. There is always one. */
  previous: CivilDate;
  /**
   * The day after, or null once there is nothing later worth opening. Today is
   * the end of the road: tomorrow cannot have taken anything.
   */
  next: CivilDate | null;
}

/**
 * Reads the day out of a URL.
 *
 * An unreadable date falls back to today rather than raising anything. The
 * person typed something into an address bar, the heading always says which
 * day is being shown, and a screen that refuses to draw teaches nobody
 * anything.
 */
export function salesDay(asked: string | undefined, today: CivilDate): SalesDay {
  const date = parseISODate(asked ?? "") ?? today;
  const fromToday = daysBetween(today, date);

  return {
    date,
    iso: civilDateToISO(date),
    isToday: fromToday === 0,
    isFuture: fromToday > 0,
    previous: addDays(date, -1),
    next: fromToday < 0 ? addDays(date, 1) : null,
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Rows that still count. A voided payment is money that was handed back. */
export function liveCollections(
  rows: readonly CollectionRow[],
): CollectionRow[] {
  return rows.filter((row) => row.voidedAt === null);
}

export interface CollectionFilter {
  division?: DivisionId | "all";
  source?: MoneySource | "all";
}

export function filterCollections(
  rows: readonly CollectionRow[],
  filter: CollectionFilter,
): CollectionRow[] {
  return rows.filter((row) => {
    if (filter.division && filter.division !== "all") {
      if (row.division !== filter.division) return false;
    }
    if (filter.source && filter.source !== "all") {
      if (row.source !== filter.source) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Adding it up
// ---------------------------------------------------------------------------

function emptyByDivision(): Record<DivisionId, Centavos> {
  return { printshoppe: 0, apparel: 0, dabztech: 0 };
}

function emptyBySource(): Record<MoneySource, Centavos> {
  return { cash_drawer: 0, gcash: 0, maya: 0, bank: 0, owners_pocket: 0 };
}

/** Total collected, per door. Voided rows are dropped first. */
export function totalsByDivision(
  rows: readonly CollectionRow[],
): Record<DivisionId, Centavos> {
  const totals = emptyByDivision();
  for (const row of liveCollections(rows)) {
    totals[row.division] += row.amountCentavos;
  }
  return totals;
}

/** Total collected, per method. Voided rows are dropped first. */
export function totalsBySource(
  rows: readonly CollectionRow[],
): Record<MoneySource, Centavos> {
  const totals = emptyBySource();
  for (const row of liveCollections(rows)) {
    totals[row.source] += row.amountCentavos;
  }
  return totals;
}

export function collectedTotal(rows: readonly CollectionRow[]): Centavos {
  return sumCentavos(liveCollections(rows).map((row) => row.amountCentavos));
}

// ---------------------------------------------------------------------------
// The end-of-day breakdown (spec 3.3)
// ---------------------------------------------------------------------------

export interface DivisionBreakdown {
  division: DivisionId;
  label: string;
  /** What came in by each method. */
  bySource: Record<MoneySource, Centavos>;
  totalCentavos: Centavos;
  /**
   * The down payment / balance split, which only Apparel and DabzTech have.
   * `unlabelled` is the DabzTech payments taken before Phase 10.
   */
  downPaymentCentavos: Centavos;
  balanceCentavos: Centavos;
  unlabelledCentavos: Centavos;
  rowCount: number;
}

export interface CollectionsBreakdown {
  divisions: DivisionBreakdown[];
  /** The bottom row: every division added together, per method. */
  totalBySource: Record<MoneySource, Centavos>;
  totalCentavos: Centavos;
  rowCount: number;
  voidedCount: number;
  voidedCentavos: Centavos;
}

/**
 * The whole table on the End of day screen: one row per door, one column per
 * method, and a bottom row that has to match what the ledger says the day took.
 *
 * Every division appears even when it took nothing, because "Apparel: PHP 0.00"
 * is the answer to a question the owner is asking, and a missing row is not.
 */
export function breakdownCollections(
  rows: readonly CollectionRow[],
): CollectionsBreakdown {
  const live = liveCollections(rows);
  const voided = rows.filter((row) => row.voidedAt !== null);

  const divisions: DivisionBreakdown[] = DIVISION_IDS.map((division) => {
    const own = live.filter((row) => row.division === division);
    const bySource = emptyBySource();
    for (const row of own) bySource[row.source] += row.amountCentavos;

    const sumOfKind = (kind: PaymentKind) =>
      sumCentavos(
        own
          .filter((row) => row.paymentKind === kind)
          .map((row) => row.amountCentavos),
      );

    return {
      division,
      label: DIVISION_DOOR_LABELS[division],
      bySource,
      totalCentavos: sumCentavos(own.map((row) => row.amountCentavos)),
      downPaymentCentavos: sumOfKind("down_payment"),
      balanceCentavos: sumOfKind("balance"),
      unlabelledCentavos: sumOfKind(null),
      rowCount: own.length,
    };
  });

  const totalBySource = emptyBySource();
  for (const entry of divisions) {
    for (const source of MONEY_SOURCES) {
      totalBySource[source] += entry.bySource[source];
    }
  }

  return {
    divisions,
    totalBySource,
    totalCentavos: sumCentavos(divisions.map((entry) => entry.totalCentavos)),
    rowCount: live.length,
    voidedCount: voided.length,
    voidedCentavos: sumCentavos(voided.map((row) => row.amountCentavos)),
  };
}

// ---------------------------------------------------------------------------
// Taking a payment from the counter (spec 3.2)
// ---------------------------------------------------------------------------

/** An open job order or repair ticket with money still owed on it. */
export interface PayableJob {
  id: string;
  kind: "apparel_order" | "repair_ticket";
  division: DivisionId;
  reference: string;
  customerName: string;
  /** Extra words to search on: a phone number, a team name, a unit. */
  detail: string | null;
  totalCentavos: Centavos;
  paidCentavos: Centavos;
  /** Total less live payments. Computed every time, never stored, never typed. */
  balanceCentavos: Centavos;
  /** True while nothing has been paid, which is what makes the next one a down payment. */
  nothingPaidYet: boolean;
  href: string;
}

/**
 * Finds the order or ticket somebody is looking for.
 *
 * Matches a job order number, a ticket number, a customer name or anything in
 * the detail line - a phone number, a team, the laptop's brand - because the
 * customer at the counter will say whichever of those they remember. An empty
 * search returns everything, so the list is browsable rather than a blank box.
 */
export function searchPayableJobs(
  jobs: readonly PayableJob[],
  query: string,
): PayableJob[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...jobs];

  return jobs.filter((job) =>
    [job.reference, job.customerName, job.detail ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export interface PaymentCheck {
  ok: boolean;
  /** Why it was refused, in the words the counter should show. */
  error: string | null;
}

/**
 * Is this a payment the counter may take?
 *
 * Refuses nothing and refuses too much - and nothing else. In particular it
 * does NOT refuse a down payment that is under the shop's policy: that is a
 * warning, because the owner may well have agreed to take less, and a system
 * that turned the customer away would be wrong more often than it was right.
 */
export function checkPaymentAmount(options: {
  amountCentavos: Centavos;
  balanceCentavos: Centavos;
}): PaymentCheck {
  if (options.amountCentavos <= 0) {
    return { ok: false, error: "Enter how much the customer handed over." };
  }
  if (options.amountCentavos > options.balanceCentavos) {
    return {
      ok: false,
      error: "That is more than the balance. Take the balance, or fix the amount.",
    };
  }
  return { ok: true, error: null };
}

/**
 * Down payment or balance, when nobody has said which.
 *
 * The first money on a job is a down payment and everything after it is a
 * balance. This is only the DEFAULT the form starts on - whoever is at the
 * counter can change it, because a customer can hand over a second down
 * payment on a job that has not started.
 */
export function defaultPaymentKind(options: {
  nothingPaidYet: boolean;
}): "down_payment" | "balance" {
  return options.nothingPaidYet ? "down_payment" : "balance";
}

// ---------------------------------------------------------------------------
// What the shop is holding, and what it is still owed (spec 3.4)
// ---------------------------------------------------------------------------

export interface HeldMoney {
  /** Live payments on work the shop has not handed back yet. */
  centavos: Centavos;
  apparelCentavos: Centavos;
  dabztechCentavos: Centavos;
  orderCount: number;
  ticketCount: number;
}

/**
 * Money already received for work the shop still owes.
 *
 * This is a VIEW of payments that have already been counted as income, not a
 * new category and not a change to when income is recognised. It answers one
 * question the owner asks out loud - "how much of what is in the drawer is
 * already spoken for?" - and it must never be subtracted from anything, or the
 * same peso would be counted twice in opposite directions.
 */
export function heldForUnfinishedWork(options: {
  apparel: readonly { paidCentavos: Centavos }[];
  dabztech: readonly { paidCentavos: Centavos }[];
}): HeldMoney {
  const apparelCentavos = sumCentavos(
    options.apparel.map((entry) => entry.paidCentavos),
  );
  const dabztechCentavos = sumCentavos(
    options.dabztech.map((entry) => entry.paidCentavos),
  );

  return {
    centavos: apparelCentavos + dabztechCentavos,
    apparelCentavos,
    dabztechCentavos,
    orderCount: options.apparel.length,
    ticketCount: options.dabztech.length,
  };
}

// ---------------------------------------------------------------------------
// A payment receipt (spec 3.5)
// ---------------------------------------------------------------------------

export interface ReceiptFigures {
  totalCentavos: Centavos;
  /** Live payments taken before this one. */
  paidBeforeCentavos: Centavos;
  thisPaymentCentavos: Centavos;
  /** Paid before plus this one - unless this one was voided. */
  paidAfterCentavos: Centavos;
  balanceRemainingCentavos: Centavos;
  overpaid: boolean;
  overpaidByCentavos: Centavos;
}

/**
 * The four figures a customer checks on a payment receipt: what the job comes
 * to, what was paid before, what was just handed over, and what is left.
 *
 * Every one is added up from rows, the same rule as a payslip and a till
 * receipt, so somebody holding the paper can verify it by hand. Nothing here
 * is read from a stored total, because no such total exists.
 *
 * A VOIDED PAYMENT still prints, and prints honestly: it adds nothing to what
 * has been paid and the balance is the balance as if it had never happened.
 * The slip says VOIDED across it so it cannot be passed off as a valid one.
 *
 * "Before" is decided by when each payment was WRITTEN, with the id breaking a
 * tie, so two payments taken in the same second still print in a stable order
 * rather than swapping places between one print and the next.
 */
export function receiptFigures(options: {
  totalCentavos: Centavos;
  /** Every live payment on the job, including the one being printed. */
  livePayments: readonly {
    id: string;
    takenAt: string;
    amountCentavos: Centavos;
  }[];
  payment: {
    id: string;
    takenAt: string;
    amountCentavos: Centavos;
    voided: boolean;
  };
}): ReceiptFigures {
  const isBefore = (candidate: { id: string; takenAt: string }) =>
    candidate.takenAt < options.payment.takenAt ||
    (candidate.takenAt === options.payment.takenAt &&
      candidate.id < options.payment.id);

  const paidBeforeCentavos = sumCentavos(
    options.livePayments
      .filter((candidate) => candidate.id !== options.payment.id)
      .filter(isBefore)
      .map((candidate) => candidate.amountCentavos),
  );

  const paidAfterCentavos =
    paidBeforeCentavos +
    (options.payment.voided ? 0 : options.payment.amountCentavos);

  const difference = options.totalCentavos - paidAfterCentavos;

  return {
    totalCentavos: options.totalCentavos,
    paidBeforeCentavos,
    thisPaymentCentavos: options.payment.amountCentavos,
    paidAfterCentavos,
    balanceRemainingCentavos: Math.max(0, difference),
    overpaid: difference < 0,
    overpaidByCentavos: Math.max(0, -difference),
  };
}

// ---------------------------------------------------------------------------
// Collections by division and kind, for a report (spec 3.4)
// ---------------------------------------------------------------------------

export interface CollectionReportLine {
  /** A stable key, e.g. "apparel:down_payment". */
  key: string;
  label: string;
  division: DivisionId;
  paymentKind: PaymentKind;
  bySource: Record<MoneySource, Centavos>;
  amountCentavos: Centavos;
  count: number;
}

export interface CollectionsReport {
  lines: CollectionReportLine[];
  totalBySource: Record<MoneySource, Centavos>;
  totalCentavos: Centavos;
  /**
   * True when the read behind these figures was not the whole period - it
   * failed, or it hit its row cap. The figures are then a floor, not a total,
   * and the screen and the CSV both have to say so. A bookkeeper cannot tell
   * a short total from a true one by looking at it.
   */
  partial: boolean;
}

/**
 * One line per (door, kind) pair that actually took money, each split by
 * method.
 *
 * Pairs that took nothing are left out here, unlike the End of day table: a
 * report covering a year should not carry a row of zeroes for a combination
 * the shop never used.
 */
export function collectionsReport(
  rows: readonly CollectionRow[],
  options: { partial?: boolean } = {},
): CollectionsReport {
  const lines = new Map<string, CollectionReportLine>();

  for (const row of liveCollections(rows)) {
    const key = `${row.division}:${row.paymentKind ?? "unlabelled"}`;

    const line =
      lines.get(key) ??
      ({
        key,
        label: `${DIVISION_DOOR_LABELS[row.division]} · ${paymentKindLabel(row)}`,
        division: row.division,
        paymentKind: row.paymentKind,
        bySource: emptyBySource(),
        amountCentavos: 0,
        count: 0,
      } satisfies CollectionReportLine);

    line.bySource[row.source] += row.amountCentavos;
    line.amountCentavos += row.amountCentavos;
    line.count += 1;
    lines.set(key, line);
  }

  const ordered = [...lines.values()].sort((a, b) => {
    const byDivision =
      DIVISION_IDS.indexOf(a.division) - DIVISION_IDS.indexOf(b.division);
    return byDivision !== 0 ? byDivision : b.amountCentavos - a.amountCentavos;
  });

  const totalBySource = emptyBySource();
  for (const line of ordered) {
    for (const source of MONEY_SOURCES) {
      totalBySource[source] += line.bySource[source];
    }
  }

  return {
    lines: ordered,
    totalBySource,
    totalCentavos: sumCentavos(ordered.map((line) => line.amountCentavos)),
    partial: options.partial ?? false,
  };
}
