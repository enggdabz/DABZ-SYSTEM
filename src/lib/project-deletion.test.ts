import { describe, expect, it } from "vitest";

import {
  REASON_MAX_LENGTH,
  canCancelDeletionRequest,
  canDecideDeletion,
  deleteMode,
  isLive,
  outcomeMessage,
  parseRefundChoice,
  pendingCountLabel,
  validateNote,
  validateReason,
} from "./project-deletion";

describe("deleteMode - what the Delete project button does", () => {
  it("lets the owner delete straight away", () => {
    expect(deleteMode("owner")).toBe("delete");
  });

  it("gives an admin a request, never a deletion", () => {
    expect(deleteMode("admin")).toBe("request");
  });

  it("gives staff and anybody unknown nothing at all", () => {
    expect(deleteMode("staff")).toBe("none");
    expect(deleteMode(null)).toBe("none");
    expect(deleteMode(undefined)).toBe("none");
  });
});

describe("canDecideDeletion - only the owner approves or rejects", () => {
  it("is the owner alone", () => {
    expect(canDecideDeletion("owner")).toBe(true);
    expect(canDecideDeletion("admin")).toBe(false);
    expect(canDecideDeletion("staff")).toBe(false);
    expect(canDecideDeletion(null)).toBe(false);
  });
});

describe("canCancelDeletionRequest", () => {
  it("lets the person who asked take it back", () => {
    expect(
      canCancelDeletionRequest({ role: "admin", userId: "a", requestedBy: "a" }),
    ).toBe(true);
  });

  it("does not let a different admin withdraw it", () => {
    expect(
      canCancelDeletionRequest({ role: "admin", userId: "b", requestedBy: "a" }),
    ).toBe(false);
  });

  it("lets the owner withdraw anybody's", () => {
    expect(
      canCancelDeletionRequest({ role: "owner", userId: "o", requestedBy: "a" }),
    ).toBe(true);
  });

  it("does not let staff withdraw even their own name", () => {
    expect(
      canCancelDeletionRequest({ role: "staff", userId: "a", requestedBy: "a" }),
    ).toBe(false);
  });
});

describe("isLive - a deleted project is out of every list", () => {
  it("counts a project with no deleted_at", () => {
    expect(isLive({})).toBe(true);
    expect(isLive({ deletedAt: null })).toBe(true);
  });

  it("drops a soft-deleted one", () => {
    expect(isLive({ deletedAt: "2026-10-01T02:00:00Z" })).toBe(false);
  });
});

describe("the reason", () => {
  it("is required", () => {
    expect(validateReason("")).not.toBeNull();
    expect(validateReason("   ")).not.toBeNull();
  });

  it("is accepted with words in it", () => {
    expect(validateReason("Duplicate entry")).toBeNull();
  });

  it("has a limit", () => {
    expect(validateReason("x".repeat(REASON_MAX_LENGTH))).toBeNull();
    expect(validateReason("x".repeat(REASON_MAX_LENGTH + 1))).not.toBeNull();
  });

  it("makes the note optional but bounded", () => {
    expect(validateNote("")).toBeNull();
    expect(validateNote("Keep it")).toBeNull();
    expect(validateNote("x".repeat(REASON_MAX_LENGTH + 1))).not.toBeNull();
  });
});

describe("what is said afterwards", () => {
  it("says a request is waiting, not that the project is gone", () => {
    const message = outcomeMessage("requested", "J-261001-001");
    expect(message).toContain("owner");
    expect(message).not.toMatch(/was deleted/);
  });

  it("says a deletion happened", () => {
    expect(outcomeMessage("deleted", "J-261001-001")).toContain("was deleted");
  });

  it("reads the count in words", () => {
    expect(pendingCountLabel(1)).toBe("1 request waiting");
    expect(pendingCountLabel(3)).toBe("3 requests waiting");
  });
});

describe("the refund choice", () => {
  it("reads only the two answers the form can send", () => {
    expect(parseRefundChoice("refund")).toBe("refund");
    expect(parseRefundChoice("keep")).toBe("keep");
  });

  it("treats anything else as no answer - there is no default", () => {
    expect(parseRefundChoice("")).toBeNull();
    expect(parseRefundChoice("yes")).toBeNull();
    expect(parseRefundChoice("REFUND")).toBeNull();
  });

  it("says how much was refunded when the owner deletes", () => {
    expect(
      outcomeMessage("deleted", "J-1", { refundedLabel: "₱2,000.00" }),
    ).toBe("Project J-1 was deleted and ₱2,000.00 was refunded.");
  });

  it("says a refund was ASKED for, not made, when an admin requests", () => {
    const message = outcomeMessage("requested", "J-1", {
      refundAskedLabel: "₱2,000.00",
    });
    expect(message).toContain("₱2,000.00 refund");
    expect(message).toContain("owner for approval");
    expect(message).not.toMatch(/was refunded/);
  });
});
