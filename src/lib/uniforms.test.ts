import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePesos } from "./money";
import {
  APPAREL_SIZES,
  UNIFORM_INCOME_CATEGORY,
  UNIFORM_TYPES,
  UNIFORM_TYPE_LABELS,
  normaliseCustomName,
  parseEncodingPaste,
  rowIsPriced,
  rowPrice,
  rowTotal,
  rowWarnings,
  summariseUniforms,
  uniformLabel,
  type EncodedRow,
} from "./uniforms";

function row(overrides: Partial<EncodedRow> = {}): EncodedRow {
  return {
    id: "r1",
    lineId: "line-1",
    uniformType: "jersey",
    customTypeName: null,
    playerName: "Dela Cruz",
    playerNumber: "7",
    size: "M",
    shortSize: null,
    shortName: null,
    priceCentavos: parsePesos("650"),
    note: null,
    quantity: 1,
    upperIncluded: true,
    sizeExtraCentavos: 0,
    ...overrides,
  };
}

const item = (pesos: string) => ({ unitPriceCentavos: parsePesos(pesos) });

/** The count under one size, for a summary line, by name. */
function at(bySize: number[], size: (typeof APPAREL_SIZES)[number]): number {
  return bySize[APPAREL_SIZES.indexOf(size)];
}

// ---------------------------------------------------------------------------
// The six types cannot drift from the database
// ---------------------------------------------------------------------------

describe("the six uniform types", () => {
  /*
    The same guard the ten production benches have. The database refuses a type
    that is not on its own list, so a type spelled differently in the two
    places would be a row that saves nowhere - or worse, a row that saves and
    that no summary knows how to count.
  */
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "0019_phase13_encoding.sql"),
    "utf8",
  );

  it("is spelled in the migration exactly as it is spelled here", () => {
    for (const type of UNIFORM_TYPES) {
      expect(migration, type).toContain(`'${type}'`);
    }
  });

  it("puts each type's money in the book the database puts it in", () => {
    // uniform_income_category in 0019, read out of the file rather than
    // trusted: two copies of a mapping is two chances to disagree.
    for (const type of UNIFORM_TYPES) {
      const pattern = new RegExp(
        `when\\s+'${type}'\\s*then\\s*'${UNIFORM_INCOME_CATEGORY[type]}'`,
      );
      expect(pattern.test(migration), `${type} -> ${UNIFORM_INCOME_CATEGORY[type]}`).toBe(true);
    }
  });

  it("labels each type the way the printed sheet does", () => {
    for (const type of UNIFORM_TYPES) {
      const pattern = new RegExp(
        `when\\s+'${type}'\\s*then\\s*'${UNIFORM_TYPE_LABELS[type]}'`,
      );
      expect(pattern.test(migration), type).toBe(true);
    }
  });

  it("keeps Custom out of the jersey book", () => {
    // A custom cap is not a jersey. Filing it as one overstates the jersey
    // book every time, quietly.
    expect(UNIFORM_INCOME_CATEGORY.custom).toBe("other_apparel");
    expect(UNIFORM_INCOME_CATEGORY.jersey).toBe("sublimation_jerseys");
  });
});

describe("uniformLabel", () => {
  it("uses the typed name for a custom uniform", () => {
    expect(uniformLabel("custom", "Bib shorts")).toBe("Bib shorts");
  });

  it("says a type nobody recorded is not recorded, rather than guessing one", () => {
    expect(uniformLabel(null, null)).toBe("Type not recorded");
  });

  it("says when a custom uniform was never named", () => {
    expect(uniformLabel("custom", "   ")).toBe("Custom (not named)");
  });

  it("leaves the shop's own spelling alone", () => {
    // Correcting somebody's capitals on screen would be this system deciding
    // it knows better than the person who took the order.
    expect(uniformLabel("custom", "BIB shorts")).toBe("BIB shorts");
  });
});

describe("normaliseCustomName", () => {
  it("makes capitals and spacing irrelevant", () => {
    expect(normaliseCustomName("Bib shorts")).toBe("bib shorts");
    expect(normaliseCustomName("  bib   SHORTS ")).toBe("bib shorts");
  });
});

