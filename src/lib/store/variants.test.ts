import { describe, expect, it } from "vitest";

import {
  availabilityText,
  colorOptions,
  findVariant,
  optionAvailable,
  sizeOptions,
} from "./variants";
import type { StoreVariant } from "./types";

const v = (
  size: string | null,
  color: string | null,
  availability: StoreVariant["availability"] = null,
  colorHex: string | null = null,
): StoreVariant => ({ id: `${size}-${color}`, size, color, colorHex, availability });

describe("options", () => {
  const jacket = [v("M", "Black", null, "#000000"), v("L", "Black"), v("M", "Red", null, "#d10a0a")];

  it("lists each size and each colour once, in the order stored", () => {
    expect(sizeOptions(jacket)).toEqual(["M", "L"]);
    expect(colorOptions(jacket)).toEqual([
      { name: "Black", hex: "#000000" },
      { name: "Red", hex: "#d10a0a" },
    ]);
  });

  it("has no colours for a product sold by size alone", () => {
    expect(colorOptions([v("S", null), v("M", null)])).toEqual([]);
  });
});

describe("findVariant", () => {
  it("matches the exact pair, and nothing when the pair does not exist", () => {
    const list = [v("M", "Black"), v("L", "Red")];
    expect(findVariant(list, "M", "Black")?.id).toBe("M-Black");
    expect(findVariant(list, "M", "Red")).toBeNull();
    expect(findVariant([v("S", null)], "S", null)?.id).toBe("S-null");
  });
});

describe("optionAvailable", () => {
  it("is false only when every variant with that size is out", () => {
    const list = [v("M", "Black", "out"), v("M", "Red", "in_stock"), v("L", "Black", "out")];
    expect(optionAvailable(list, "size", "M")).toBe(true);
    expect(optionAvailable(list, "size", "L")).toBe(false);
  });

  it("treats an untracked variant as always available, and an unknown value as not", () => {
    expect(optionAvailable([v("M", null, null)], "size", "M")).toBe(true);
    expect(optionAvailable([v("M", null)], "size", "XL")).toBe(false);
  });
});

describe("availabilityText", () => {
  it("says something only when there is something to say", () => {
    expect(availabilityText("low")).toBe("Low stock");
    expect(availabilityText("out")).toBe("Sold out");
    expect(availabilityText("in_stock")).toBeNull();
    expect(availabilityText(null)).toBeNull();
  });
});
