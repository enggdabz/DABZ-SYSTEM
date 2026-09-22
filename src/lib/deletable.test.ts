import { describe, expect, it } from "vitest";

import {
  canDelete,
  deleteConfirmation,
  deleteRefusal,
  deleteVanished,
  historyCheckUnavailable,
  CATALOGUE_KINDS,
  type CatalogueKind,
} from "./deletable";

/*
  The list itself, not a copy of it. This test used to keep its own, and when
  "apparel project" was added the copy stayed five kinds long - so every
  sentence assertion below silently stopped covering the newest one.
*/
const KINDS: readonly CatalogueKind[] = CATALOGUE_KINDS;

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
    expect(deleteRefusal("apparel item", true)).toContain("it is already on a job order");
    expect(deleteRefusal("repair service", true)).toContain(
      "it has already been charged on a ticket",
    );
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
    expect(deleteConfirmation("apparel item", "Shirt")).toContain("Shirt");
    expect(deleteConfirmation("repair service", "Virus removal")).toContain(
      "Virus removal",
    );
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

describe("when the history check cannot be reached", () => {
  /*
    PostgREST answers "function not found" both when a migration was never
    applied AND when it is merely serving a cache built before the function
    existed. An owner who had already run db:push and is told to run it again
    has no way to tell which it was, so the message names both fixes.
  */
  it("names the function, and both of the things that cause this", () => {
    const message = historyCheckUnavailable("bill_has_history");
    expect(message).toContain("bill_has_history");
    expect(message).toContain("reload schema");
    expect(message).toContain("db:push");
  });

  it("says it will not guess, rather than deleting anyway", () => {
    expect(historyCheckUnavailable("loan_has_history")).toContain("will not guess");
  });
});

describe("a whole project, not a catalogue row", () => {
  /*
    The one kind here that is a JOB rather than a list entry. `0007` gave
    apparel_orders no delete policy at all; `0021` opened a gap exactly the
    width of a project written by mistake, and these are the sentences that
    explain the edge of that gap to whoever meets it.
  */
  it("names all three things that stop a project going", () => {
    const refusal = deleteRefusal("apparel project", true) ?? "";

    expect(refusal).toContain("money");
    expect(refusal).toContain("benches");
    expect(refusal).toContain("released");
  });

  it("offers cancelling, which is the thing that keeps every figure", () => {
    const refusal = deleteRefusal("apparel project", true) ?? "";

    expect(refusal).toContain("Cancel it with a reason");
  });

  it("says nothing was deleted rather than claiming it was", () => {
    // A DELETE matching no policy removes nothing and raises nothing, so this
    // sentence is the only thing standing between the owner and a false
    // "deleted" message.
    expect(deleteVanished("apparel project")).toContain("Nothing was deleted");
  });
});
