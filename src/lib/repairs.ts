/**
 * DabzTech Solutions repair tickets (spec 9, open decision 17.11).
 *
 * "The Fix That Lasts" - which is a promise, and a promise needs a date on it.
 * So a released ticket carries its own warranty period, copied at the moment
 * it is handed back, and the screen says whether that promise is still good.
 *
 * WHAT THIS FILE DELIBERATELY HAS NO ROOM FOR
 *
 * A password. Spec 9.3 says the shop does not keep them, so there is no field
 * for one anywhere in this system - not encrypted, not "temporarily". A box
 * that exists gets filled in, and a laptop password written down in a shop
 * system is a liability the shop cannot insure against. What IS recorded is
 * how the technician is meant to get in: the customer unlocks it, or it came
 * unlocked, or it does not need unlocking.
 */
import { splitAmountByCategory } from "./ledger";
import { sumCentavos, type Centavos } from "./money";

// ---------------------------------------------------------------------------
// What came in (spec 9.1)
// ---------------------------------------------------------------------------

/** DabzTech takes Epson printers, laptops and desktops only (spec 1.1). */
export const UNIT_KINDS = ["epson_printer", "laptop", "desktop"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  epson_printer: "Epson printer",
  laptop: "Laptop",
  desktop: "Desktop PC",
};

/** Which set of books this unit's labour counts as (spec 10.1). */
export const UNIT_INCOME_CATEGORY: Record<UnitKind, string> = {
  epson_printer: "epson_printer_repair",
  laptop: "laptop_repair",
  desktop: "desktop_repair",
};

/**
 * How the technician gets into a locked unit (spec 9.3).
 *
 * This is the whole of what the system knows. There is no password field, and
 * adding one later would be a change to the specification, not a feature.
 */
export const UNLOCK_METHODS = [
  "not_needed",
  "customer_unlocks",
  "left_unlocked",
] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];

export const UNLOCK_METHOD_LABELS: Record<UnlockMethod, string> = {
  not_needed: "Does not need unlocking",
  customer_unlocks: "Customer will unlock it for us",
  left_unlocked: "Left unlocked / no password set",
};

// ---------------------------------------------------------------------------
// Where a ticket has got to (spec 9.2)
// ---------------------------------------------------------------------------

export const TICKET_STATUSES = [
  "received",
  "checking",
  "quoted",
  "repairing",
  "ready",
  "released",
  "declined",
  "unrepairable",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  received: "Received",
  checking: "Being checked",
  quoted: "Quoted, waiting for the customer",
  repairing: "Being repaired",
  ready: "Ready for pickup",
  released: "Released",
  declined: "Customer said no",
  unrepairable: "Cannot be repaired",
};

/** The steps a ticket moves through. The two refusals are not among them. */
export const TICKET_FLOW: TicketStatus[] = [
  "received",
  "checking",
  "quoted",
  "repairing",
  "ready",
  "released",
];

/** A ticket still in the shop, whatever happens to it next. */
export function isOpenTicket(status: TicketStatus): boolean {
  return status !== "released";
}

/**
 * True while the unit is physically still here waiting for its owner.
 *
 * Declined and unrepairable units are still IN THE SHOP - that is exactly the
 * pile that grows - so they count as waiting to be collected too (spec 9.4).
 */
export function isAwaitingCollection(status: TicketStatus): boolean {
  return status === "ready" || status === "declined" || status === "unrepairable";
}

// ---------------------------------------------------------------------------
// What is being charged (spec 9.2)
// ---------------------------------------------------------------------------

export const LINE_KINDS = ["checking_fee", "service", "part"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  checking_fee: "Checking fee",
  service: "Service",
  part: "Part",
};

export interface TicketLine {
  id: string;
  ticketId: string;
  kind: LineKind;
  /** Copied from the price list, so renaming a service never rewrites a job. */
  name: string;
  unitPriceCentavos: Centavos;
  quantity: number;
  incomeCategory: string;
  /** Set when the part came off the shop's own shelf. */
  stockItemId: string | null;
}

export interface LineTotal {
  line: TicketLine;
  totalCentavos: Centavos;
}

export function ticketLineTotal(line: TicketLine): LineTotal {
  return { line, totalCentavos: line.unitPriceCentavos * line.quantity };
}

