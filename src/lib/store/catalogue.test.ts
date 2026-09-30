import { describe, expect, it } from "vitest";

import {
  REQUEST_QUOTE,
  badgesFor,
  bulkHint,
  cleanSearchTerm,
  filterProducts,
  isNew,
  parseSort,
  priceLabel,
  productAvailability,
  pushRecent,
  rankSuggestions,
  relatedProducts,
  sortProducts,
  totalFor,
  unitPriceFor,
} from "./catalogue";
import type { StoreProduct, StoreVariant } from "./types";

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: "p1",
    slug: "plain-shirt",
    name: "Plain shirt",
    description: null,
    categoryId: "c1",
    categoryName: "Shirts",
    categorySlug: "shirts",
    pricingMode: "fixed",
    basePriceCentavos: 25000,
    minOrderQty: 1,
    createdAt: "2026-09-01T00:00:00Z",
    photos: [],
    tiers: [],
    sizeSurcharges: {},
    variants: [],
    sizeChart: null,
    ...overrides,
  };
}

const variant = (availability: StoreVariant["availability"]): StoreVariant => ({
  id: Math.random().toString(),
  size: "M",
  color: null,
  colorHex: null,
  availability,
});

describe("unitPriceFor", () => {
  const tiered = product({
    tiers: [
      { minQty: 10, unitPriceCentavos: 22000 },
      { minQty: 20, unitPriceCentavos: 20000 },
    ],
    sizeSurcharges: { "2XL": 5000 },
  });

  it("charges the base price below the first tier", () => {
    expect(unitPriceFor(tiered, 9)).toBe(25000);
  });

  it("takes the highest tier the quantity reaches", () => {
    expect(unitPriceFor(tiered, 10)).toBe(22000);
    expect(unitPriceFor(tiered, 19)).toBe(22000);
    expect(unitPriceFor(tiered, 20)).toBe(20000);
    expect(unitPriceFor(tiered, 500)).toBe(20000);
  });

  it("adds a size's surcharge on top of the tier price", () => {
    expect(unitPriceFor(tiered, 10, "2XL")).toBe(27000);
    expect(unitPriceFor(tiered, 1, "2XL")).toBe(30000);
    expect(unitPriceFor(tiered, 1, "M")).toBe(25000);
  });

  it("does not depend on the order the tiers were stored in", () => {
    const shuffled = product({ tiers: [...tiered.tiers].reverse() });
    expect(unitPriceFor(shuffled, 25)).toBe(20000);
  });

  it("has no price for a quote-only product, at any quantity", () => {
    const quote = product({ pricingMode: "quote", basePriceCentavos: null });
    expect(unitPriceFor(quote, 1)).toBeNull();
    expect(unitPriceFor(quote, 50, "XL")).toBeNull();
    expect(totalFor(quote, 5)).toBeNull();
  });
});

describe("totalFor", () => {
  it("multiplies in whole centavos", () => {
    const p = product({ basePriceCentavos: 19999 });
    expect(totalFor(p, 3)).toBe(59997);
  });

  it("prices the whole order at the tier it reaches", () => {
    const p = product({ tiers: [{ minQty: 10, unitPriceCentavos: 22000 }] });
    expect(totalFor(p, 12)).toBe(264000);
  });
});

describe("priceLabel and bulkHint", () => {
  it("shows the peso price with its centavos", () => {
    expect(priceLabel(product())).toBe("₱250.00");
  });

  it("never shows a price for a quote-only product", () => {
    const quote = product({ pricingMode: "quote", basePriceCentavos: null });
    expect(priceLabel(quote)).toBe(REQUEST_QUOTE);
    expect(bulkHint(quote)).toBeNull();
  });

  it("hints at the cheapest tier", () => {
    const p = product({
      tiers: [
        { minQty: 10, unitPriceCentavos: 22000 },
        { minQty: 20, unitPriceCentavos: 20000 },
      ],
    });
    expect(bulkHint(p)).toBe("₱200.00 for 20+");
    expect(bulkHint(product())).toBeNull();
  });
});

describe("productAvailability", () => {
  it("is in stock for a made-to-order product with no variants", () => {
    expect(productAvailability([])).toBe("in_stock");
  });

  it("is in stock when any size is plentiful, or untracked", () => {
    expect(productAvailability([variant("out"), variant("in_stock")])).toBe("in_stock");
    expect(productAvailability([variant("low"), variant(null)])).toBe("in_stock");
  });

  it("is low only when everything that can be bought is running low", () => {
    expect(productAvailability([variant("low"), variant("out")])).toBe("low");
    expect(productAvailability([variant("low"), variant("low")])).toBe("low");
  });

  it("is sold out when every variant is out", () => {
    expect(productAvailability([variant("out"), variant("out")])).toBe("out");
  });
});