// ---------------------------------------------------------------------------
// What a row costs
// ---------------------------------------------------------------------------

describe("rowPrice", () => {
  it("uses the row's own price when it has one", () => {
    expect(rowPrice(row({ priceCentavos: parsePesos("750") }), item("650"))).toBe(
      parsePesos("750"),
    );
  });

  it("falls back to the item's price each PLUS the copied size add-on", () => {
    /*
      This is the whole of backwards compatibility in one assertion. Every
      roster entry written before Phase 13 was totalled as exactly this, so a
      row with no price of its own still totals exactly this - and no project
      already in the system moves by a centavo.
    */
    const legacy = row({
      priceCentavos: null,
      size: "2XL",
      sizeExtraCentavos: parsePesos("50"),
    });
    expect(rowPrice(legacy, item("650"))).toBe(parsePesos("700"));
  });

  it("treats a typed zero as a price, because free is an answer", () => {
    const free = row({ priceCentavos: 0 });
    expect(rowPrice(free, item("650"))).toBe(0);
    expect(rowIsPriced(free, item("650"))).toBe(true);
  });

  it("calls a row with nothing anywhere unpriced, and never invents one", () => {
    const nothing = row({ priceCentavos: null, sizeExtraCentavos: 0 });
    expect(rowIsPriced(nothing, item("0"))).toBe(false);
    expect(rowPrice(nothing, item("0"))).toBe(0);
  });

  it("multiplies by the quantity, so fifty plain shirts are one row", () => {
    const block = row({
      playerName: null,
      quantity: 50,
      priceCentavos: parsePesos("180"),
    });
    expect(rowTotal(block, item("0"))).toBe(parsePesos("9000"));
  });
});

describe("rowWarnings", () => {
  it("says nothing about a row that is complete", () => {
    expect(rowWarnings(row(), item("0"))).toEqual([]);
  });

  it("names a row with no type of uniform", () => {
    expect(
      rowWarnings(row({ uniformType: null }), item("0")).map((w) => w.kind),
    ).toContain("no_type");
  });

  it("names a row with no size, but not a shorts-only row", () => {
    expect(
      rowWarnings(row({ size: null }), item("0")).map((w) => w.kind),
    ).toContain("no_size");

    const shortsOnly = row({ size: null, upperIncluded: false, shortSize: "M" });
    expect(rowWarnings(shortsOnly, item("0")).map((w) => w.kind)).not.toContain(
      "no_size",
    );
  });

  it("names a short name with no short size", () => {
    /*
      The one combination that quietly loses something: the short size is what
      makes a row a set, so without it no shorts are counted, printed or cut -
      while the row plainly says somebody expects a name on a pair.
    */
    const half = row({ shortName: "DELA CRUZ", shortSize: null });
    expect(rowWarnings(half, item("0")).map((w) => w.kind)).toContain(
      "short_name_without_size",
    );
  });
});

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

