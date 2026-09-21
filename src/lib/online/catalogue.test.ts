import { describe, expect, it } from "vitest";

import {
  filterProducts,
  lowestPrice,
  matchesSearch,
  orderedLabel,
  parseAdminSort,
  parseShopSort,
  priceLabel,
  sortForAdmin,
  slugify,
  sortForShop,
  termsLabel,
  uniqueSlug,
  nextDesignCode,
  normaliseDesignCode,
} from "./catalogue";
import type { Product } from "./types";

function product(over: Partial<Product> & { name: string }): Product {
  return {
    id: over.name,
    categoryId: "c1",
    categoryName: "Jerseys",
    categorySlug: "jerseys",
    productionPath: "full",
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    pricingMode: "fixed",
    minOrderQty: 1,
    leadTimeDays: 7,
    usesSizes: true,
    usesRoster: false,
    usesDesignGallery: false,
    sizeChartPath: null,
    isVisible: true,
    createdAt: "2026-09-01T00:00:00Z",
    prices: [],
    options: [],
    images: [],
    orderedPieces: 0,
    orderedCount: 0,
    ...over,
  };
}

const priced = (name: string, ...amounts: number[]) =>
  product({
    name,
    prices: amounts.map((priceCentavos, index) => ({
      id: `${name}-${index}`,
      label: `V${index}`,
      priceCentavos,
      sortOrder: index,
    })),
  });

const onQuote = (name: string) => product({ name, pricingMode: "quote", prices: [] });

describe("priceLabel", () => {
  it("prints one price when there is only one", () => {
    expect(priceLabel(priced("Shirt", 15000))).toBe("₱150.00");
  });

  it("says 'from' when the variants differ", () => {
    expect(priceLabel(priced("Jersey", 45000, 52000))).toBe("from ₱450.00");
  });

  it("says a quote product is on quote rather than free", () => {
    expect(priceLabel(onQuote("Jacket"))).toBe("Price on quote");
  });

  it("treats a fixed product with no price rows as on quote, not as zero", () => {
    expect(lowestPrice(priced("Broken"))).toBeNull();
  });
});

describe("termsLabel", () => {
  it("reads the way the shop would say it", () => {
    expect(termsLabel({ minOrderQty: 6, leadTimeDays: 10 })).toBe(
      "Min 6 pcs · ready in about 10 days",
    );
  });

  it("says there is no minimum rather than 'min 1 pcs'", () => {
    expect(termsLabel({ minOrderQty: 1, leadTimeDays: 1 })).toBe(
      "No minimum · ready in about 1 day",
    );
  });
});

describe("matchesSearch", () => {
  const jersey = product({
    name: "Full sublimation jersey",
    description: "Printed all over",
  });

  it("finds it whatever the case and spacing", () => {
    expect(matchesSearch(jersey, "  JERSEY ")).toBe(true);
  });

  it("matches words in any order", () => {
    expect(matchesSearch(jersey, "jersey sublimation")).toBe(true);
  });

  it("looks in the category and the description too", () => {
    expect(matchesSearch(jersey, "jerseys")).toBe(true);
    expect(matchesSearch(jersey, "printed")).toBe(true);
  });

  it("matches everything when nothing was typed", () => {
    expect(matchesSearch(jersey, "   ")).toBe(true);
  });

  it("does not match a word that is not there", () => {
    expect(matchesSearch(jersey, "mug")).toBe(false);
  });
});

