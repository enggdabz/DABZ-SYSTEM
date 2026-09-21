import { describe, expect, it } from "vitest";

import {
  DIGEST_BODY_LIMIT,
  MAX_FAILURES,
  buildDigest,
  digestIsDue,
  digestLines,
  enquiryAlert,
  pushSetup,
  subscriptionVerdict,
  type DigestInput,
} from "./notifications";
import { parsePesos } from "./money";

const QUIET: DigestInput = {
  billsOverdue: { count: 0, totalCentavos: 0 },
  billsDueSoon: { count: 0, totalCentavos: 0 },
  unansweredEnquiries: 0,
  unclaimedUnits: 0,
  lowStockItems: 0,
};

function input(over: Partial<DigestInput> = {}): DigestInput {
  return { ...QUIET, ...over };
}

describe("a quiet shop is not interrupted", () => {
  it("sends nothing at all when nothing needs doing", () => {
    expect(buildDigest(QUIET)).toBeNull();
  });

  /*
    The failure this guards against is the opposite of a missing warning: a
    cheerful "all clear" every morning is what teaches somebody to swipe the
    notification away without reading it, and then the one that mattered goes
    with it.
  */
  it("does not send an all-clear", () => {
    const digest = buildDigest(QUIET);
    expect(digest).toBeNull();
    expect(digest?.body).toBeUndefined();
  });

  it("wakes up for a single thing", () => {
    const digest = buildDigest(input({ lowStockItems: 1 }));
    expect(digest).not.toBeNull();
    expect(digest?.body).toBe("1 material low");
  });
});

describe("what the digest says", () => {
  it("counts the things, not the lines, in the title", () => {
    const digest = buildDigest(
      input({
        billsOverdue: { count: 2, totalCentavos: parsePesos("4500") },
        lowStockItems: 3,
      }),
    );
    // Two bills and three materials is five things, across two lines.
    expect(digest?.title).toBe("5 things need you today");
  });

  it("uses the singular when there is exactly one", () => {
    expect(buildDigest(input({ unclaimedUnits: 1 }))?.title).toBe(
      "1 thing needs you today",
    );
  });

  it("names the money on a bill, because that is the decision", () => {
    const digest = buildDigest(
      input({ billsOverdue: { count: 2, totalCentavos: parsePesos("4500") } }),
    );
    expect(digest?.body).toBe("2 bills overdue (₱4,500.00)");
  });

  it("gets its plurals right", () => {
    expect(
      buildDigest(input({ billsDueSoon: { count: 1, totalCentavos: 100 } }))?.body,
    ).toContain("1 bill due within 5 days");
    expect(
      buildDigest(input({ billsDueSoon: { count: 2, totalCentavos: 100 } }))?.body,
    ).toContain("2 bills due within 5 days");
    expect(buildDigest(input({ unansweredEnquiries: 1 }))?.body).toBe(
      "1 customer message waiting",
    );
    expect(buildDigest(input({ unansweredEnquiries: 4 }))?.body).toBe(
      "4 customer messages waiting",
    );
  });

  it("leaves a zero out rather than writing it", () => {
    const digest = buildDigest(input({ unclaimedUnits: 2 }));
    expect(digest?.body).toBe("2 units not collected");
    expect(digest?.body).not.toContain("0 ");
  });

  it("sends the owner to the Overview, where all of these are cards", () => {
    expect(buildDigest(input({ lowStockItems: 1 }))?.url).toBe("/overview");
  });
});

