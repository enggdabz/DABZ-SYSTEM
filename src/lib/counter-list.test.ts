import { describe, expect, it } from "vitest";

import {
  MAX_QUANTITY,
  checkNewProduct,
  cleanQuantity,
  listSale,
  moveId,
  quantityOf,
  reconcileProducts,
  rowPrice,
  type ListProduct,
} from "./counter-list";
import { computeSale } from "./pos";
import { centreSquare, photoFileProblem, PHOTO_MAX_BYTES } from "./product-photo";

function product(overrides: Partial<ListProduct> = {}): ListProduct {
  return {
    id: "id-photo",
    name: "ID PHOTO PACKAGE",
    division: "printshoppe",
    priceCentavos: 5000,
    incomeCategory: "other_print_jobs",
    tiers: [],
    ...overrides,
  };
}

const ID_PHOTO = product();
const PRINT_BW = product({ id: "print-bw", name: "Print (Black & White)", priceCentavos: 300 });
const XEROX = product({ id: "xerox", name: "Xerox", priceCentavos: 300 });

describe("cleanQuantity", () => {
  it("keeps whole numbers", () => {
    expect(cleanQuantity("12")).toBe("12");
  });

  it("cannot hold a negative or a decimal", () => {
    expect(cleanQuantity("-3")).toBe("3");
    expect(cleanQuantity("2.5")).toBe("25");
    expect(cleanQuantity("1e3")).toBe("13");
  });

  it("reads zero, and nothing, as empty", () => {
    expect(cleanQuantity("0")).toBe("");
    expect(cleanQuantity("000")).toBe("");
    expect(cleanQuantity("")).toBe("");
    expect(cleanQuantity("007")).toBe("7");
  });

  it("stops at the largest quantity a box takes", () => {
    expect(cleanQuantity("1234567")).toBe(String(MAX_QUANTITY));
  });

  it("quantityOf treats an empty box as 0", () => {
    expect(quantityOf(undefined)).toBe(0);
    expect(quantityOf("")).toBe(0);
    expect(quantityOf("10")).toBe(10);
  });
});

describe("rowPrice", () => {
  it("is empty until a quantity is typed", () => {
    expect(rowPrice(ID_PHOTO, "", undefined)).toEqual({ kind: "empty" });
    expect(rowPrice(ID_PHOTO, "0", undefined)).toEqual({ kind: "empty" });
  });

  it("multiplies the price by the quantity, in centavos", () => {
    expect(rowPrice(ID_PHOTO, "2", undefined)).toMatchObject({
      kind: "priced",
      unitPriceCentavos: 5000,
      lineTotalCentavos: 10000,
      bulk: false,
    });
    expect(rowPrice(PRINT_BW, "10", undefined)).toMatchObject({
      lineTotalCentavos: 3000,
    });
  });

  it("applies the owner's bulk price once the quantity reaches it", () => {
    const withTier = product({
      priceCentavos: 300,
      tiers: [{ minQuantity: 100, unitPriceCentavos: 250 }],
    });
    expect(rowPrice(withTier, "99", undefined)).toMatchObject({
      unitPriceCentavos: 300,
      lineTotalCentavos: 29700,
      bulk: false,
    });
    expect(rowPrice(withTier, "100", undefined)).toMatchObject({
      unitPriceCentavos: 250,
      lineTotalCentavos: 25000,
      bulk: true,
    });
  });

  it("asks for the price of a product that has none, rather than using zero", () => {
    const unpriced = product({ priceCentavos: null });
    expect(rowPrice(unpriced, "3", undefined)).toEqual({ kind: "needs-price" });
    expect(rowPrice(unpriced, "3", "")).toEqual({ kind: "needs-price" });
    expect(rowPrice(unpriced, "3", "0")).toEqual({ kind: "needs-price" });
    expect(rowPrice(unpriced, "3", "abc")).toEqual({ kind: "needs-price" });
    expect(rowPrice(unpriced, "3", "12.50")).toMatchObject({
      kind: "priced",
      unitPriceCentavos: 1250,
      lineTotalCentavos: 3750,
    });
  });
});

