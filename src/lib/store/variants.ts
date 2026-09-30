import type { Availability, StoreVariant } from "./types";

/**
 * Choosing a size and a colour.
 *
 * A product's variants are ONE of three shapes - every row a size, every row
 * a colour, or every row a size-and-colour pair - and the admin screen keeps
 * it that way. These helpers read any of them, so the same product page
 * serves a jersey (sizes) and a jacket (sizes in colours).
 */
export interface ColorOption {
  name: string;
  hex: string | null;
}

export function sizeOptions(variants: readonly StoreVariant[]): string[] {
  return [...new Set(variants.map((v) => v.size).filter((s): s is string => s !== null))];
}

export function colorOptions(variants: readonly StoreVariant[]): ColorOption[] {
  const seen = new Map<string, ColorOption>();
  for (const v of variants) {
    if (v.color !== null && !seen.has(v.color)) {
      seen.set(v.color, { name: v.color, hex: v.colorHex });
    }
  }
  return [...seen.values()];
}

/** The variant for a choice; null when the pair does not exist. */
export function findVariant(
  variants: readonly StoreVariant[],
  size: string | null,
  color: string | null,
): StoreVariant | null {
  return variants.find((v) => v.size === size && v.color === color) ?? null;
}

/**
 * Whether a size (or colour) can be bought at all: false only when every
 * variant that carries it is out of stock. An untracked variant is made to
 * order and is always available.
 */
export function optionAvailable(
  variants: readonly StoreVariant[],
  axis: "size" | "color",
  value: string,
): boolean {
  const matching = variants.filter((v) => v[axis] === value);
  if (matching.length === 0) return false;
  return matching.some((v) => v.availability !== "out");
}

export function availabilityText(availability: Availability | null): string | null {
  if (availability === "low") return "Low stock";
  if (availability === "out") return "Sold out";
  return null;
}
