import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isCategoryForDivision } from "./projects";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_IDS,
  parseProjectDetails,
  projectCategory,
  projectLines,
  projectSummary,
  readProjectDetails,
  sizeBreakdownText,
  type ProjectDetails,
} from "./project-types";

/** A form as the browser would send it: only the boxes that were filled. */
function form(fields: Record<string, string>) {
  return (name: string) => fields[name] ?? "";
}

const apparelForm = {
  detail_uniformKind: "sublimation_jersey",
  detail_pieces: "15",
  size_S: "5",
  size_M: "7",
  size_L: "3",
};

describe("the project types", () => {
  it("are the four the owner named, in that order", () => {
    expect(PROJECT_TYPE_IDS.map((id) => PROJECT_TYPES[id].label)).toEqual([
      "Tarpaulin",
      "Apparel",
      "Printing",
      "Repair",
    ]);
  });

  it("file every choice under a ledger category that fits the type's division", () => {
    // The database refuses a category that does not fit its division, so a
    // choice in this config that broke the rule would fail at the counter.
    for (const id of PROJECT_TYPE_IDS) {
      const type = PROJECT_TYPES[id];
      const categories = [
        ...(type.category ? [type.category] : []),
        ...(type.fields
          .find((field) => field.id === type.categoryFrom)
          ?.options?.map((option) => option.category) ?? []),
      ];
      expect(categories.length).toBeGreaterThan(0);
      for (const category of categories) {
        expect(category).toBeTruthy();
        expect(isCategoryForDivision(type.division, category as string)).toBe(
          true,
        );
      }
    }
  });

  it("are the same list the database accepts", () => {
    // 0024's project_details_problem() refuses any other type. Reading the file
    // is what stops the two lists drifting apart; the division each type must
    // sit under is proved by 19_projects_rls.test.sql against a real database.
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/0024_project_details_and_sale_link.sql",
      ),
      "utf8",
    );
    const listed = /v_type not in \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    expect(
      listed
        .split(",")
        .map((entry) => entry.trim().replace(/'/g, ""))
        .sort(),
    ).toEqual([...PROJECT_TYPE_IDS].sort());
  });
});

describe("reading an apparel project", () => {
  it("keeps the kind, the pieces and the sizes that were entered", () => {
    const { details, errors } = parseProjectDetails(
      "apparel",
      form(apparelForm),
    );
    expect(errors).toEqual({});
    expect(details).toEqual({
      type: "apparel",
      values: { uniformKind: "sublimation_jersey", pieces: 15 },
      sizes: { S: 5, M: 7, L: 3 },
    });
  });

  it("accepts a breakdown that adds up exactly to the pieces", () => {
    const { errors } = parseProjectDetails(
      "apparel",
      form({ ...apparelForm, detail_pieces: "15" }),
    );
    expect(errors.sizes).toBeUndefined();
  });

  it("refuses sizes that add up to fewer pieces, and says how many are missing", () => {
    const { details, errors } = parseProjectDetails(
      "apparel",
      form({ ...apparelForm, size_L: "1" }),
    );
    expect(details).toBeNull();
    expect(errors.sizes).toContain("add up to 13");
    expect(errors.sizes).toContain("2 short");
  });

  it("refuses sizes that add up to more pieces, and says by how many", () => {
    const { details, errors } = parseProjectDetails(
      "apparel",
      form({ ...apparelForm, size_XL: "2" }),
    );
    expect(details).toBeNull();
    expect(errors.sizes).toContain("add up to 17");
    expect(errors.sizes).toContain("2 too many");
  });

  it("refuses an apparel order with no size breakdown at all", () => {
    const { details, errors } = parseProjectDetails(
      "apparel",
      form({
        detail_uniformKind: "jacket",
        detail_pieces: "4",
      }),
    );
    expect(details).toBeNull();
    expect(errors.sizes).toBeTruthy();
  });

  it("ignores a size left at zero, and refuses one that is not a whole number", () => {
    const zero = parseProjectDetails(
      "apparel",
      form({ ...apparelForm, size_XL: "0" }),
    );
    expect(zero.errors).toEqual({});
    expect(zero.details?.sizes).toEqual({ S: 5, M: 7, L: 3 });

    for (const bad of ["2.5", "-1", "two", "1e1"]) {
      const result = parseProjectDetails(
        "apparel",
        form({ ...apparelForm, size_XL: bad }),
      );
      expect(result.details).toBeNull();
      expect(result.errors.sizes).toBeTruthy();
    }
  });

  it("refuses a kind of uniform the form never offered", () => {
    const { errors } = parseProjectDetails(
      "apparel",
      form({ ...apparelForm, detail_uniformKind: "tuxedo" }),
    );
    expect(errors.uniformKind).toBeTruthy();
  });

  it("refuses pieces that are not a whole number of 1 or more", () => {
    for (const bad of ["0", "2.5", "-3", "lots", ""]) {
      const { errors } = parseProjectDetails(
        "apparel",
        form({ ...apparelForm, detail_pieces: bad }),
      );
      expect(errors.pieces).toBeTruthy();
    }
  });
});