export interface TicketPayment {
  id: string;
  ticketId: string;
  amountCentavos: Centavos;
  paidOn: string;
  source: string;
  note: string | null;
}

export interface TicketTotals {
  lines: LineTotal[];
  /** The checking fee on its own: it is charged even when the job is declined. */
  checkingFeeCentavos: Centavos;
  labourCentavos: Centavos;
  partsCentavos: Centavos;
  totalCentavos: Centavos;
  paidCentavos: Centavos;
  balanceCentavos: Centavos;
  overpaid: boolean;
  overpaidByCentavos: Centavos;
  /** Lines nobody has priced, which therefore add nothing. */
  unpricedCount: number;
}

/**
 * What a ticket comes to, added up from its own rows.
 *
 * Never stored. A stored total and a list of parts can disagree, and the
 * customer holding the job ticket will believe whichever is larger.
 */
export function ticketTotals(options: {
  lines: readonly TicketLine[];
  payments: readonly TicketPayment[];
}): TicketTotals {
  const lines = options.lines.map(ticketLineTotal);

  const sumOf = (kind: LineKind) =>
    sumCentavos(
      lines
        .filter((entry) => entry.line.kind === kind)
        .map((entry) => entry.totalCentavos),
    );

  const totalCentavos = sumCentavos(lines.map((entry) => entry.totalCentavos));
  const paidCentavos = sumCentavos(
    options.payments.map((payment) => payment.amountCentavos),
  );
  const difference = totalCentavos - paidCentavos;

  return {
    lines,
    checkingFeeCentavos: sumOf("checking_fee"),
    labourCentavos: sumOf("service"),
    partsCentavos: sumOf("part"),
    totalCentavos,
    paidCentavos,
    balanceCentavos: Math.max(0, difference),
    overpaid: difference < 0,
    overpaidByCentavos: Math.max(0, -difference),
    unpricedCount: lines.filter((entry) => entry.line.unitPriceCentavos <= 0)
      .length,
  };
}

/** A payment split across the categories the ticket is charging for. */
export function splitTicketPayment(options: {
  lines: readonly LineTotal[];
  amountCentavos: Centavos;
  unitKind: UnitKind;
}): { category: string; amountCentavos: Centavos }[] {
  return splitAmountByCategory({
    weights: options.lines.map((entry) => ({
      category: entry.line.incomeCategory,
      weightCentavos: entry.totalCentavos,
    })),
    amountCentavos: options.amountCentavos,
    // Nothing priced yet, but the money is real: it belongs to whatever kind
    // of unit this is.
    fallbackCategory: UNIT_INCOME_CATEGORY[options.unitKind],
  });
}

// ---------------------------------------------------------------------------
// The warranty (spec 9.3)
// ---------------------------------------------------------------------------

export interface WarrantyStatus {
  kind: "not_released" | "no_warranty" | "under_warranty" | "expired";
  label: string;
  /** Null until the unit has been released. */
  untilISO: string | null;
  daysLeft: number | null;
}

/**
 * Whether "The Fix That Lasts" still holds.
 *
 * The number of days is COPIED onto the ticket when the unit is released, not
 * read live from Settings. Shortening the warranty next year must not quietly
 * cancel a promise already made to a customer - the same rule as the daily
 * rate on a payroll week and the size surcharge on a jersey.
 */
export function warrantyStatus(options: {
  releasedOn: string | null;
  warrantyDays: number | null;
  today: string;
}): WarrantyStatus {
  if (!options.releasedOn) {
    return {
      kind: "not_released",
      label: "Not released yet",
      untilISO: null,
      daysLeft: null,
    };
  }

  if (options.warrantyDays === null || options.warrantyDays <= 0) {
    return {
      kind: "no_warranty",
      label: "No warranty recorded",
      untilISO: null,
      daysLeft: null,
    };
  }

  const untilISO = addDaysISO(options.releasedOn, options.warrantyDays);
  const daysLeft = daysBetweenISO(options.today, untilISO);

  if (daysLeft < 0) {
    const over = Math.abs(daysLeft);
    return {
      kind: "expired",
      label: `Warranty ended ${over} day${over === 1 ? "" : "s"} ago`,
      untilISO,
      daysLeft,
    };
  }

  return {
    kind: "under_warranty",
    label:
      daysLeft === 0
        ? "Warranty ends today"
        : `Under warranty for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}`,
    untilISO,
    daysLeft,
  };
}