describe("listSale", () => {
  const products = [ID_PHOTO, PRINT_BW, XEROX];

  it("turns the rows with a quantity into sale lines, in list order", () => {
    const sale = listSale(products, { "id-photo": "2", "print-bw": "10" }, {});

    expect(sale.lines.map((line) => [line.name, line.quantity])).toEqual([
      ["ID PHOTO PACKAGE", 2],
      ["Print (Black & White)", 10],
    ]);
    expect(sale.totalCentavos).toBe(13000);
    expect(sale.rowsWithQuantity).toBe(2);
    expect(sale.missingPrice).toEqual([]);
  });

  it("is nothing when every box is empty", () => {
    const sale = listSale(products, { xerox: "" }, {});
    expect(sale.lines).toEqual([]);
    expect(sale.totalCentavos).toBe(0);
    expect(sale.rowsWithQuantity).toBe(0);
  });

  it("names a row with a quantity but no price instead of dropping it", () => {
    const unpriced = product({ id: "mug", name: "Mug", priceCentavos: null });
    const sale = listSale([...products, unpriced], { mug: "1", xerox: "4" }, {});

    expect(sale.missingPrice).toEqual(["Mug"]);
    expect(sale.rowsWithQuantity).toBe(2);
    expect(sale.lines).toHaveLength(1);
  });

  it("agrees with computeSale, which is what the server re-runs", () => {
    const sale = listSale(products, { "id-photo": "3", "print-bw": "7", xerox: "11" }, {});
    expect(computeSale({ lines: sale.lines }).totalCentavos).toBe(sale.totalCentavos);
  });

  it("keeps each quantity with its product when the rows are reordered", () => {
    const quantities = { "id-photo": "2", xerox: "5" };
    const reordered = moveId(products.map((p) => p.id), "xerox", "id-photo");
    const byId = new Map(products.map((p) => [p.id, p]));
    const sale = listSale(reordered.map((id) => byId.get(id)!), quantities, {});

    expect(sale.lines.map((line) => [line.name, line.quantity])).toEqual([
      ["Xerox", 5],
      ["ID PHOTO PACKAGE", 2],
    ]);
    expect(sale.totalCentavos).toBe(11500);
  });
});

describe("moveId", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves a row down", () => {
    expect(moveId(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a row up", () => {
    expect(moveId(ids, "d", "a")).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves the original alone, so it can be put back", () => {
    moveId(ids, "a", "d");
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("changes nothing for an unknown id or a drop on itself", () => {
    expect(moveId(ids, "x", "a")).toEqual(ids);
    expect(moveId(ids, "b", "b")).toEqual(ids);
  });
});

describe("checkNewProduct", () => {
  const existing = ["ID PHOTO PACKAGE", "Xerox"];

  it("accepts a name and a price", () => {
    expect(checkNewProduct({ name: "  Lamination  ", price: "25" }, existing)).toEqual({
      ok: true,
      name: "Lamination",
      priceCentavos: 2500,
    });
  });

  it("refuses an empty name", () => {
    const result = checkNewProduct({ name: "   ", price: "25" }, existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.name).toMatch(/name/);
  });

  it("refuses a zero or negative price", () => {
    for (const price of ["0", "0.00", "-5"]) {
      const result = checkNewProduct({ name: "Lamination", price }, existing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.price).toBeTruthy();
    }
  });

  it("refuses a price that is not a peso amount", () => {
    const result = checkNewProduct({ name: "Lamination", price: "12.555" }, existing);
    expect(result.ok).toBe(false);
  });

  it("refuses a name already in the list, whatever its case or spacing", () => {
    for (const name of ["xerox", "XEROX ", "id  photo package"]) {
      const result = checkNewProduct({ name, price: "3" }, existing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.name).toMatch(/already in the list/);
    }
  });
});

describe("photoFileProblem", () => {
  it("accepts a JPG, PNG or WebP under 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(photoFileProblem({ type, size: 200_000 })).toBeNull();
    }
  });

  it("refuses any other type with a clear message", () => {
    for (const type of ["image/gif", "image/heic", "application/pdf", ""]) {
      expect(photoFileProblem({ type, size: 1000 })).toMatch(/JPG, PNG or WebP/);
    }
  });

  it("refuses a photo over 5 MB", () => {
    expect(photoFileProblem({ type: "image/jpeg", size: PHOTO_MAX_BYTES })).toBeNull();
    expect(photoFileProblem({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toMatch(
      /over 5 MB/,
    );
  });
});

describe("centreSquare", () => {
  it("keeps the middle of a wide photo", () => {
    expect(centreSquare(1600, 1200)).toEqual({ x: 200, y: 0, side: 1200 });
  });

  it("keeps the middle of a tall photo", () => {
    expect(centreSquare(1200, 1600)).toEqual({ x: 0, y: 200, side: 1200 });
  });

  it("keeps all of a square one", () => {
    expect(centreSquare(500, 500)).toEqual({ x: 0, y: 0, side: 500 });
  });
});

describe("reconcileProducts", () => {
  const a = { id: "a", name: "A" };
  const b = { id: "b", name: "B" };
  const c = { id: "c", name: "C" };

  it("takes the server's list once nothing is being saved", () => {
    expect(reconcileProducts([b, a], [a, b, c], new Set(), false)).toEqual([a, b, c]);
  });

  it("keeps this screen's order while a save is on its way", () => {
    const renamed = { id: "a", name: "A renamed" };
    expect(reconcileProducts([b, a], [renamed, b], new Set(), true)).toEqual([b, renamed]);
  });

  it("adds a product the server has at the bottom", () => {
    expect(reconcileProducts([b, a], [a, b, c], new Set(), true)).toEqual([b, a, c]);
  });

  it("keeps a product this screen just added before the server knows it", () => {
    expect(reconcileProducts([a, b, c], [a, b], new Set(), true)).toEqual([a, b, c]);
  });

  it("never brings back a product this screen just removed", () => {
    expect(reconcileProducts([a, c], [a, b, c], new Set(["b"]), true)).toEqual([a, c]);
    expect(reconcileProducts([a, c], [a, b, c], new Set(["b"]), false)).toEqual([a, c]);
  });
});
