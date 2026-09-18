import { describe, expect, it } from "vitest";

import {
  ENQUIRY_LIMITS,
  checkEnquiry,
  heardFromCounts,
  isRateLimited,
  unansweredCount,
  type Enquiry,
  type EnquiryForm,
} from "./enquiries";

function form(overrides: Partial<EnquiryForm> = {}): EnquiryForm {
  return {
    name: "Marcelo Uy",
    contact: "0917 555 0700",
    division: "printshoppe",
    message: "How much for 100 photocopies?",
    heardFrom: "Facebook",
    honeypot: "",
    ...overrides,
  };
}

function enquiry(overrides: Partial<Enquiry> = {}): Enquiry {
  return {
    id: "e1",
    name: "Marcelo Uy",
    contact: "0917 555 0700",
    division: "printshoppe",
    message: "How much for 100 photocopies?",
    heardFrom: "Facebook",
    status: "new",
    replyNote: null,
    createdAt: "2026-09-18T02:00:00Z",
    handledAt: null,
    ...overrides,
  };
}

describe("checkEnquiry", () => {
  it("lets an ordinary message through", () => {
    const result = checkEnquiry(form());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.enquiry.name).toBe("Marcelo Uy");
      expect(result.enquiry.division).toBe("printshoppe");
    }
  });

  it("trims what a person typed, so a stray space is not stored", () => {
    const result = checkEnquiry(form({ name: "  Ana  ", message: " Hello " }));
    if (result.ok) {
      expect(result.enquiry.name).toBe("Ana");
      expect(result.enquiry.message).toBe("Hello");
    }
  });

  it("needs a name, a way to reply, and something to reply about", () => {
    const result = checkEnquiry(
      form({ name: "  ", contact: "", message: "" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "contact",
        "message",
        "name",
      ]);
    }
  });

  it("refuses a message longer than the limit", () => {
    const result = checkEnquiry(
      form({ message: "x".repeat(ENQUIRY_LIMITS.message + 1) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(result.errors).toHaveProperty("message");
    }
  });

  it("accepts a message exactly at the limit", () => {
    // The limit is what a person may send, not what they may not.
    expect(
      checkEnquiry(form({ message: "x".repeat(ENQUIRY_LIMITS.message) })).ok,
    ).toBe(true);
  });

  it("silently swallows anything that fills the honeypot", () => {
    // Telling a script it failed teaches it what to change next time.
    const result = checkEnquiry(form({ honeypot: "http://spam.example" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.silent).toBe(true);
  });

  it("ignores a division it does not recognise rather than refusing", () => {
    // A stranger fiddling with the form should not be able to make it error;
    // the enquiry is still worth having without a division on it.
    const result = checkEnquiry(form({ division: "refrigerators" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.enquiry.division).toBeNull();
  });

  it("treats an empty 'heard from' as nothing, not as an empty answer", () => {
    const result = checkEnquiry(form({ heardFrom: "   " }));
    if (result.ok) expect(result.enquiry.heardFrom).toBeNull();
  });
});

describe("isRateLimited", () => {
  it("lets through up to the limit", () => {
    expect(isRateLimited(0)).toBe(false);
    expect(isRateLimited(ENQUIRY_LIMITS.perHour - 1)).toBe(false);
  });

  it("refuses once the limit is reached", () => {
    expect(isRateLimited(ENQUIRY_LIMITS.perHour)).toBe(true);
    expect(isRateLimited(ENQUIRY_LIMITS.perHour + 10)).toBe(true);
  });
});

describe("unansweredCount", () => {
  it("counts only the new ones", () => {
    expect(
      unansweredCount([
        enquiry(),
        enquiry({ id: "b", status: "replied" }),
        enquiry({ id: "c", status: "closed" }),
        enquiry({ id: "d" }),
      ]),
    ).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(unansweredCount([])).toBe(0);
  });
});

describe("heardFromCounts", () => {
  it("counts the same answer however it was typed", () => {
    const counts = heardFromCounts([
      enquiry({ id: "a", heardFrom: "Facebook" }),
      enquiry({ id: "b", heardFrom: "facebook" }),
      enquiry({ id: "c", heardFrom: "  FACEBOOK " }),
      enquiry({ id: "d", heardFrom: "A friend" }),
    ]);

    // Grouped without regard to case, but shown the way the first person
    // spelled it - a list of the owner's own answers in lower case reads as a
    // bug, not as tidying.
    expect(counts).toEqual([
      { source: "Facebook", count: 3 },
      { source: "A friend", count: 1 },
    ]);
  });

  it("leaves out the ones who did not say", () => {
    const counts = heardFromCounts([
      enquiry({ id: "a", heardFrom: null }),
      enquiry({ id: "b", heardFrom: "   " }),
      enquiry({ id: "c", heardFrom: "Facebook" }),
    ]);
    expect(counts).toEqual([{ source: "Facebook", count: 1 }]);
  });

  it("breaks a tie by name, so the order does not jump about", () => {
    const counts = heardFromCounts([
      enquiry({ id: "a", heardFrom: "walked past" }),
      enquiry({ id: "b", heardFrom: "a friend" }),
    ]);
    expect(counts.map((entry) => entry.source)).toEqual([
      "a friend",
      "walked past",
    ]);
  });

  it("is empty when nobody said", () => {
    expect(heardFromCounts([])).toEqual([]);
  });
});