// ---------------------------------------------------------------------------
// Units left behind (spec 9.4)
// ---------------------------------------------------------------------------

export interface UnclaimedStatus {
  waiting: boolean;
  daysWaiting: number;
  unclaimed: boolean;
  label: string;
}

/**
 * How long a finished unit has been sitting on the shelf.
 *
 * Counted from the day it was ready, not the day it came in: a repair that
 * took three weeks is not an unclaimed unit. A declined or unrepairable unit
 * counts too - that is exactly the pile that grows.
 */
export function unclaimedStatus(options: {
  status: TicketStatus;
  readyOn: string | null;
  unclaimedAfterDays: number;
  today: string;
}): UnclaimedStatus {
  if (!isAwaitingCollection(options.status) || !options.readyOn) {
    return { waiting: false, daysWaiting: 0, unclaimed: false, label: "" };
  }

  const daysWaiting = Math.max(
    0,
    daysBetweenISO(options.readyOn, options.today),
  );
  const unclaimed = daysWaiting >= options.unclaimedAfterDays;

  return {
    waiting: true,
    daysWaiting,
    unclaimed,
    label: unclaimed
      ? `Not collected for ${daysWaiting} days`
      : `Waiting ${daysWaiting} day${daysWaiting === 1 ? "" : "s"} for pickup`,
  };
}

// ---------------------------------------------------------------------------
// What needs looking at
// ---------------------------------------------------------------------------

export interface TicketWarning {
  kind:
    | "unclaimed"
    | "overdue"
    | "due_soon"
    | "no_promised_date"
    | "released_with_balance"
    | "unpriced_line"
    | "waiting_on_customer";
  label: string;
}

export const PROMISE_REMINDER_DAYS = 2;

export function ticketWarnings(options: {
  status: TicketStatus;
  promisedOn: string | null;
  readyOn: string | null;
  today: string;
  unclaimedAfterDays: number;
  totals: Pick<TicketTotals, "balanceCentavos" | "unpricedCount">;
}): TicketWarning[] {
  const warnings: TicketWarning[] = [];

  if (options.status === "released" && options.totals.balanceCentavos > 0) {
    warnings.push({
      kind: "released_with_balance",
      label: "Released with money still owed",
    });
  }

  if (options.totals.unpricedCount > 0) {
    warnings.push({
      kind: "unpriced_line",
      label: `${options.totals.unpricedCount} line${
        options.totals.unpricedCount === 1 ? "" : "s"
      } with no price`,
    });
  }

  const unclaimed = unclaimedStatus({
    status: options.status,
    readyOn: options.readyOn,
    unclaimedAfterDays: options.unclaimedAfterDays,
    today: options.today,
  });
  if (unclaimed.unclaimed) {
    warnings.push({ kind: "unclaimed", label: unclaimed.label });
  }

  if (options.status === "released") return warnings;

  // A quoted ticket is waiting on a person, not on the shop. Worth saying,
  // because it is the state a job sits in longest and nobody chases.
  if (options.status === "quoted") {
    warnings.push({
      kind: "waiting_on_customer",
      label: "Waiting for the customer to approve the quote",
    });
  }

  if (options.promisedOn === null) {
    if (options.status !== "declined" && options.status !== "unrepairable") {
      warnings.push({ kind: "no_promised_date", label: "No promised date set" });
    }
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

// ---------------------------------------------------------------------------
// Ticket numbers (spec 9.1)
// ---------------------------------------------------------------------------

/** "T-260918-003" - T for Tech, then the date, then the count for the day. */
export function formatTicketNumber(options: {
  year: number;
  month: number;
  day: number;
  sequence: number;
}): string {
  const { year, month, day, sequence } = options;
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `T-${yy}${mm}${dd}-${String(sequence).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Dates, built from the parts
// ---------------------------------------------------------------------------

/**
 * Both of these work on the date parts rather than by adding milliseconds, so
 * a daylight-saving jump somewhere else in the world cannot shift the answer.
 */
function daysBetweenISO(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

function addDaysISO(from: string, days: number): string {
  const date = new Date(utcOf(from) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function utcOf(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
}
