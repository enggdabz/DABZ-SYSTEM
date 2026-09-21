import { describe, expect, it } from "vitest";

import {
  checkOptions,
  checkQuantity,
  cleanRosterEntry,
  cleanSizes,
  pieceCount,
  quantityShape,
  sizeSummary,
  sizesFromRoster,
} from "./items";

const roster = { usesRoster: true, usesSizes: true };
const perSize = { usesRoster: false, usesSizes: true };
const plain = { usesRoster: false, usesSizes: false };

describe("quantityShape", () => {
  it("asks for a roster when the product is a team product", () => {
    expect(quantityShape(roster)).toBe("roster");
  });

  it("asks per size when it is not", () => {
    expect(quantityShape(perSize)).toBe("sizes");
  });

  it("asks for a plain number when it wants neither", () => {
    expect(quantityShape(plain)).toBe("plain");
  });
});

describe("pieceCount", () => {
  /*
    The rule the whole module exists for. A typed quantity beside a name list
    is a second answer to the same question, and the names are the one the
    customer checked.
  */
  it("counts the roster and ignores a typed quantity beside it", () => {
    expect(
      pieceCount(roster, {
        roster: [{}, {}, {}],
        qty: 999,
        sizes: { M: 40 },
      }),
    ).toBe(3);
  });

  it("adds up the size tally for a product with no roster", () => {
    expect(pieceCount(perSize, { sizes: { S: 2, M: 4, L: 3 }, qty: 999 })).toBe(9);
  });

  it("takes the typed number only when nothing else was asked", () => {
    expect(pieceCount(plain, { qty: 12, sizes: { M: 4 } })).toBe(12);
  });

  it("is zero, not NaN, when nothing has been filled in", () => {
    expect(pieceCount(roster, {})).toBe(0);
    expect(pieceCount(perSize, {})).toBe(0);
    expect(pieceCount(plain, {})).toBe(0);
  });

  it("refuses a typed quantity that is not a whole count", () => {
    expect(pieceCount(plain, { qty: 2.5 })).toBe(0);
    expect(pieceCount(plain, { qty: -4 })).toBe(0);
  });
});

describe("cleanSizes", () => {
  it("keeps whole counts and drops everything else", () => {
    expect(cleanSizes({ S: "2", M: 4, L: "", XL: "0", "2XL": "x" })).toEqual({
      S: 2,
      M: 4,
    });
  });

  it("ignores a size the shop does not sell", () => {
    expect(cleanSizes({ "4XL": "3", M: "1" })).toEqual({ M: 1 });
  });
});

describe("cleanRosterEntry", () => {
  it("upper-cases and trims a name", () => {
    const result = cleanRosterEntry({ playerName: "  dela cruz ", playerNumber: "7", size: "m" });
    expect(result).toEqual({
      ok: true,
      entry: { playerName: "DELA CRUZ", playerNumber: "7", size: "M" },
    });
  });

  it("allows a blank name and a blank number, because some teams decide later", () => {
    const result = cleanRosterEntry({ playerName: "  ", playerNumber: "", size: "L" });
    expect(result).toEqual({
      ok: true,
      entry: { playerName: null, playerNumber: null, size: "L" },
    });
  });

  it("does not allow a missing size - without it nobody knows what to cut", () => {
    expect(cleanRosterEntry({ playerName: "A", playerNumber: "", size: "" }).ok).toBe(false);
  });

  it("refuses a name longer than fits across a jersey", () => {
    const result = cleanRosterEntry({
      playerName: "A".repeat(21),
      playerNumber: "",
      size: "M",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a number that is not one to three digits", () => {
    expect(cleanRosterEntry({ playerName: "A", playerNumber: "1234", size: "M" }).ok).toBe(false);
    expect(cleanRosterEntry({ playerName: "A", playerNumber: "7a", size: "M" }).ok).toBe(false);
  });
});

describe("checkQuantity", () => {
  const product = { name: "Full sublimation jersey", minOrderQty: 6, ...roster };

  it("accepts an order at the minimum", () => {
    expect(checkQuantity(product, 6)).toEqual({ ok: true });
  });

  it("says both numbers when the order is short", () => {
    const result = checkQuantity(product, 4);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("6 pieces");
      expect(result.error).toContain("You have 4");
    }
  });

  it("asks for a player, not a quantity, on a team product", () => {
    const result = checkQuantity(product, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("a player");
  });

  it("asks for a quantity on a product with no roster", () => {
    const result = checkQuantity({ name: "Shirt", minOrderQty: 1, ...plain }, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("a quantity");
  });
});

describe("sizeSummary", () => {
  it("reads in size order, not in the order they were typed", () => {
    expect(sizeSummary({ L: 3, S: 2, M: 4 })).toBe("S 2 · M 4 · L 3");
  });

  it("is empty when nothing is counted", () => {
    expect(sizeSummary({})).toBe("");
  });
});

describe("sizesFromRoster", () => {
  it("tallies the sizes a team asked for", () => {
    expect(
      sizesFromRoster([{ size: "M" }, { size: "L" }, { size: "M" }]),
    ).toEqual({ M: 2, L: 1 });
  });
});

describe("checkOptions", () => {
  const product = {
    name: "Jersey",
    options: [{ name: "Collar", choices: ["Round", "V-neck"] }],
  };

  it("accepts one of the product's own choices", () => {
    expect(checkOptions(product, { Collar: "V-neck" })).toEqual({
      ok: true,
      options: { Collar: "V-neck" },
    });
  });

  it("refuses a choice the product does not offer", () => {
    expect(checkOptions(product, { Collar: "Mandarin" }).ok).toBe(false);
  });

  it("refuses a missing answer rather than picking one", () => {
    // A cart that sat in a browser while the owner edited the product.
    expect(checkOptions(product, {}).ok).toBe(false);
  });

  it("drops anything the product never asked about", () => {
    expect(checkOptions(product, { Collar: "Round", Sneaky: "yes" })).toEqual({
      ok: true,
      options: { Collar: "Round" },
    });
  });
});
