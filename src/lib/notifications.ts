/**
 * What is worth interrupting the owner for (Phase 11).
 *
 * Every warning this sends already exists inside the app. Nothing here
 * calculates a new fact about the shop; it decides which of the existing ones
 * are worth a buzz in somebody's pocket, and writes them short enough to read
 * on a lock screen.
 *
 * THE RULE THAT MATTERS MOST
 * A notification that arrives when nothing is wrong teaches the owner to
 * ignore the ones that matter. So `buildDigest` returns NULL when there is
 * nothing to say, and the sender sends nothing at all - it does not send
 * "all clear". The same instinct as a daily target of zero meaning "not
 * known" rather than "reached": silence is an honest answer, and a cheerful
 * one is not.
 *
 * WHY A DAILY SUMMARY RATHER THAN AN ALERT PER EVENT
 * A shop generates dozens of these a week. One message a morning gets read;
 * twelve get muted, and a muted channel is worse than no channel, because
 * everyone believes it is still working. The single exception is a customer
 * message, which has a person waiting at the other end - see
 * `enquiryAlert()`.
 */
import { formatPesos } from "./money";

/** How urgent a line is. Decides the order, and nothing else. */
export const DIGEST_KINDS = [
  "bills_overdue",
  "bills_due_soon",
  "enquiries",
  "unclaimed",
  "low_stock",
] as const;
export type DigestKind = (typeof DIGEST_KINDS)[number];

/**
 * Most urgent first.
 *
 * Money the shop owes and is already late on comes before money it is about
 * to owe; a person waiting for a reply comes before a thing sitting on a
 * shelf. Stock is last because running out is tomorrow's problem, and the
 * other four are today's.
 */
const KIND_ORDER: Record<DigestKind, number> = {
  bills_overdue: 0,
  bills_due_soon: 1,
  enquiries: 2,
  unclaimed: 3,
  low_stock: 4,
};

export interface DigestLine {
  kind: DigestKind;
  /** One short clause, e.g. "2 bills overdue (₱4,500.00)". */
  text: string;
  count: number;
}

export interface Digest {
  title: string;
  /** The lines joined, already trimmed to fit a lock screen. */
  body: string;
  /** Where tapping it goes. */
  url: string;
  lines: DigestLine[];
}

/** What the digest is built from - all of it read from screens that exist. */
export interface DigestInput {
  billsOverdue: { count: number; totalCentavos: number };
  billsDueSoon: { count: number; totalCentavos: number };
  unansweredEnquiries: number;
  unclaimedUnits: number;
  lowStockItems: number;
}

/**
 * A lock screen shows roughly this much before it cuts a notification off,
 * and a sentence that ends in "…" reads as a fault rather than a summary. So
 * the body is capped and the overflow is counted instead of truncated.
 */
export const DIGEST_BODY_LIMIT = 160;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * The lines, most urgent first. Anything with a count of zero is left out
 * entirely rather than written as "0 bills overdue" - a zero is a sentence
 * nobody needs to read.
 */
