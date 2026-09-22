/**
 * What goes in an order line: sizes, a roster, and how many pieces that is
 * (docs/spec.md 7.1).
 *
 * The rule the whole file exists for: A QUANTITY IS NEVER TYPED TWICE. A
 * roster of fifteen names IS fifteen jerseys, and a tally of sizes IS the
 * pieces. A number beside either of those is a second answer to the same
 * question, and the one the customer actually checked is the list.
 *
 * The same functions run in the browser, so the counter under the form is
 * live, and on the server, so what is stored cannot be something else. The
 * database re-derives it a third time inside `create_online_order`, because a
 * Server Action is a public endpoint and this file is not a boundary.
 */
import { SIZES, type Size } from "./types";

export function isSize(value: string): value is Size {
  return (SIZES as readonly string[]).includes(value);
}

/** What a person typed into one row of a roster, before it is cleaned up. */
export interface RosterDraft {
  playerName: string;
  playerNumber: string;
  size: string;
}

export interface CleanRosterEntry {
  playerName: string | null;
  playerNumber: string | null;
  size: Size;
}

export const ROSTER_LIMITS = {
  /** Longer than this will not fit across the back of a jersey anyway. */
  nameLength: 20,
  numberDigits: 3,
  /** More than this in one line is a mistake, not a team. */
  maxRows: 200,
} as const;

/**
 * A typed roster row, cleaned.
 *
 * A BLANK NAME AND A BLANK NUMBER ARE ALLOWED, and that is deliberate: some
 * teams hand the list in later and the shop still takes the order. The size
 * is not optional, because without it nobody knows what to cut.
 */
export function cleanRosterEntry(
  draft: RosterDraft,
): { ok: true; entry: CleanRosterEntry } | { ok: false; error: string } {
  const size = draft.size.trim().toUpperCase();
  if (!isSize(size)) {
    return { ok: false, error: "Pick a size for every player." };
  }

  const name = draft.playerName.trim().toUpperCase();
  if (name.length > ROSTER_LIMITS.nameLength) {
    return {
      ok: false,
      error: `A name on a jersey is at most ${ROSTER_LIMITS.nameLength} characters.`,
    };
  }

  const number = draft.playerNumber.trim();
  if (number !== "" && !/^\d{1,3}$/.test(number)) {
    return { ok: false, error: "A jersey number is up to three digits." };
  }

  return {
    ok: true,
    entry: {
      playerName: name === "" ? null : name,
      playerNumber: number === "" ? null : number,
      size,
    },
  };
}

/** The size tally, cleaned. Anything that is not a whole count is dropped. */
export function cleanSizes(
  typed: Record<string, string | number>,
): Partial<Record<Size, number>> {
  const sizes: Partial<Record<Size, number>> = {};

  for (const size of SIZES) {
    const raw = typed[size];
    if (raw === undefined || raw === null || raw === "") continue;
    const count = Number(raw);
    // A zero is the same as not asking for that size, so it is left out
    // rather than stored - otherwise every order would carry seven keys.
    if (!Number.isInteger(count) || count <= 0) continue;
    sizes[size] = count;
  }

  return sizes;
}

/** How a product asks for its quantity. */
export type QuantityShape = "roster" | "sizes" | "plain";

export function quantityShape(product: {
  usesRoster: boolean;
  usesSizes: boolean;
}): QuantityShape {
  // A roster asks the size per player, so it answers both questions at once.
  if (product.usesRoster) return "roster";
  if (product.usesSizes) return "sizes";
  return "plain";
}

/**
 * The pieces in a line.
 *
 * Takes all three possible answers and picks the one the product asked for,
 * rather than trusting whichever the caller filled in.
 */
export function pieceCount(
  product: { usesRoster: boolean; usesSizes: boolean },
  line: {
    roster?: readonly unknown[];
    sizes?: Partial<Record<Size, number>>;
    qty?: number;
  },
): number {
  switch (quantityShape(product)) {
    case "roster":
      return line.roster?.length ?? 0;
    case "sizes":
      return Object.values(line.sizes ?? {}).reduce(
        (total, count) => total + (count ?? 0),
        0,
      );
    default: {
      const qty = line.qty ?? 0;
      return Number.isInteger(qty) && qty > 0 ? qty : 0;
    }
  }
}

/** "S 2 · M 4 · L 3", in size order. Empty when nothing is counted. */
export function sizeSummary(sizes: Partial<Record<Size, number>>): string {
  return SIZES.filter((size) => (sizes[size] ?? 0) > 0)
    .map((size) => `${size} ${sizes[size]}`)
    .join(" · ");
}

/** The same summary, worked out from a roster instead of a tally. */
export function sizesFromRoster(
  roster: readonly { size: Size }[],
): Partial<Record<Size, number>> {
  const sizes: Partial<Record<Size, number>> = {};
  for (const entry of roster) {
    sizes[entry.size] = (sizes[entry.size] ?? 0) + 1;
  }
  return sizes;
}

/**
 * May this line go in the order?
 *
 * The message says the numbers, both of them. "Below the minimum" sends
 * somebody back to the top of the page to count; "the smallest order is 6
 * pieces and you have 4" tells them what to do next.
 */
export function checkQuantity(
  product: { name: string; minOrderQty: number; usesRoster: boolean; usesSizes: boolean },
  pieces: number,
): { ok: true } | { ok: false; error: string } {
  if (pieces < 1) {
    const what = quantityShape(product) === "roster" ? "a player" : "a quantity";
    return { ok: false, error: `Add ${what} before putting this in your order.` };
  }

  if (pieces < product.minOrderQty) {
    return {
      ok: false,
      error: `The smallest order for ${product.name} is ${product.minOrderQty} pieces. You have ${pieces}.`,
    };
  }

  if (pieces > ROSTER_LIMITS.maxRows * 10) {
    return { ok: false, error: "That is more than one order can hold. Please message us." };
  }

  return { ok: true };
}

/**
 * Every option answered, with one of the product's own choices.
 *
 * The first choice is preselected on the page, so a person cannot reach this
 * with a gap - but a cart that has been sitting in a browser since before the
 * owner edited the product can. The answer then is to send them back to the
 * product, never to store a choice nobody made.
 */
export function checkOptions(
  product: { name: string; options: readonly { name: string; choices: string[] }[] },
  chosen: Record<string, string>,
): { ok: true; options: Record<string, string> } | { ok: false; error: string } {
  const options: Record<string, string> = {};

  for (const option of product.options) {
    const value = chosen[option.name];
    if (value === undefined || !option.choices.includes(value)) {
      return {
        ok: false,
        error: `The choices for ${product.name} have changed. Please open it again and re-pick.`,
      };
    }
    options[option.name] = value;
  }

  return { ok: true, options };
}
