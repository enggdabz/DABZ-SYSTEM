import { describe, expect, it } from "vitest";

import { toCard } from "./card";
import type { StoreProduct } from "./types";

const base: StoreProduct = {
  id: "p1",
  slug: "jacket",
  name: "Custom jacket",
  description: null,
  categoryId: "c",
  categoryName: "Jackets",
  categorySlug: "jackets",
  pricingMode: "quote",
  basePriceCentavos: null,
  minOrderQty: 1,
  createdAt: "2020-01-01T00:00:00Z",
  photos: [{ path: "a/b c.jpg", alt: null }],
  tiers: [],
  sizeSurcharges: {},
  variants: [],
  sizeChart: null,
};

describe("toCard", () => {
  it("carries no price for a quote-only product, only the words", () => {
    const card = toCard(base, new Date("2026-09-30"), (p) => (p ? `/img/${p}` : null));
    expect(card.price).toBe("Request quote");
    expect(card.isQuote).toBe(true);
    expect(card.bulk).toBeNull();
    expect(JSON.stringify(card)).not.toMatch(/\d{3,}\.\d{2}/);
  });

  it("resolves the first photo and falls back to the name for its alt text", () => {
    const card = toCard(base, new Date("2026-09-30"), (p) => (p ? `/img/${p}` : null));
    expect(card.imageUrl).toBe("/img/a/b c.jpg");
    expect(card.imageAlt).toBe("Custom jacket");
  });

  it("asks for no picture when the product has no photo", () => {
    const card = toCard({ ...base, photos: [] }, new Date("2026-09-30"), (p) => (p ? "x" : null));
    expect(card.imageUrl).toBeNull();
  });
});