export function digestLines(input: DigestInput): DigestLine[] {
  const lines: DigestLine[] = [];

  if (input.billsOverdue.count > 0) {
    lines.push({
      kind: "bills_overdue",
      count: input.billsOverdue.count,
      text: `${input.billsOverdue.count} ${plural(
        input.billsOverdue.count,
        "bill",
        "bills",
      )} overdue (${formatPesos(input.billsOverdue.totalCentavos)})`,
    });
  }

  if (input.billsDueSoon.count > 0) {
    lines.push({
      kind: "bills_due_soon",
      count: input.billsDueSoon.count,
      text: `${input.billsDueSoon.count} ${plural(
        input.billsDueSoon.count,
        "bill due",
        "bills due",
      )} within 5 days (${formatPesos(input.billsDueSoon.totalCentavos)})`,
    });
  }

  if (input.unansweredEnquiries > 0) {
    lines.push({
      kind: "enquiries",
      count: input.unansweredEnquiries,
      text: `${input.unansweredEnquiries} customer ${plural(
        input.unansweredEnquiries,
        "message",
        "messages",
      )} waiting`,
    });
  }

  if (input.unclaimedUnits > 0) {
    lines.push({
      kind: "unclaimed",
      count: input.unclaimedUnits,
      text: `${input.unclaimedUnits} ${plural(
        input.unclaimedUnits,
        "unit",
        "units",
      )} not collected`,
    });
  }

  if (input.lowStockItems > 0) {
    lines.push({
      kind: "low_stock",
      count: input.lowStockItems,
      text: `${input.lowStockItems} ${plural(
        input.lowStockItems,
        "material",
        "materials",
      )} low`,
    });
  }

  return lines.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/**
 * The morning summary, or null when the shop needs nothing.
 *
 * Null is the important return value. A digest that says "nothing needs you"
 * is a notification the owner did not need, and enough of those turn the real
 * ones into noise.
 */
export function buildDigest(input: DigestInput): Digest | null {
  const lines = digestLines(input);
  if (lines.length === 0) return null;

  /*
    Fit what will be read, then say how much was left rather than cutting a
    sentence in half. "and 2 more" is a complete thought; "3 materials lo…"
    is a bug report.
  */
  const shown: DigestLine[] = [];
  let body = "";

  for (const line of lines) {
    const candidate = shown.length === 0 ? line.text : `${body} · ${line.text}`;
    const remaining = lines.length - shown.length - 1;
    const suffix = remaining > 0 ? ` · and ${remaining} more` : "";

    if (candidate.length + suffix.length > DIGEST_BODY_LIMIT && shown.length > 0) {
      break;
    }
    shown.push(line);
    body = candidate;
  }

  const hidden = lines.length - shown.length;
  if (hidden > 0) body = `${body} · and ${hidden} more`;

  const total = lines.reduce((sum, line) => sum + line.count, 0);

  return {
    title: `${total} ${plural(total, "thing needs", "things need")} you today`,
    body,
    // The Overview, because every one of these lines is a card on it.
    url: "/overview",
    lines,
  };
}

// ---------------------------------------------------------------------------
// The one thing that does not wait for the morning
// ---------------------------------------------------------------------------

export interface EnquiryAlert {
  title: string;
  body: string;
  url: string;
}

/**
 * A customer has written from the public page.
 *
 * This is the only immediate notification in the system, and it earns that
 * because there is a person at the other end of it: spec 9 exists because a
 * customer who gets no reply asks the next shop. Everything else in the
 * digest is the shop's own business and keeps until morning.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY
 * The message. A push payload is encrypted end to end, but it lands on a lock
 * screen that anyone standing near the phone can read, and a stranger's name
 * and phone number are Owner/Admin material (spec 4.3). So it says that
 * somebody wrote and nothing about who or what - the Messages screen is one
 * tap away, behind a sign-in.
 */
export function enquiryAlert(options: { waiting: number }): EnquiryAlert {
  const waiting = Math.max(1, options.waiting);

  return {
    title: "A customer has messaged the shop",
    body:
      waiting === 1
        ? "Tap to read it and reply."
        : `${waiting} messages are now waiting for a reply.`,
    url: "/enquiries",
  };
}

// ---------------------------------------------------------------------------
// When the morning is
// ---------------------------------------------------------------------------

/**
 * Is it time to send today's digest to this subscription?
 *
 * Three things have to be true, and the first is the one that matters: it has
 * not already gone out today. The cron may run more than once, be re-run by
 * hand, or be moved - and none of that should produce a second copy of the
 * same summary.
 *
 * The hour comes from the shop's own opening time, which the owner already
 * set in Settings, so nothing here is a figure anybody invented. A digest at
 * 4am would be read at 8am anyway, and read as the system being broken.
 */
export function digestIsDue(options: {
  /** The Manila date of the last digest, or null if never. */
  lastDigestOnISO: string | null;
  /** Today's Manila date. */
  todayISO: string;
  /** The Manila hour right now, 0-23. */
  manilaHour: number;
  /** "08:00" from Settings. */
  workDayStart: string;
}): boolean {
  if (options.lastDigestOnISO === options.todayISO) return false;

  const openingHour = Number(options.workDayStart.split(":")[0]);
  // An unreadable setting must not silence the shop's warnings for ever, so
  // an unparseable time falls back to sending rather than to holding.
  if (!Number.isFinite(openingHour)) return true;

  return options.manilaHour >= openingHour;
}

// ---------------------------------------------------------------------------
// A subscription that has stopped working
// ---------------------------------------------------------------------------

/**
 * What to do about a push service's answer.
 *
 * 404 and 410 are not failures to retry: they mean the browser is gone -
 * uninstalled, or the permission withdrawn. Anything else might be the push
 * service having a bad minute, and a shop's notifications should survive
 * that, so those only count towards a tally.
 *
 * `MAX_FAILURES` is deliberately generous. Switching a phone off after one
 * bad afternoon is how somebody silently stops receiving warnings and only
 * finds out weeks later.
 */
export const MAX_FAILURES = 10;

export function subscriptionVerdict(options: {
  statusCode: number | null;
  failureCount: number;
}): { keepActive: boolean; reason: string | null } {
  if (options.statusCode === 404 || options.statusCode === 410) {
    return {
      keepActive: false,
      reason: "This phone is no longer accepting notifications.",
    };
  }

  if (options.statusCode !== null && options.statusCode >= 200 && options.statusCode < 300) {
    return { keepActive: true, reason: null };
  }

  const failures = options.failureCount + 1;
  if (failures >= MAX_FAILURES) {
    return {
      keepActive: false,
      reason: `Gave up after ${failures} failed attempts.`,
    };
  }

  return {
    keepActive: true,
    reason: `Attempt failed${
      options.statusCode === null ? "" : ` (${options.statusCode})`
    }; will try again tomorrow.`,
  };
}

// ---------------------------------------------------------------------------
// Whether any of this is set up at all
// ---------------------------------------------------------------------------

export interface PushSetup {
  ready: boolean;
  /** What is missing, in the words Settings shows. */
  missing: string[];
}

/**
 * Notifications need a signing keypair the owner generates once.
 *
 * Until it exists the feature says so and offers no button, rather than
 * offering one that fails - the same rule as every figure only the owner can
 * supply. It is checked in one place so the screen and the sender cannot
 * disagree about whether the shop is set up.
 */
export function pushSetup(options: {
  publicKey: string | null | undefined;
  privateKey: string | null | undefined;
}): PushSetup {
  const missing: string[] = [];
  if (!options.publicKey?.trim()) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!options.privateKey?.trim()) missing.push("VAPID_PRIVATE_KEY");

  return { ready: missing.length === 0, missing };
}
