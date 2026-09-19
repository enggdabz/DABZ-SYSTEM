import { describe, expect, it } from "vitest";

import {
  canDelete,
  deleteConfirmation,
  deleteRefusal,
  deleteVanished,
  type CatalogueKind,
} from "./deletable";

const KINDS: CatalogueKind[] = ["bill", "loan", "product"];

describe("what may be deleted", () => {
  it("lets a row with no history go", () => {
    expect(canDelete(false)).toBe(true);
    for (const kind of KINDS) {
      expect(deleteRefusal(kind, false)).toBeNull();
    }
  });

  it("keeps a row that money has moved against", () => {
    expect(canDelete(true)).toBe(false);
    for (const kind of KINDS) {
      expect(deleteRefusal(kind, true)).not.toBeNull();
    }
  });

  /*
    The refusal is the only thing the owner sees when a delete is turned down,
    so it has to say WHY and offer the thing that does work. A bare "cannot
    delete" teaches people that the button is broken.
  */
  it("says why, and names the alternative", () => {
    expect(deleteRefusal("bill", true)).toBe(
      "This bill cannot be deleted because it has already been marked paid. " +
        "Stop counting it instead: it keeps its payment history and drops out of the monthly total.",
    );
    expect(deleteRefusal("loan", true)).toContain("payments have been recorded against it");
    expect(deleteRefusal("product", true)).toContain("it has already been sold");
  });

  it("offers a way forward in every refusal", () => {
    for (const kind of KINDS) {
      expect(deleteRefusal(kind, true)).toMatch(/instead/);
    }
  });
});

describe("the confirmation step", () => {
  it("names the row, because the counter is tapped quickly", () => {
    expect(deleteConfirmation("bill", "Internet")).toContain("Internet");
    expect(deleteConfirmation("loan", "BPI")).toContain("BPI");
    expect(deleteConfirmation("product", "Photocopy")).toContain("Photocopy");
  });

  it("uses the name exactly as it was typed", () => {
    // A bill called "Rent (2nd floor)" must not come back escaped or trimmed:
    // the owner has to recognise the thing they are about to remove.
    expect(deleteConfirmation("bill", "Rent (2nd floor)")).toContain("Rent (2nd floor)");
  });
});

describe("a delete the database turned down", () => {
  /*
    A DELETE that no policy matches removes nothing and raises nothing. Saying
    "deleted" there would be a lie the owner could not check, so the actions
    look at what came back and fall through to this.
  */
  it("says nothing happened, rather than claiming success", () => {
    for (const kind of KINDS) {
      expect(deleteVanished(kind)).toMatch(/^Nothing was deleted/);
      expect(deleteVanished(kind)).toMatch(/instead/);
    }
  });
});