describe("reading the other three types", () => {
  it("takes a tarpaulin's size and quantity", () => {
    const { details, errors } = parseProjectDetails(
      "tarpaulin",
      form({
        detail_widthFeet: "3",
        detail_heightFeet: "5",
        detail_quantity: "2",
      }),
    );
    expect(errors).toEqual({});
    expect(details?.values).toEqual({
      widthFeet: 3,
      heightFeet: 5,
      quantity: 2,
    });
  });

  it("keeps a half foot, and refuses a size of zero or a nonsense one", () => {
    const half = parseProjectDetails(
      "tarpaulin",
      form({
        detail_widthFeet: "3.5",
        detail_heightFeet: "5",
        detail_quantity: "1",
      }),
    );
    expect(half.details?.values.widthFeet).toBe(3.5);

    for (const bad of ["0", "-2", "abc", "5000"]) {
      const { errors } = parseProjectDetails(
        "tarpaulin",
        form({
          detail_widthFeet: bad,
          detail_heightFeet: "5",
          detail_quantity: "1",
        }),
      );
      expect(errors.widthFeet).toBeTruthy();
    }
  });

  it("takes a printing item, quantity and specs", () => {
    const { details, errors } = parseProjectDetails(
      "printing",
      form({
        detail_item: "stickers",
        detail_quantity: "100",
        detail_specs: "3 inch round, glossy",
      }),
    );
    expect(errors).toEqual({});
    expect(details?.values).toEqual({
      item: "stickers",
      quantity: 100,
      specs: "3 inch round, glossy",
    });
  });

  it("takes a repair's device, brand/model and problem", () => {
    const { details, errors } = parseProjectDetails(
      "repair",
      form({
        detail_deviceType: "laptop",
        detail_brandModel: "Lenovo IdeaPad 3",
        detail_problem: "No power",
      }),
    );
    expect(errors).toEqual({});
    expect(details?.values.deviceType).toBe("laptop");
  });

  it("names every missing field, not just the first", () => {
    const { details, errors } = parseProjectDetails("repair", form({}));
    expect(details).toBeNull();
    expect(Object.keys(errors).sort()).toEqual([
      "brandModel",
      "deviceType",
      "problem",
    ]);
  });

  it("refuses a type that is not one of the four", () => {
    const { details, errors } = parseProjectDetails("catering", form({}));
    expect(details).toBeNull();
    expect(errors.type).toBeTruthy();
  });

  it("keeps an optional note and does not require one", () => {
    const withNote = parseProjectDetails(
      "tarpaulin",
      form({
        detail_widthFeet: "3",
        detail_heightFeet: "5",
        detail_quantity: "1",
        detail_notes: "  For the fiesta  ",
      }),
    );
    expect(withNote.details?.notes).toBe("For the fiesta");

    const without = parseProjectDetails(
      "tarpaulin",
      form({
        detail_widthFeet: "3",
        detail_heightFeet: "5",
        detail_quantity: "1",
      }),
    );
    expect(without.details?.notes).toBeUndefined();
  });
});

describe("the job in words", () => {
  const tarp: ProjectDetails = {
    type: "tarpaulin",
    values: { widthFeet: 3, heightFeet: 5, quantity: 2 },
  };
  const jerseys: ProjectDetails = {
    type: "apparel",
    values: { uniformKind: "sublimation_jersey", pieces: 15 },
    sizes: { L: 3, S: 5, M: 7 },
  };

  it("words a tarpaulin the way the owner wrote it", () => {
    expect(projectLines(tarp)).toEqual(["Tarpaulin 3x5 ft x2"]);
  });

  it("words apparel with the sizes in ladder order, whatever order they were kept in", () => {
    expect(projectLines(jerseys)).toEqual([
      "Sublimation jersey, 15 pcs, S:5 M:7 L:3",
    ]);
    expect(sizeBreakdownText({ XL: 1, XS: 2, M: 3 })).toBe("XS:2 M:3 XL:1");
  });

  it("puts a repair's device and problem on their own lines, and the note last", () => {
    expect(
      projectLines({
        type: "repair",
        values: {
          deviceType: "printer",
          brandModel: "Epson L3210",
          problem: "Paper jam",
        },
        notes: "Has the box",
      }),
    ).toEqual(["Printer: Epson L3210", "Problem: Paper jam", "Note: Has the box"]);
  });

  it("gives one line for lists and the calendar", () => {
    expect(projectSummary(tarp)).toBe("Tarpaulin 3x5 ft x2");
    expect(
      projectSummary({
        type: "printing",
        values: { item: "stickers", quantity: 100, specs: "3 inch round" },
      }),
    ).toBe("Stickers x100; 3 inch round");
  });
});

describe("how the money is filed", () => {
  it("follows the type, and for apparel the kind of uniform", () => {
    expect(
      projectCategory({
        type: "tarpaulin",
        values: { widthFeet: 1, heightFeet: 1, quantity: 1 },
      }),
    ).toBe("tarpaulin");
    for (const [kind, category] of [
      ["sublimation_jersey", "sublimation_jerseys"],
      ["dtf_shirt", "dtf_prints"],
      ["jacket", "jackets"],
      ["long_sleeve", "long_sleeves"],
      ["other", "other_apparel"],
    ]) {
      expect(
        projectCategory({
          type: "apparel",
          values: { uniformKind: kind, pieces: 1 },
        }),
      ).toBe(category);
    }
  });

  it("is null for a choice the config does not know", () => {
    expect(
      projectCategory({
        type: "repair",
        values: { deviceType: "toaster" },
      }),
    ).toBeNull();
  });
});

describe("details read back from the database", () => {
  it("come back as they went in", () => {
    const stored = {
      type: "apparel",
      values: { uniformKind: "jacket", pieces: 2 },
      sizes: { M: 2 },
    };
    expect(readProjectDetails(stored)).toEqual(stored);
  });

  it("are null for a project that has none, or for something else", () => {
    expect(readProjectDetails(null)).toBeNull();
    expect(readProjectDetails("text")).toBeNull();
    expect(readProjectDetails({ type: "ufo", values: {} })).toBeNull();
    expect(readProjectDetails({ type: "apparel" })).toBeNull();
  });
});