describe("summariseUniforms", () => {
  it("says nothing at all about an empty project", () => {
    const summary = summariseUniforms({ rows: [] });

    expect(summary.uppers).toEqual([]);
    expect(summary.upperTotal).toBe(0);
    expect(summary.shortsTotal).toBe(0);
    expect(summary.unencodedTotal).toBe(0);
    expect(summary.sizeMissing).toBe(false);
  });

  it("counts a mixed project by type and by size", () => {
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", uniformType: "jersey", size: "M" }),
        row({ id: "2", uniformType: "jersey", size: "M" }),
        row({ id: "3", uniformType: "jersey", size: "2XL" }),
        row({ id: "4", uniformType: "jacket", size: "L" }),
        row({ id: "5", uniformType: "tshirt", size: "M" }),
      ],
    });

    const jersey = summary.uppers.find((line) => line.type === "jersey")!;
    expect(at(jersey.bySize, "M")).toBe(2);
    expect(at(jersey.bySize, "2XL")).toBe(1);
    expect(jersey.total).toBe(3);

    expect(at(summary.upperBySize, "M")).toBe(3);
    expect(summary.upperTotal).toBe(5);
  });

  it("adds each type's own total back up to the overall total", () => {
    // The grid a cutter reads has to be internally consistent, or the row
    // totals and the column totals send two people to cut two amounts.
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", uniformType: "jersey", size: "M" }),
        row({ id: "2", uniformType: "polo", size: null }),
        row({ id: "3", uniformType: "jacket", size: "XL", quantity: 4 }),
      ],
    });

    const rowSum = summary.uppers.reduce((total, line) => total + line.total, 0);
    const columnSum =
      summary.upperBySize.reduce((total, count) => total + count, 0) +
      summary.upperNoSize;

    expect(rowSum).toBe(summary.upperTotal);
    expect(columnSum).toBe(summary.upperTotal);
    expect(summary.upperTotal).toBe(6);
  });

  it("makes each distinct custom name its own line", () => {
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", uniformType: "custom", customTypeName: "Bib shorts", size: "M" }),
        row({ id: "2", uniformType: "custom", customTypeName: "Cap", size: "L" }),
      ],
    });

    expect(summary.uppers).toHaveLength(2);
    expect(summary.uppers.map((line) => line.label).sort()).toEqual([
      "Bib shorts",
      "Cap",
    ]);
  });

  it("treats custom names that differ only by capitals or spaces as ONE line", () => {
    /*
      They are one thing on the cutting table. Two half-lines is how fifteen
      pieces get cut as eight and seven - and the label shown is the FIRST
      spelling anybody typed, not a tidied-up one.
    */
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", uniformType: "custom", customTypeName: "Bib shorts", size: "M" }),
        row({ id: "2", uniformType: "custom", customTypeName: "bib shorts", size: "M" }),
        row({ id: "3", uniformType: "custom", customTypeName: "Bib  SHORTS", size: "L" }),
      ],
    });

    expect(summary.uppers).toHaveLength(1);
    expect(summary.uppers[0].label).toBe("Bib shorts");
    expect(summary.uppers[0].total).toBe(3);
    expect(at(summary.uppers[0].bySize, "M")).toBe(2);
  });

  it("counts shorts only where a short SIZE was given", () => {
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", size: "M", shortSize: "M" }),
        row({ id: "2", size: "L", shortSize: "S" }),
        // No shorts on this one at all.
        row({ id: "3", size: "L", shortSize: null }),
      ],
    });

    expect(summary.shortsTotal).toBe(2);
    expect(at(summary.shortsBySize, "M")).toBe(1);
    expect(at(summary.shortsBySize, "S")).toBe(1);
    expect(summary.upperTotal).toBe(3);
  });

  it("counts a shorts-only row as shorts and as no upper at all", () => {
    /*
      Not the same as a size nobody has typed yet. A shorts-only row never had
      an upper, so putting it in the "not set" column would have somebody
      chasing a jersey size that does not exist.
    */
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", size: "M" }),
        row({ id: "2", size: null, upperIncluded: false, shortSize: "L" }),
      ],
    });

    expect(summary.upperTotal).toBe(1);
    expect(summary.upperNoSize).toBe(0);
    expect(summary.sizeMissing).toBe(false);
    expect(summary.shortsTotal).toBe(1);
    expect(at(summary.shortsBySize, "L")).toBe(1);
  });

  it("puts a row whose size nobody has typed in a column that says so", () => {
    const summary = summariseUniforms({
      rows: [row({ id: "1", size: null }), row({ id: "2", size: "M" })],
    });

    expect(summary.upperNoSize).toBe(1);
    expect(summary.sizeMissing).toBe(true);
    expect(summary.uppers[0].noSize).toBe(1);
    // And it is not quietly folded into M.
    expect(at(summary.upperBySize, "M")).toBe(1);
  });

  it("counts a nameless block as its quantity, not as one", () => {
    // Fifty plain shirts is one row saying fifty. Nobody types fifty empty
    // rows, and the summary still has to say fifty.
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", uniformType: "tshirt", playerName: null, size: "M", quantity: 50 }),
      ],
    });

    expect(summary.upperTotal).toBe(50);
    expect(at(summary.upperBySize, "M")).toBe(50);
  });

  it("reports pieces on an item nobody has encoded, apart from the grid", () => {
    /*
      A job order written before Phase 13 can carry "50 plain shirts" with no
      names at all. Nothing says what size they are, so they cannot go in the
      grid - and leaving them out entirely would have the cutter short by
      fifty.
    */
    const summary = summariseUniforms({
      rows: [row({ id: "1", size: "M" })],
      unencoded: [{ lineId: "line-9", name: "Shirt", quantity: 50 }],
    });

    expect(summary.upperTotal).toBe(1);
    expect(summary.unencodedTotal).toBe(50);
    expect(summary.unencoded[0].name).toBe("Shirt");
  });

  it("counts a short name with no short size, so the screen can say so", () => {
    const summary = summariseUniforms({
      rows: [row({ id: "1", shortName: "DELA CRUZ", shortSize: null })],
    });

    expect(summary.shortNameWithoutSize).toBe(1);
    expect(summary.shortsTotal).toBe(0);
  });

  it("lists the types in the shop's own order, with the unrecorded ones last", () => {
    const summary = summariseUniforms({
      rows: [
        row({ id: "1", uniformType: null, size: "M" }),
        row({ id: "2", uniformType: "jacket", size: "M" }),
        row({ id: "3", uniformType: "jersey", size: "M" }),
        row({ id: "4", uniformType: "custom", customTypeName: "Cap", size: "M" }),
        row({ id: "5", uniformType: "custom", customTypeName: "Apron", size: "M" }),
      ],
    });

    expect(summary.uppers.map((line) => line.label)).toEqual([
      "Jersey",
      "Jacket",
      "Apron",
      "Cap",
      "Type not recorded",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The paste-in shortcut
// ---------------------------------------------------------------------------

describe("parseEncodingPaste", () => {
  it("reads name, number and size", () => {
    const { rows } = parseEncodingPaste("Dela Cruz, 7, M");

    expect(rows).toEqual([
      {
        playerName: "Dela Cruz",
        playerNumber: "7",
        size: "M",
        shortSize: null,
        note: null,
      },
    ]);
  });

  it("reads a name and a size, with no number", () => {
    const { rows } = parseEncodingPaste("Reyes, L");

    expect(rows[0].playerName).toBe("Reyes");
    expect(rows[0].playerNumber).toBeNull();
    expect(rows[0].size).toBe("L");
  });

  it("reads a second size as the SHORT size", () => {
    const { rows } = parseEncodingPaste("Santos, 23, 2XL, M");

    expect(rows[0]).toEqual({
      playerName: "Santos",
      playerNumber: "23",
      size: "2XL",
      shortSize: "M",
      note: null,
    });
  });

  it("reads a size on its own, for a piece with no name", () => {
    const { rows } = parseEncodingPaste("M");

    expect(rows[0].playerName).toBeNull();
    expect(rows[0].size).toBe("M");
  });

  it("reads a name on its own, because a size may be filled in later", () => {
    const { rows } = parseEncodingPaste("Dela Cruz");

    expect(rows[0].playerName).toBe("Dela Cruz");
    expect(rows[0].size).toBeNull();
  });

  it("puts anything left over in the note rather than throwing it away", () => {
    const { rows } = parseEncodingPaste("Dela Cruz, 7, M, no logo");

    expect(rows[0].note).toBe("no logo");
    expect(rows[0].size).toBe("M");
  });

  it("only reads a number as a number when it looks like one", () => {
    // "Reyes, captain" has a captain, not player number "captain".
    const { rows } = parseEncodingPaste("Reyes, captain, L");

    expect(rows[0].playerNumber).toBeNull();
    expect(rows[0].note).toBe("captain");
  });

  it("accepts any capitalisation of a size", () => {
    const { rows } = parseEncodingPaste("Dela Cruz, 7, 2xl");

    expect(rows[0].size).toBe("2XL");
  });

  it("skips blank lines and reads the rest", () => {
    const { rows, problems } = parseEncodingPaste(
      "Dela Cruz, 7, M\n\n   \nReyes, 10, L\n",
    );

    expect(rows).toHaveLength(2);
    expect(problems).toEqual([]);
  });
});
