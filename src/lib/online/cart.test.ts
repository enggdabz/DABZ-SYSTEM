import { describe, expect, it } from "vitest";

import {
  cartPieces,
  cartPreview,
  cartToOrderItems,
  parseCart,
  serialiseCart,
  newCartKey,
  type CartItem,
} from "./cart";

function item(over: Partial<CartItem> = {}): CartItem {
  return {
    key: "k1",
    productId: "p1",
    productSlug: "jersey",
    productName: "Jersey",
    categoryName: "Jerseys",
    pricingMode: "fixed",
    variantLabel: "Standard",
    unitPriceCentavos: 45000,
    options: { Collar: "Round" },
    qty: 6,
    sizes: {},
    roster: [],
    designId: null,
    designCode: null,
    designName: null,
    designImagePath: null,
    teamColors: null,
    notes: null,
    file: null,
    imagePath: null,
    ...over,
  };
}

describe("parseCart", () => {
  it("reads back what it wrote", () => {
    const cart = [item(), item({ key: "k2", productId: "p2" })];
    expect(parseCart(serialiseCart(cart))).toEqual(cart);
  });

  it("is empty rather than broken when storage says nothing", () => {
    expect(parseCart(null)).toEqual([]);
    expect(parseCart("")).toEqual([]);
  });

  it("is empty rather than broken when storage says nonsense", () => {
    /*
      Private browsing, cleared data, a half-written value, or another tab of
      an older version. A shop that white-screens over any of those is a shop
      with no orders.
    */
    expect(parseCart("{oh no")).toEqual([]);
    expect(parseCart('"a string"')).toEqual([]);
    expect(parseCart("42")).toEqual([]);
  });

  it("drops a line that could not be ordered anyway", () => {
    const raw = JSON.stringify([
      item(),
      { key: "k2", productName: "No id", qty: 2 },
      { key: "k3", productId: "p3", productName: "No quantity", qty: 0 },
    ]);
    expect(parseCart(raw)).toHaveLength(1);
  });

  it("will not carry an unbounded number of lines", () => {
    const raw = JSON.stringify(
      Array.from({ length: 200 }, (_, index) => item({ key: `k${index}` })),
    );
    expect(parseCart(raw)).toHaveLength(50);
  });
});

describe("cartPieces and cartPreview", () => {
  it("counts the pieces across the order", () => {
    expect(cartPieces([item({ qty: 6 }), item({ key: "k2", qty: 2 })])).toBe(8);
  });

  it("adds up only what has a price, and says the rest is still to be quoted", () => {
    const preview = cartPreview([
      item({ qty: 6, unitPriceCentavos: 45000 }),
      item({ key: "k2", pricingMode: "quote", unitPriceCentavos: null, qty: 2 }),
    ]);
    expect(preview.fixedTotalCentavos).toBe(270000);
    expect(preview.hasQuoteItems).toBe(true);
    expect(preview.pieces).toBe(8);
  });
});

describe("cartToOrderItems", () => {
  it("sends ids and choices, and NOT one price", () => {
    /*
      The rule the module is built around. The server re-reads every price out
      of the database, so a cart that has sat in a phone since before a price
      changed quotes the new price rather than the old one.
    */
    const sent = cartToOrderItems([item()]);
    expect(sent[0]).toEqual({
      product_id: "p1",
      variant_label: "Standard",
      options: { Collar: "Round" },
      qty: 6,
      sizes: {},
      roster: [],
      design_id: null,
      team_colors: null,
      notes: null,
      files: [],
    });
    expect(JSON.stringify(sent)).not.toContain("45000");
  });

  it("passes the roster through in the shape the database function wants", () => {
    const sent = cartToOrderItems([
      item({
        roster: [
          { playerName: "RAMOS", playerNumber: "7", size: "M" },
          { playerName: null, playerNumber: null, size: "L" },
        ],
      }),
    ]);
    expect(sent[0].roster).toEqual([
      { player_name: "RAMOS", player_number: "7", size: "M" },
      { player_name: null, player_number: null, size: "L" },
    ]);
  });

  it("sends the one attached file, or none", () => {
    const withFile = cartToOrderItems([
      item({
        file: {
          storagePath: "tmp/abc/logo.png",
          originalName: "logo.png",
          mimeType: "image/png",
          sizeBytes: 1234,
        },
      }),
    ]);
    expect(withFile[0].files).toHaveLength(1);
    expect(cartToOrderItems([item()])[0].files).toEqual([]);
  });
});

describe("newCartKey", () => {
  it("does not collide with itself", () => {
    const keys = new Set(Array.from({ length: 500 }, () => newCartKey()));
    expect(keys.size).toBe(500);
  });
});
