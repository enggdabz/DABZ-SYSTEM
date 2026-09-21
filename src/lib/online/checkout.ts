/**
 * Checking what a customer typed (docs/spec.md 7.1, 12).
 *
 * This is the second place in the system where a stranger writes, so the
 * checks live here, tested, rather than in a form. Everything is capped,
 * everything is trimmed, and a filled honeypot is thanked and thrown away.
 *
 * The limits are deliberately generous. A real customer typing on a phone
 * with one thumb must never be turned away; the caps exist to stop a script.
 *
 * NONE OF THIS IS THE BOUNDARY. `create_online_order` checks the number, the
 * date, the address and every price again inside the database, because a
 * Server Action is a public endpoint. What this adds is a sentence a person
 * can act on instead of a database error.
 */
import { addDays, compareCivilDates, parseISODate, type CivilDate } from "@/lib/period";

import type { FulfilMethod } from "./types";

export const CHECKOUT_LIMITS = {
  name: 80,
  facebookName: 80,
  address: 200,
  notes: 500,
  itemNotes: 300,
  teamColors: 120,
  /** Orders one address may place in an hour before the rest are refused. */
  perHour: 5,
  /** Track lookups one address may make in ten minutes. */
  trackPerTenMinutes: 10,
} as const;

/** Eleven digits starting 09 (docs/spec.md 7.1). */
export const MOBILE_PATTERN = /^09\d{9}$/;

/**
 * What a person typed, tidied into what can be stored.
 *
 * Spaces and dashes come out of a phone number - "0917 555 0000" is the same
 * number as "09175550000" and a customer should not have to know which the
 * form wants.
 */
export function normaliseMobile(input: string): string {
  return input.replace(/[\s()-]/g, "");
}

export interface CheckoutForm {
  customerName: string;
  mobile: string;
  facebookName: string;
  method: string;
  address: string;
  dateNeeded: string;
  notes: string;
  /** A field no person ever sees, and therefore never fills in. */
  honeypot: string;
}

export interface CleanCheckout {
  customerName: string;
  mobile: string;
  facebookName: string | null;
  method: FulfilMethod;
  address: string | null;
  dateNeeded: string;
  notes: string | null;
}

export type CheckoutCheck =
  | { ok: true; checkout: CleanCheckout }
  /** Tell them it worked and store nothing. Only a filled honeypot gets this. */
  | { ok: false; silent: true }
  | { ok: false; silent: false; errors: Record<string, string> };

export function checkCheckout(
  form: CheckoutForm,
  options: { today: CivilDate; minDaysAhead: number },
): CheckoutCheck {
  if (form.honeypot.trim() !== "") {
    return { ok: false, silent: true };
  }

  const errors: Record<string, string> = {};

  const customerName = form.customerName.trim();
  if (customerName === "") {
    errors.customerName = "Please tell us your name, or your team's name.";
  } else if (customerName.length > CHECKOUT_LIMITS.name) {
    errors.customerName = `That is longer than ${CHECKOUT_LIMITS.name} characters.`;
  }

  const mobile = normaliseMobile(form.mobile);
  if (mobile === "") {
    errors.mobile = "We need a mobile number so we can reach you.";
  } else if (!MOBILE_PATTERN.test(mobile)) {
    errors.mobile = "A mobile number is eleven digits starting 09, like 09171234567.";
  }

  const facebookName = form.facebookName.trim();
  if (facebookName.length > CHECKOUT_LIMITS.facebookName) {
    errors.facebookName = "That is too long.";
  }

  const method: FulfilMethod | null =
    form.method === "pickup" || form.method === "delivery" ? form.method : null;
  if (method === null) {
    errors.method = "Choose whether you will pick it up or we deliver.";
  }

  const address = form.address.trim();
  // Pickup does not need one, and asking for it anyway is how a form gets
  // abandoned halfway.
  if (method === "delivery" && address === "") {
    errors.address = "Where should we deliver it?";
  } else if (address.length > CHECKOUT_LIMITS.address) {
    errors.address = `That is longer than ${CHECKOUT_LIMITS.address} characters.`;
  }

  const dateNeeded = parseISODate(form.dateNeeded.trim());
  if (dateNeeded === null) {
    errors.dateNeeded = "Pick the date you need it by.";
  } else {
    const earliest = addDays(options.today, Math.max(0, options.minDaysAhead));
    if (compareCivilDates(dateNeeded, earliest) < 0) {
      errors.dateNeeded =
        options.minDaysAhead === 0
          ? "Please pick today or a later date."
          : `The soonest we can take is ${options.minDaysAhead} day${
              options.minDaysAhead === 1 ? "" : "s"
            } from today.`;
    }
  }

  const notes = form.notes.trim();
  if (notes.length > CHECKOUT_LIMITS.notes) {
    errors.notes = `Please keep it under ${CHECKOUT_LIMITS.notes} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, silent: false, errors };
  }

  return {
    ok: true,
    checkout: {
      customerName,
      mobile,
      facebookName: facebookName === "" ? null : facebookName,
      method: method as FulfilMethod,
      // A box somebody opened and left blank is not an address of no
      // characters; it is no address.
      address: address === "" ? null : address,
      dateNeeded: form.dateNeeded.trim(),
      notes: notes === "" ? null : notes,
    },
  };
}

/** Has this address ordered too many already? */
export function isOrderRateLimited(recentCount: number): boolean {
  return recentCount >= CHECKOUT_LIMITS.perHour;
}

export function isTrackRateLimited(recentCount: number): boolean {
  return recentCount >= CHECKOUT_LIMITS.trackPerTenMinutes;
}

/**
 * The earliest date the date box may offer.
 *
 * Used for the `min` attribute as well as the check, so the picker cannot
 * offer a date the form will then refuse.
 */
export function earliestDateNeeded(today: CivilDate, minDaysAhead: number): CivilDate {
  return addDays(today, Math.max(0, minDaysAhead));
}

/**
 * Tracking an order: BOTH the number and the mobile, or nothing.
 *
 * The refusal is one sentence whatever went wrong, because a message that
 * distinguished "no such order" from "wrong number" would be a way to find out
 * which order numbers exist, one guess at a time.
 */
export const TRACK_NOT_FOUND =
  "We could not find that order. Check the order number and the mobile number you used when ordering.";

export function normaliseOrderNo(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  // "42", "0042" and "da-0042" are all the same order to the person typing.
  const digits = /^(?:DA-?)?(\d{1,8})$/.exec(cleaned);
  if (digits) return `DA-${digits[1].padStart(4, "0")}`;
  return cleaned;
}
