/**
 * Enquiries sent from the shop's public page (Phase 9).
 *
 * THIS IS THE ONE PLACE A STRANGER CAN WRITE TO THIS SYSTEM.
 *
 * Everywhere else, a write starts with somebody signed in. Here it starts with
 * whoever found the page - so the checks are in this file, tested, rather than
 * trusted to a form. A field that is too long, a missing name, a filled-in
 * honeypot and too many messages from one address in an hour are all refused
 * before anything reaches the database.
 *
 * The rules are deliberately gentle. A real customer typing on a phone with
 * one thumb should never be turned away; the limits exist to stop a script,
 * not a person.
 */
import type { DivisionId } from "./divisions";

export const ENQUIRY_LIMITS = {
  name: 80,
  contact: 80,
  message: 1000,
  heardFrom: 80,
  /** How many an address may send in an hour before the rest are refused. */
  perHour: 5,
} as const;

export interface EnquiryForm {
  name: string;
  contact: string;
  division: string;
  message: string;
  heardFrom: string;
  /**
   * A field no person ever sees, and therefore never fills in. A script
   * filling in every input gives itself away here.
   */
  honeypot: string;
}

export interface CleanEnquiry {
  name: string;
  contact: string;
  division: DivisionId | null;
  message: string;
  heardFrom: string | null;
}

export type EnquiryCheck =
  | { ok: true; enquiry: CleanEnquiry }
  /**
   * `silent` means: tell the sender it worked, and store nothing.
   *
   * Only a filled honeypot gets this. Telling a script it failed teaches it
   * what to change; telling a person it failed when it did not would be a lie,
   * and no person ever reaches this branch.
   */
  | { ok: false; silent: true }
  | { ok: false; silent: false; errors: Record<string, string> };

const DIVISIONS: DivisionId[] = ["printshoppe", "apparel", "dabztech"];

export function checkEnquiry(form: EnquiryForm): EnquiryCheck {
  if (form.honeypot.trim() !== "") {
    return { ok: false, silent: true };
  }

  const errors: Record<string, string> = {};

  const name = form.name.trim();
  if (name === "") errors.name = "Please tell us your name.";
  else if (name.length > ENQUIRY_LIMITS.name) {
    errors.name = `That is longer than ${ENQUIRY_LIMITS.name} characters.`;
  }

  const contact = form.contact.trim();
  if (contact === "") {
    errors.contact = "A phone number or email, so we can reply.";
  } else if (contact.length > ENQUIRY_LIMITS.contact) {
    errors.contact = `That is longer than ${ENQUIRY_LIMITS.contact} characters.`;
  }

  const message = form.message.trim();
  if (message === "") errors.message = "What can we help you with?";
  else if (message.length > ENQUIRY_LIMITS.message) {
    errors.message = `Please keep it under ${ENQUIRY_LIMITS.message} characters.`;
  }

  const heardFrom = form.heardFrom.trim();
  if (heardFrom.length > ENQUIRY_LIMITS.heardFrom) {
    errors.heardFrom = "That is too long.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, silent: false, errors };
  }

  const division = DIVISIONS.includes(form.division as DivisionId)
    ? (form.division as DivisionId)
    : null;

  return {
    ok: true,
    enquiry: {
      name,
      contact,
      division,
      message,
      heardFrom: heardFrom === "" ? null : heardFrom,
    },
  };
}

/**
 * Has this address sent too many already?
 *
 * Counted rather than blocked outright, because a whole office or an internet
 * café shares one address - five an hour is generous for a person and useless
 * for a script.
 */
export function isRateLimited(recentCount: number): boolean {
  return recentCount >= ENQUIRY_LIMITS.perHour;
}

// ---------------------------------------------------------------------------
// Reading them back
// ---------------------------------------------------------------------------

export const ENQUIRY_STATUSES = ["new", "replied", "closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  replied: "Replied",
  closed: "Closed",
};

export interface Enquiry {
  id: string;
  name: string;
  contact: string;
  division: DivisionId | null;
  message: string;
  heardFrom: string | null;
  status: EnquiryStatus;
  replyNote: string | null;
  createdAt: string;
  handledAt: string | null;
}

/** How many are waiting, for the Overview. */
export function unansweredCount(enquiries: readonly Enquiry[]): number {
  return enquiries.filter((enquiry) => enquiry.status === "new").length;
}

/**
 * Where enquiries said they came from, biggest first.
 *
 * This is the whole of the "Meta Ads tracking" the specification asks for that
 * can be built without a Meta app: the customer's own answer. It is worse than
 * a tracking pixel at counting, and better at telling the truth - a pixel
 * cannot tell you that somebody came because their cousin recommended you.
 */
export function heardFromCounts(
  enquiries: readonly Enquiry[],
): { source: string; count: number }[] {
  // Grouped without regard to case, but SHOWN the way the first person who
  // said it spelled it. Counting "Facebook" and "facebook" apart would be
  // wrong; printing the owner's own list back at them in lower case would just
  // look broken.
  const counts = new Map<string, { label: string; count: number }>();

  for (const enquiry of enquiries) {
    const source = (enquiry.heardFrom ?? "").trim();
    if (source === "") continue;
    const key = source.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { label: source, count: 1 });
  }

  return [...counts.values()]
    .map(({ label, count }) => ({ source: label, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
