import { describe, expect, it } from "vitest";

import {
  checkCheckout,
  earliestDateNeeded,
  isOrderRateLimited,
  isTrackRateLimited,
  normaliseMobile,
  normaliseOrderNo,
  type CheckoutForm,
} from "./checkout";

const today = { year: 2026, month: 9, day: 21 };

const form = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({
  customerName: "Barangay Ball Club",
  mobile: "09171234567",
  facebookName: "BBC Team",
  method: "pickup",
  address: "",
  dateNeeded: "2026-10-05",
  notes: "",
  honeypot: "",
  ...over,
});

const options = { today, minDaysAhead: 2 };

describe("normaliseMobile", () => {
  it("accepts the way a person actually writes a number", () => {
    expect(normaliseMobile("0917 555 0000")).toBe("09175550000");
    expect(normaliseMobile("0917-555-0000")).toBe("09175550000");
  });
});

describe("checkCheckout", () => {
  it("accepts an ordinary order", () => {
    const result = checkCheckout(form(), options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkout.mobile).toBe("09171234567");
      expect(result.checkout.method).toBe("pickup");
      expect(result.checkout.address).toBeNull();
    }
  });

  it("thanks a filled honeypot and stores nothing", () => {
    /*
      Telling a script it failed teaches it what to change, and telling a
      person it failed when it did not would be a lie. No person reaches this
      branch - the field is invisible.
    */
    const result = checkCheckout(form({ honeypot: "http://spam" }), options);
    expect(result).toEqual({ ok: false, silent: true });
  });

  it("insists on a mobile number that could be rung", () => {
    const result = checkCheckout(form({ mobile: "12345" }), options);
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(result.errors.mobile).toContain("eleven digits");
    }
  });

  it("wants a name", () => {
    const result = checkCheckout(form({ customerName: "   " }), options);
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) expect(result.errors.customerName).toBeDefined();
  });

  it("asks for an address only when it is being delivered", () => {
    const pickup = checkCheckout(form({ method: "pickup", address: "" }), options);
    expect(pickup.ok).toBe(true);

    const delivery = checkCheckout(form({ method: "delivery", address: "  " }), options);
    expect(delivery.ok).toBe(false);
    if (!delivery.ok && !delivery.silent) {
      expect(delivery.errors.address).toBeDefined();
    }
  });

  it("refuses a date sooner than the shop can manage", () => {
    const tooSoon = checkCheckout(form({ dateNeeded: "2026-09-22" }), options);
    expect(tooSoon.ok).toBe(false);

    const justInTime = checkCheckout(form({ dateNeeded: "2026-09-23" }), options);
    expect(justInTime.ok).toBe(true);
  });

  it("lets the shop set the lead time to nothing", () => {
    const sameDay = checkCheckout(form({ dateNeeded: "2026-09-21" }), {
      today,
      minDaysAhead: 0,
    });
    expect(sameDay.ok).toBe(true);
  });

  it("refuses a date that is not a date", () => {
    const result = checkCheckout(form({ dateNeeded: "next week" }), options);
    expect(result.ok).toBe(false);
  });

  it("caps every field rather than storing a novel", () => {
    const result = checkCheckout(form({ notes: "x".repeat(1000) }), options);
    expect(result.ok).toBe(false);
  });

  it("turns a box somebody left blank into nothing, not into an empty string", () => {
    const result = checkCheckout(form({ facebookName: "  ", notes: " " }), options);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkout.facebookName).toBeNull();
      expect(result.checkout.notes).toBeNull();
    }
  });

  it("collects every problem at once rather than one an attempt", () => {
    const result = checkCheckout(
      form({ customerName: "", mobile: "abc", method: "delivery", address: "" }),
      options,
    );
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(Object.keys(result.errors).sort()).toEqual(["address", "customerName", "mobile"]);
    }
  });
});

describe("earliestDateNeeded", () => {
  it("counts from today, in the shop's own calendar", () => {
    expect(earliestDateNeeded(today, 2)).toEqual({ year: 2026, month: 9, day: 23 });
  });

  it("rolls into the next month", () => {
    expect(earliestDateNeeded({ year: 2026, month: 9, day: 30 }, 2)).toEqual({
      year: 2026,
      month: 10,
      day: 2,
    });
  });
});

describe("the rate limits", () => {
  it("lets a person order and stops a script", () => {
    expect(isOrderRateLimited(4)).toBe(false);
    expect(isOrderRateLimited(5)).toBe(true);
  });

  it("is looser on looking an order up than on placing one", () => {
    expect(isTrackRateLimited(9)).toBe(false);
    expect(isTrackRateLimited(10)).toBe(true);
  });
});

describe("normaliseOrderNo", () => {
  it("accepts the ways somebody might type their own order number", () => {
    for (const typed of ["DA-0042", "da-0042", " da0042 ", "0042", "42"]) {
      expect(normaliseOrderNo(typed)).toBe("DA-0042");
    }
  });

  it("does not pad a number that has outgrown four digits", () => {
    expect(normaliseOrderNo("DA-12345")).toBe("DA-12345");
  });

  it("leaves something that is not an order number alone, so the lookup simply fails", () => {
    expect(normaliseOrderNo("hello")).toBe("HELLO");
  });
});
