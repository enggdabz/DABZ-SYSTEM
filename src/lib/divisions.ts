/**
 * The three Dabz divisions (spec 1.1).
 *
 * Every sale, expense, stock item and report is tagged with one of these, so
 * the list lives in one place and screens read from it rather than hardcoding
 * names. "Whole shop" is included because shared costs are tagged that way
 * (spec 1.1 and 11) - it is a valid expense tag, but not a division you can
 * sell from.
 */

export const DIVISION_IDS = ["printshoppe", "apparel", "dabztech"] as const;
export type DivisionId = (typeof DIVISION_IDS)[number];

/** Expenses may also be tagged to the whole shop, not just one division. */
export type ExpenseTag = DivisionId | "whole_shop";

export interface Division {
  id: DivisionId;
  name: string;
  tagline: string | null;
  /** What this division sells, in the owner's words. */
  offers: string[];
  /** Plain-language note on how this division shows up in the interface. */
  brandNote: string;
  /** Colour used only for small tags and accents, never for whole screens. */
  tagColor: string;
}

export const DIVISIONS: Record<DivisionId, Division> = {
  printshoppe: {
    id: "printshoppe",
    name: "Dabz Printshoppe",
    tagline: null,
    offers: [
      "Document printing",
      "Photocopy",
      "Lamination",
      "Tarpaulin printing",
      "Stickers",
      "Mugs and souvenirs",
      "Other print jobs",
    ],
    brandNote: "Red",
    tagColor: "var(--dabz-red)",
  },
  apparel: {
    id: "apparel",
    name: "Dabz Apparel",
    tagline: "Your Jersey Market!",
    offers: [
      "Sublimation jerseys",
      "Shirts",
      "Jackets",
      "Long sleeves",
      "DTF process prints",
    ],
    brandNote: "Yellow-gold, small tags only",
    tagColor: "var(--apparel-gold)",
  },
  dabztech: {
    id: "dabztech",
    name: "DabzTech Solutions",
    tagline: "The Fix That Lasts",
    offers: [
      "Epson printer repair (Epson only)",
      "Laptop repair",
      "Desktop PC repair",
    ],
    brandNote: "Red and white",
    tagColor: "var(--dabz-red)",
  },
};

export const DIVISION_LIST: Division[] = DIVISION_IDS.map((id) => DIVISIONS[id]);

export function divisionName(id: ExpenseTag): string {
  return id === "whole_shop" ? "Whole shop" : DIVISIONS[id].name;
}