describe("sortForShop", () => {
  it("puts an unpriced product AFTER every priced one, both ways round", () => {
    /*
      A product with no price is not a cheap product. Sorting it as zero would
      put every quote item at the top of "low to high", which reads as a list
      of bargains.
    */
    const items = [onQuote("Jacket"), priced("Shirt", 15000), priced("Jersey", 45000)];

    expect(sortForShop(items, "price_low").map((p) => p.name)).toEqual([
      "Shirt",
      "Jersey",
      "Jacket",
    ]);
    expect(sortForShop(items, "price_high").map((p) => p.name)).toEqual([
      "Jersey",
      "Shirt",
      "Jacket",
    ]);
  });

  it("sorts by the lowest variant, not by the first one listed", () => {
    const items = [priced("A", 90000, 10000), priced("B", 20000)];
    expect(sortForShop(items, "price_low").map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("puts the most ordered first and breaks ties by newest", () => {
    const items = [
      product({ name: "Old favourite", orderedPieces: 27, createdAt: "2026-01-01T00:00:00Z" }),
      product({ name: "New", orderedPieces: 0, createdAt: "2026-09-10T00:00:00Z" }),
      product({ name: "Older", orderedPieces: 0, createdAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortForShop(items, "most_ordered").map((p) => p.name)).toEqual([
      "Old favourite",
      "New",
      "Older",
    ]);
  });

  it("gives the same answer twice for the same list", () => {
    const items = [priced("A", 100), priced("B", 100), priced("C", 100)];
    expect(sortForShop(items, "price_low")).toEqual(sortForShop(items, "price_low"));
  });

  it("leaves the caller's array alone", () => {
    const items = [priced("B", 200), priced("A", 100)];
    sortForShop(items, "name");
    expect(items.map((p) => p.name)).toEqual(["B", "A"]);
  });
});

describe("sortForAdmin", () => {
  const items = [
    product({ name: "A", orderedPieces: 5, createdAt: "2026-01-01T00:00:00Z" }),
    product({ name: "B", orderedPieces: 0, createdAt: "2026-09-01T00:00:00Z" }),
  ];

  it("defaults to the newest upload", () => {
    expect(sortForAdmin(items, "newest").map((p) => p.name)).toEqual(["B", "A"]);
    expect(sortForAdmin(items, "oldest").map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("can find what is NOT selling", () => {
    expect(sortForAdmin(items, "least_ordered").map((p) => p.name)).toEqual(["B", "A"]);
  });
});

describe("parseShopSort and parseAdminSort", () => {
  it("falls back to the default rather than trusting the URL", () => {
    expect(parseShopSort("nonsense")).toBe("most_ordered");
    expect(parseShopSort(null)).toBe("most_ordered");
    expect(parseShopSort("price_low")).toBe("price_low");
    expect(parseAdminSort("nonsense")).toBe("newest");
  });
});

describe("filterProducts", () => {
  const items = [
    product({ name: "Jersey", categorySlug: "jerseys" }),
    product({ name: "DTF shirt", categorySlug: "dtf-prints", categoryName: "DTF Prints" }),
    product({ name: "Odd one", categorySlug: null, categoryId: null, categoryName: null }),
  ];

  it("combines search and category", () => {
    expect(
      filterProducts(items, { search: "shirt", categorySlug: "dtf-prints" }).map((p) => p.name),
    ).toEqual(["DTF shirt"]);
  });

  it("shows everything, uncategorised included, when no chip is picked", () => {
    expect(filterProducts(items, { search: "", categorySlug: null })).toHaveLength(3);
  });

  it("does not put an uncategorised product under a category chip", () => {
    expect(
      filterProducts(items, { search: "", categorySlug: "jerseys" }).map((p) => p.name),
    ).toEqual(["Jersey"]);
  });
});

describe("orderedLabel", () => {
  it("says plainly when nothing has been ordered yet", () => {
    expect(orderedLabel({ orderedPieces: 0, orderedCount: 0 })).toBe("None yet");
  });

  it("counts pieces and orders", () => {
    expect(orderedLabel({ orderedPieces: 27, orderedCount: 2 })).toBe("27 pcs · 2 orders");
    expect(orderedLabel({ orderedPieces: 6, orderedCount: 1 })).toBe("6 pcs · 1 order");
  });
});

describe("slugify", () => {
  it("makes a name into something that survives being pasted into a chat", () => {
    expect(slugify("Full Sublimation Jersey")).toBe("full-sublimation-jersey");
  });

  it("drops punctuation rather than encoding it", () => {
    expect(slugify("Team jersey (long sleeve) — 2026!")).toBe(
      "team-jersey-long-sleeve-2026",
    );
  });

  it("folds accents down to ASCII", () => {
    expect(slugify("Camisón Niño")).toBe("camison-nino");
  });

  it("has something to say about a name that reduces to nothing", () => {
    expect(slugify("!!!")).toBe("item");
    expect(slugify("   ")).toBe("item");
  });

  it("never ends in a hyphen, even after being cut short", () => {
    expect(slugify("a".repeat(58) + " bb")).not.toMatch(/-$/);
  });
});

describe("uniqueSlug", () => {
  it("leaves a free name alone", () => {
    expect(uniqueSlug("Jersey", new Set())).toBe("jersey");
  });

  it("numbers a name that is taken", () => {
    expect(uniqueSlug("Jersey", new Set(["jersey"]))).toBe("jersey-2");
    expect(uniqueSlug("Jersey", new Set(["jersey", "jersey-2"]))).toBe("jersey-3");
  });
});

describe("nextDesignCode", () => {
  it("starts at DJ-101 on an empty gallery", () => {
    expect(nextDesignCode([])).toBe("DJ-101");
  });

  it("carries on from the highest, not from the count", () => {
    // Deleting DJ-102 must not hand its number to something else: a past
    // order still says DJ-102 on it.
    expect(nextDesignCode(["DJ-101", "DJ-104"])).toBe("DJ-105");
  });

  it("ignores a code that is not of that shape", () => {
    expect(nextDesignCode(["SPECIAL", "DJ-101"])).toBe("DJ-102");
  });
});

describe("normaliseDesignCode", () => {
  it("stores what a person typed the way the database wants it", () => {
    expect(normaliseDesignCode("  dj 205 ")).toBe("DJ-205");
  });
});