describe("the order it puts things in", () => {
  const busy = input({
    billsOverdue: { count: 1, totalCentavos: parsePesos("1000") },
    billsDueSoon: { count: 1, totalCentavos: parsePesos("2000") },
    unansweredEnquiries: 1,
    unclaimedUnits: 1,
    lowStockItems: 1,
  });

  it("puts what is already late before what is about to be", () => {
    const kinds = digestLines(busy).map((line) => line.kind);
    expect(kinds).toEqual([
      "bills_overdue",
      "bills_due_soon",
      "enquiries",
      "unclaimed",
      "low_stock",
    ]);
  });

  it("puts a person waiting above a thing on a shelf", () => {
    const kinds = digestLines(busy).map((line) => line.kind);
    expect(kinds.indexOf("enquiries")).toBeLessThan(kinds.indexOf("unclaimed"));
    expect(kinds.indexOf("enquiries")).toBeLessThan(kinds.indexOf("low_stock"));
  });

  it("keeps that order however the input is shaped", () => {
    const onlyLate = digestLines(input({ lowStockItems: 2, unclaimedUnits: 1 }));
    expect(onlyLate.map((line) => line.kind)).toEqual(["unclaimed", "low_stock"]);
  });
});

describe("fitting a lock screen", () => {
  /*
    Deliberately absurd, because the limit is 160 characters and a realistic
    bad day does not reach it - five lines of ordinary figures come to about
    146. The truncation only has to be right when it fires, and this is what
    makes it fire.
  */
  const crowded = input({
    billsOverdue: { count: 9999, totalCentavos: parsePesos("99999999.99") },
    billsDueSoon: { count: 8888, totalCentavos: parsePesos("99999999.99") },
    unansweredEnquiries: 7777,
    unclaimedUnits: 6666,
    lowStockItems: 5555,
  });

  const digest = buildDigest(crowded);

  it("stays inside the limit", () => {
    expect(digest!.body.length).toBeLessThanOrEqual(DIGEST_BODY_LIMIT);
  });

  it("counts what it left out instead of cutting a sentence in half", () => {
    expect(digest!.body).toMatch(/ · and \d+ more$/);
    expect(digest!.body).not.toContain("…");
    expect(digest!.body).not.toMatch(/\(₱[\d,]*$/);
  });

  it("keeps the most urgent line, which is the one that got cut for", () => {
    expect(digest!.body.startsWith("9999 bills overdue")).toBe(true);
  });

  it("still reports every line in the data, even the ones not shown", () => {
    // The body is for reading; `lines` is for anything that wants the truth.
    expect(digest!.lines).toHaveLength(5);
    expect(digest!.title).toBe("38885 things need you today");
  });

  it("does not add \"and more\" when everything fitted", () => {
    const small = buildDigest(input({ unclaimedUnits: 2 }));
    expect(small!.body).not.toContain("more");
  });

  it("shows a single over-long line rather than nothing at all", () => {
    // One line that busts the limit on its own must still be sent: a warning
    // nobody sees is worse than a warning the phone truncates.
    const one = buildDigest(
      input({
        billsOverdue: { count: 999999, totalCentavos: parsePesos("99999999.99") },
      }),
    );
    expect(one).not.toBeNull();
    expect(one!.body).toContain("999999 bills overdue");
  });
});

describe("the customer message alert", () => {
  it("says somebody wrote, and nothing about who", () => {
    const alert = enquiryAlert({ waiting: 1 });
    expect(alert.title).toBe("A customer has messaged the shop");
    expect(alert.body).toBe("Tap to read it and reply.");
    expect(alert.url).toBe("/enquiries");
  });

  it("carries no name, number or message text", () => {
    const alert = enquiryAlert({ waiting: 3 });
    const everything = `${alert.title} ${alert.body}`;
    // A lock screen is readable by whoever is standing near the phone, and a
    // stranger's details are Owner/Admin material (spec 4.3).
    expect(everything).not.toMatch(/@|09\d{9}|\+63/);
    expect(alert.body).toBe("3 messages are now waiting for a reply.");
  });

  it("never reads as zero, however it is called", () => {
    expect(enquiryAlert({ waiting: 0 }).body).toBe("Tap to read it and reply.");
    expect(enquiryAlert({ waiting: -4 }).body).toBe("Tap to read it and reply.");
  });
});

describe("when the morning digest is due", () => {
  const base = {
    lastDigestOnISO: null as string | null,
    todayISO: "2026-09-21",
    manilaHour: 9,
    workDayStart: "08:00",
  };

  it("sends once the shop has opened", () => {
    expect(digestIsDue(base)).toBe(true);
  });

  it("holds until opening time", () => {
    expect(digestIsDue({ ...base, manilaHour: 7 })).toBe(false);
    expect(digestIsDue({ ...base, manilaHour: 8 })).toBe(true);
  });

  /*
    The one that matters. A cron can run twice, be re-run by hand, or be moved,
    and a shop owner who gets the same summary three times learns to ignore all
    three.
  */
  it("never sends twice in one day", () => {
    expect(digestIsDue({ ...base, lastDigestOnISO: "2026-09-21" })).toBe(false);
  });

  it("sends again the next day", () => {
    expect(digestIsDue({ ...base, lastDigestOnISO: "2026-09-20" })).toBe(true);
  });

  it("catches up on a day that was missed entirely", () => {
    // The job did not run for a week; the next run still sends today's.
    expect(digestIsDue({ ...base, lastDigestOnISO: "2026-09-14" })).toBe(true);
  });

  it("follows the shop's own opening time, not a number in the code", () => {
    expect(digestIsDue({ ...base, manilaHour: 6, workDayStart: "06:00" })).toBe(true);
    expect(digestIsDue({ ...base, manilaHour: 9, workDayStart: "10:00" })).toBe(false);
  });

  it("sends rather than stays silent when the setting is unreadable", () => {
    // A broken setting must not quietly switch the shop's warnings off.
    expect(digestIsDue({ ...base, manilaHour: 0, workDayStart: "" })).toBe(true);
    expect(digestIsDue({ ...base, manilaHour: 0, workDayStart: "nonsense" })).toBe(true);
  });
});

describe("a phone that stops answering", () => {
  it("switches off a subscription the push service says is gone", () => {
    for (const statusCode of [404, 410]) {
      const verdict = subscriptionVerdict({ statusCode, failureCount: 0 });
      expect(verdict.keepActive).toBe(false);
      expect(verdict.reason).toContain("no longer accepting");
    }
  });

  it("keeps a working one, with nothing to explain", () => {
    expect(subscriptionVerdict({ statusCode: 201, failureCount: 3 })).toEqual({
      keepActive: true,
      reason: null,
    });
  });

  it("forgives a bad afternoon rather than switching the phone off", () => {
    const verdict = subscriptionVerdict({ statusCode: 500, failureCount: 0 });
    expect(verdict.keepActive).toBe(true);
    expect(verdict.reason).toContain("try again tomorrow");
  });

  it("gives up only after a long run of failures", () => {
    expect(
      subscriptionVerdict({ statusCode: 500, failureCount: MAX_FAILURES - 2 })
        .keepActive,
    ).toBe(true);
    expect(
      subscriptionVerdict({ statusCode: 500, failureCount: MAX_FAILURES - 1 })
        .keepActive,
    ).toBe(false);
  });

  it("handles no answer at all the same as a bad one", () => {
    const verdict = subscriptionVerdict({ statusCode: null, failureCount: 0 });
    expect(verdict.keepActive).toBe(true);
    expect(verdict.reason).not.toContain("(null)");
  });
});

describe("whether notifications are set up", () => {
  it("is ready when both keys exist", () => {
    expect(pushSetup({ publicKey: "pub", privateKey: "priv" })).toEqual({
      ready: true,
      missing: [],
    });
  });

  it("names exactly what is missing, so Settings can print it", () => {
    expect(pushSetup({ publicKey: null, privateKey: null }).missing).toEqual([
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
    ]);
    expect(pushSetup({ publicKey: "pub", privateKey: undefined }).missing).toEqual([
      "VAPID_PRIVATE_KEY",
    ]);
  });

  it("treats an empty or blank value as missing, not as set", () => {
    // A key set to "" in Vercel is the commonest way this half-works.
    expect(pushSetup({ publicKey: "", privateKey: "priv" }).ready).toBe(false);
    expect(pushSetup({ publicKey: "   ", privateKey: "priv" }).ready).toBe(false);
  });
});