describe("isNew and badgesFor", () => {
  const now = new Date("2026-09-30T00:00:00Z");

  it("is new for two weeks", () => {
    expect(isNew("2026-09-20T00:00:00Z", now)).toBe(true);
    expect(isNew("2026-09-16T00:00:00Z", now)).toBe(false);
  });

  it("is never new from the future, or from garbage", () => {
    expect(isNew("2026-10-05T00:00:00Z", now)).toBe(false);
    expect(isNew("not a date", now)).toBe(false);
  });

  it("badges a new product that is low on stock", () => {
    const p = product({ createdAt: "2026-09-25T00:00:00Z", variants: [variant("low")] });
    expect(badgesFor(p, now)).toEqual(["low", "new"]);
  });

  it("shows sold out instead of low, and nothing for a quiet product", () => {
    expect(badgesFor(product({ variants: [variant("out")] }), now)).toEqual(["out"]);
    expect(badgesFor(product(), now)).toEqual([]);
  });
});

describe("sortProducts", () => {
  const cheap = product({ id: "a", name: "A", basePriceCentavos: 10000, createdAt: "2026-09-01T00:00:00Z" });
  const dear = product({ id: "b", name: "B", basePriceCentavos: 90000, createdAt: "2026-09-03T00:00:00Z" });
  const quote = product({
    id: "c",
    name: "C",
    pricingMode: "quote",
    basePriceCentavos: null,
    createdAt: "2026-09-02T00:00:00Z",
  });

  it("puts the newest first", () => {
    expect(sortProducts([cheap, dear, quote], "newest").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("puts a quote-only product last in BOTH price orders", () => {
    expect(sortProducts([quote, dear, cheap], "price_low").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(sortProducts([quote, cheap, dear], "price_high").map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("does not change the list it was given", () => {
    const list = [dear, cheap];
    sortProducts(list, "price_low");
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("falls back to newest for anything it does not know", () => {
    expect(parseSort("rating")).toBe("newest");
    expect(parseSort(undefined)).toBe("newest");
    expect(parseSort(["price_low", "x"])).toBe("price_low");
  });
});

describe("filterProducts", () => {
  const jersey = product({ id: "j", name: "Full sublimation jersey", categorySlug: "sublimation-jerseys", categoryName: "Sublimation jerseys" });
  const shirt = product({ id: "s", name: "Plain shirt", description: "Cotton, round neck" });
  const list = [jersey, shirt];

  it("filters by category", () => {
    expect(filterProducts(list, { categorySlug: "shirts" }).map((p) => p.id)).toEqual(["s"]);
  });

  it("searches name, category and description, ignoring case", () => {
    expect(filterProducts(list, { search: "JERSEY" }).map((p) => p.id)).toEqual(["j"]);
    expect(filterProducts(list, { search: "cotton" }).map((p) => p.id)).toEqual(["s"]);
    expect(filterProducts(list, { search: "sublimation jerseys" }).map((p) => p.id)).toEqual(["j"]);
  });

  it("treats a wildcard as nothing, not as everything", () => {
    expect(filterProducts(list, { search: "%" })).toHaveLength(2);
    expect(filterProducts(list, { search: "%zzz" })).toHaveLength(0);
  });
});

describe("search terms", () => {
  it("strips wildcards and caps the length", () => {
    expect(cleanSearchTerm("  50%_off,  (jersey) ")).toBe("50 off jersey");
    expect(cleanSearchTerm("x".repeat(100))).toHaveLength(40);
  });

  it("suggests prefix matches first, once each", () => {
    const names = ["Long sleeves jersey", "Jersey pro", "Jersey pro", "Basketball jersey", "Jacket"];
    expect(rankSuggestions(names, "jers", 6)).toEqual([
      "Jersey pro",
      "Basketball jersey",
      "Long sleeves jersey",
    ]);
  });

  it("does not suggest from a single letter, and honours the limit", () => {
    expect(rankSuggestions(["Jersey"], "j", 6)).toEqual([]);
    expect(rankSuggestions(["Jersey a", "Jersey b", "Jersey c"], "jersey", 2)).toHaveLength(2);
  });
});

describe("recently viewed and related", () => {
  it("moves a repeat to the front and keeps the list short", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });

  it("offers the same category, never the product itself", () => {
    const a = product({ id: "a", categoryId: "c1" });
    const b = product({ id: "b", categoryId: "c1" });
    const c = product({ id: "c", categoryId: "c2" });
    expect(relatedProducts([a, b, c], a).map((p) => p.id)).toEqual(["b"]);
  });

  it("offers nothing for a product with no category", () => {
    const a = product({ id: "a", categoryId: null });
    const b = product({ id: "b", categoryId: null });
    expect(relatedProducts([a, b], a)).toEqual([]);
  });
});
