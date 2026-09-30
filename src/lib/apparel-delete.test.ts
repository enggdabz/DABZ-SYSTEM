import { describe, expect, it } from "vitest";

import { apparelDeleteOffer } from "./apparel-delete";

const base = {
  hasHistory: true as boolean | null,
  status: "confirmed",
  hasPayments: true,
  hasBenchMarks: false,
  marksKnown: true,
  isOwner: true,
};

describe("apparelDeleteOffer - which delete an apparel project is offered", () => {
  it("gives the owner the refund dialog when money has been taken and nothing else has happened", () => {
    expect(apparelDeleteOffer(base)).toBe("with_money");
  });

  it("tells an admin to ask the owner, and offers nothing that would be refused", () => {
    expect(apparelDeleteOffer({ ...base, isOwner: false })).toBe("ask_owner");
  });

  it("leaves a project nothing has happened to on the plain 0021 card", () => {
    expect(apparelDeleteOffer({ ...base, hasHistory: false, hasPayments: false })).toBe("plain");
  });

  it("leaves a project with no payment on the plain card even if it has history", () => {
    // History from a bench mark alone is not money: still "cancel it instead".
    expect(apparelDeleteOffer({ ...base, hasPayments: false })).toBe("plain");
  });

  it("keeps a released project on 'cancel it instead'", () => {
    expect(apparelDeleteOffer({ ...base, status: "released" })).toBe("plain");
  });

  it("keeps a project with a bench marked on 'cancel it instead'", () => {
    expect(apparelDeleteOffer({ ...base, hasBenchMarks: true })).toBe("plain");
  });

  it("does not offer the dialog when the marks could not be read - unknown is not none", () => {
    expect(apparelDeleteOffer({ ...base, marksKnown: false })).toBe("plain");
  });

  it("does not offer it when whether anything has happened could not be asked", () => {
    expect(apparelDeleteOffer({ ...base, hasHistory: null })).toBe("plain");
  });

  it("offers it on a cancelled project that took money - cancelling is not history", () => {
    expect(apparelDeleteOffer({ ...base, status: "cancelled" })).toBe("with_money");
  });
});
