/**
 * Dates and times for the Dabz system.
 *
 * Rule from spec 2.1: timestamps are STORED in UTC and DISPLAYED in
 * Asia/Manila. Storing in UTC means the numbers never shift; formatting in
 * Manila time means the owner reads the time they actually experienced.
 */

export const SHOP_TIMEZONE = "Asia/Manila";

/** "18 Sep 2026, 1:40 PM" in Manila time. */
export function formatManilaDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: SHOP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "18 Sep 2026" in Manila time. */
export function formatManilaDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: SHOP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
