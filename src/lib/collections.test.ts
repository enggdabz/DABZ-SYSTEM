import { describe, expect, it } from "vitest";

import {
  breakdownCollections,
  checkPaymentAmount,
  collectedTotal,
  collectionsReport,
  defaultPaymentKind,
  filterCollections,
  heldForUnfinishedWork,
  liveCollections,
  paymentKindLabel,
  receiptFigures,
  searchPayableJobs,
  totalsByDivision,
  totalsBySource,
  type CollectionRow,
  type PayableJob,
} from "./collections";
import { parsePesos, sumCentavos } from "./money";

function row(over: Partial<CollectionRow> = {}): CollectionRow {
  return {
    id: over.id ?? "row-1",
    kind: over.kind ?? "counter_sale",
    division: over.division ?? "printshoppe",
    paymentKind: over.paymentKind === undefined ? "sale" : over.paymentKind,
    reference: over.reference ?? "S-260921-001",
    customerName: over.customerName ?? null,
    amountCentavos: over.amountCentavos ?? parsePesos("30"),
    source: over.source ?? "cash_drawer",
    referenceNumber: over.referenceNumber ?? null,
    takenAt: over.takenAt ?? "2026-09-21T02:00:00.000Z",
    recordedForISO: over.recordedForISO ?? "2026-09-21",
    takenBy: over.takenBy ?? "Eddie",
    voidedAt: over.voidedAt ?? null,
    href: over.href ?? "/sales/row-1",
  };
}

/** The three rows the owner's own walkthrough in PHASES.md uses. */
function walkthrough(): CollectionRow[] {
  return [
    row({
      id: "sale",
      amountCentavos: parsePesos("30"),
      source: "cash_drawer",
    }),
    row({
      id: "apparel",
      kind: "apparel_payment",
      division: "apparel",
      paymentKind: "down_payment",
      reference: "A-260921-001",
      customerName: "San Carlos Runners",
      amountCentavos: parsePesos("500"),
      source: "gcash",
      href: "/apparel/apparel",
    }),
    row({
      id: "repair",
      kind: "repair_payment",
      division: "dabztech",
      paymentKind: "down_payment",
      reference: "T-260921-001",
      customerName: "Mrs Reyes",
      amountCentavos: parsePesos("200"),
      source: "cash_drawer",
      href: "/repairs/repair",
    }),
  ];
}

describe("the three doors add up to one day", () => {
  it("totals the owner's walkthrough at PHP 730", () => {
    expect(collectedTotal(walkthrough())).toBe(parsePesos("730"));
  });

  it("splits PHP 730 across the three doors", () => {
    expect(totalsByDivision(walkthrough())).toEqual({
      printshoppe: parsePesos("30"),
      apparel: parsePesos("500"),
      dabztech: parsePesos("200"),
    });
  });

  it("splits PHP 730 across the methods: PHP 230 cash, PHP 500 GCash", () => {
    expect(totalsBySource(walkthrough())).toEqual({
      cash_drawer: parsePesos("230"),
      gcash: parsePesos("500"),
      maya: 0,
      bank: 0,
      owners_pocket: 0,
    });
  });

  it("keeps the parts adding back up to the whole", () => {
    const rows = walkthrough();
    const byDivision = totalsByDivision(rows);
    const bySource = totalsBySource(rows);

    expect(sumCentavos(Object.values(byDivision))).toBe(collectedTotal(rows));
    expect(sumCentavos(Object.values(bySource))).toBe(collectedTotal(rows));
  });
});

describe("a voided payment leaves every total at once", () => {
  const rows = walkthrough().map((entry) =>
    entry.id === "apparel"
      ? { ...entry, voidedAt: "2026-09-21T05:00:00.000Z" }
      : entry,
  );

  it("drops out of the day's total", () => {
    expect(collectedTotal(rows)).toBe(parsePesos("230"));
  });

  it("drops out of its division and its method together", () => {
    expect(totalsByDivision(rows).apparel).toBe(0);
    expect(totalsBySource(rows).gcash).toBe(0);
  });

  it("drops out of the report", () => {
    expect(collectionsReport(rows).totalCentavos).toBe(parsePesos("230"));
  });

  it("drops out of the end-of-day breakdown, but is still counted as voided", () => {
    const breakdown = breakdownCollections(rows);
    expect(breakdown.totalCentavos).toBe(parsePesos("230"));
    expect(breakdown.voidedCount).toBe(1);
    expect(breakdown.voidedCentavos).toBe(parsePesos("500"));
  });

  it("stays in the list, so the receipt the customer holds can be found", () => {
    expect(rows).toHaveLength(3);
    expect(liveCollections(rows)).toHaveLength(2);
  });
});

describe("filters", () => {
  const rows = walkthrough();

  it("shows one door at a time", () => {
    expect(filterCollections(rows, { division: "apparel" })).toHaveLength(1);
    expect(filterCollections(rows, { division: "printshoppe" })).toHaveLength(1);
  });

  it("shows one method at a time", () => {
    expect(filterCollections(rows, { source: "cash_drawer" })).toHaveLength(2);
    expect(filterCollections(rows, { source: "maya" })).toHaveLength(0);
  });

  it("combines a door and a method", () => {
    expect(
      filterCollections(rows, { division: "dabztech", source: "cash_drawer" }),
    ).toHaveLength(1);
    expect(
      filterCollections(rows, { division: "dabztech", source: "gcash" }),
    ).toHaveLength(0);
  });

  it("treats \"all\" as no filter at all", () => {
    expect(filterCollections(rows, { division: "all", source: "all" })).toHaveLength(3);
    expect(filterCollections(rows, {})).toHaveLength(3);
  });
});

describe("what a payment is called", () => {
  it("names the three kinds the system records", () => {
    expect(paymentKindLabel({ paymentKind: "sale" })).toBe("Sale");
    expect(paymentKindLabel({ paymentKind: "down_payment" })).toBe("Down payment");
    expect(paymentKindLabel({ paymentKind: "balance" })).toBe("Balance");
  });

  it("says plain \"Payment\" for an old DabzTech row rather than guessing", () => {
    expect(paymentKindLabel({ paymentKind: null })).toBe("Payment");
  });
});

describe("the end-of-day breakdown", () => {
  const rows = [
    ...walkthrough(),
    row({
      id: "apparel-balance",
      kind: "apparel_payment",
      division: "apparel",
      paymentKind: "balance",
      amountCentavos: parsePesos("1500"),
      source: "bank",
    }),
    row({
      id: "old-repair",
      kind: "repair_payment",
      division: "dabztech",
      paymentKind: null,
      amountCentavos: parsePesos("350"),
      source: "maya",
    }),
    row({
      id: "pocket",
      kind: "repair_payment",
      division: "dabztech",
      paymentKind: "balance",
      amountCentavos: parsePesos("400"),
      source: "owners_pocket",
    }),
  ];

  const breakdown = breakdownCollections(rows);

  it("shows every door, even one that took nothing", () => {
    expect(breakdown.divisions.map((entry) => entry.division)).toEqual([
      "printshoppe",
      "apparel",
      "dabztech",
    ]);
  });

  it("names the counter door \"Counter\", not \"Dabz Printshoppe\"", () => {
    expect(breakdown.divisions[0].label).toBe("Counter");
  });

  it("splits Apparel and DabzTech into down payments and balances", () => {
    const apparel = breakdown.divisions[1];
    expect(apparel.downPaymentCentavos).toBe(parsePesos("500"));
    expect(apparel.balanceCentavos).toBe(parsePesos("1500"));
    expect(apparel.unlabelledCentavos).toBe(0);

    const dabztech = breakdown.divisions[2];
    expect(dabztech.downPaymentCentavos).toBe(parsePesos("200"));
    expect(dabztech.balanceCentavos).toBe(parsePesos("400"));
    expect(dabztech.unlabelledCentavos).toBe(parsePesos("350"));
  });

  it("keeps each division's own split adding back up to its total", () => {
    for (const entry of breakdown.divisions) {
      expect(
        entry.downPaymentCentavos +
          entry.balanceCentavos +
          entry.unlabelledCentavos +
          // The counter's rows are "sale", which is none of the three above.
          sumCentavos(
            liveCollections(rows)
              .filter(
                (candidate) =>
                  candidate.division === entry.division &&
                  candidate.paymentKind === "sale",
              )
              .map((candidate) => candidate.amountCentavos),
          ),
      ).toBe(entry.totalCentavos);
    }
  });

  it("keeps the owner's pocket out of cash, in its own column", () => {
    const dabztech = breakdown.divisions[2];
    expect(dabztech.bySource.owners_pocket).toBe(parsePesos("400"));
    expect(dabztech.bySource.cash_drawer).toBe(parsePesos("200"));
    expect(breakdown.totalBySource.cash_drawer).toBe(parsePesos("230"));
  });

  it("makes the bottom row equal the sum of the rows above it", () => {
    const fromRows = sumCentavos(
      breakdown.divisions.map((entry) => entry.totalCentavos),
    );
    const fromColumns = sumCentavos(Object.values(breakdown.totalBySource));

    expect(fromRows).toBe(breakdown.totalCentavos);
    expect(fromColumns).toBe(breakdown.totalCentavos);
    expect(breakdown.totalCentavos).toBe(collectedTotal(rows));
  });

  it("makes each column equal the sum of that column's cells", () => {
    for (const source of ["cash_drawer", "gcash", "maya", "bank", "owners_pocket"] as const) {
      expect(breakdown.totalBySource[source]).toBe(
        sumCentavos(breakdown.divisions.map((entry) => entry.bySource[source])),
      );
    }
  });
});

describe("collections by division and kind, for a report", () => {
  const rows = [
    ...walkthrough(),
    row({
      id: "second-sale",
      amountCentavos: parsePesos("45"),
      source: "gcash",
    }),
    row({
      id: "apparel-balance",
      kind: "apparel_payment",
      division: "apparel",
      paymentKind: "balance",
      amountCentavos: parsePesos("1500"),
      source: "bank",
    }),
  ];

  const report = collectionsReport(rows);

  it("groups a door and a kind onto one line", () => {
    const counter = report.lines.find((line) => line.key === "printshoppe:sale");
    expect(counter?.amountCentavos).toBe(parsePesos("75"));
    expect(counter?.count).toBe(2);
  });

  it("keeps apparel down payments apart from apparel balances", () => {
    expect(
      report.lines.find((line) => line.key === "apparel:down_payment")
        ?.amountCentavos,
    ).toBe(parsePesos("500"));
    expect(
      report.lines.find((line) => line.key === "apparel:balance")?.amountCentavos,
    ).toBe(parsePesos("1500"));
  });

  it("leaves out a combination the shop never used", () => {
    expect(report.lines.find((line) => line.key === "dabztech:balance")).toBeUndefined();
  });

  it("adds every line back up to the period's total", () => {
    expect(sumCentavos(report.lines.map((line) => line.amountCentavos))).toBe(
      report.totalCentavos,
    );
    expect(sumCentavos(Object.values(report.totalBySource))).toBe(
      report.totalCentavos,
    );
    expect(report.totalCentavos).toBe(collectedTotal(rows));
  });

  it("orders the doors the way every other screen does", () => {
    const order = report.lines.map((line) => line.division);
    expect(order).toEqual([...order].sort(
      (a, b) =>
        ["printshoppe", "apparel", "dabztech"].indexOf(a) -
        ["printshoppe", "apparel", "dabztech"].indexOf(b),
    ));
  });

  it("labels an old unlabelled DabzTech payment without guessing", () => {
    const withOld = collectionsReport([
      row({
        id: "old",
        kind: "repair_payment",
        division: "dabztech",
        paymentKind: null,
        amountCentavos: parsePesos("350"),
      }),
    ]);
    expect(withOld.lines[0].key).toBe("dabztech:unlabelled");
    expect(withOld.lines[0].label).toBe("DabzTech · Payment");
  });
});

describe("finding the order at the counter", () => {
  const jobs: PayableJob[] = [
    {
      id: "order-1",
      kind: "apparel_order",
      division: "apparel",
      reference: "A-260921-001",
      customerName: "San Carlos Runners",
      detail: "0917 555 1234",
      totalCentavos: parsePesos("2000"),
      paidCentavos: parsePesos("500"),
      balanceCentavos: parsePesos("1500"),
      nothingPaidYet: false,
      href: "/apparel/order-1",
    },
    {
      id: "ticket-1",
      kind: "repair_ticket",
      division: "dabztech",
      reference: "T-260921-004",
      customerName: "Mrs Reyes",
      detail: "Acer laptop",
      totalCentavos: parsePesos("1200"),
      paidCentavos: 0,
      balanceCentavos: parsePesos("1200"),
      nothingPaidYet: true,
      href: "/repairs/ticket-1",
    },
  ];

  it("finds a job by its number", () => {
    expect(searchPayableJobs(jobs, "A-260921-001")).toHaveLength(1);
    expect(searchPayableJobs(jobs, "t-260921-004")[0].id).toBe("ticket-1");
  });

  it("finds a job by the customer's name, however it is typed", () => {
    expect(searchPayableJobs(jobs, "reyes")[0].id).toBe("ticket-1");
    expect(searchPayableJobs(jobs, "RUNNERS")[0].id).toBe("order-1");
  });

  it("finds a job by a phone number or the unit, because that is what people remember", () => {
    expect(searchPayableJobs(jobs, "5551234")).toHaveLength(0);
    expect(searchPayableJobs(jobs, "0917 555")[0].id).toBe("order-1");
    expect(searchPayableJobs(jobs, "acer")[0].id).toBe("ticket-1");
  });

  it("shows everything when nothing has been typed, rather than a blank box", () => {
    expect(searchPayableJobs(jobs, "")).toHaveLength(2);
    expect(searchPayableJobs(jobs, "   ")).toHaveLength(2);
  });
});

describe("what the counter will and will not take", () => {
  it("refuses nothing", () => {
    expect(checkPaymentAmount({ amountCentavos: 0, balanceCentavos: 100000 }).ok).toBe(
      false,
    );
    expect(
      checkPaymentAmount({ amountCentavos: -500, balanceCentavos: 100000 }).ok,
    ).toBe(false);
  });

  it("refuses more than is owed, and says why", () => {
    const check = checkPaymentAmount({
      amountCentavos: parsePesos("2000"),
      balanceCentavos: parsePesos("1500"),
    });
    expect(check.ok).toBe(false);
    expect(check.error).toContain("more than the balance");
  });

  it("takes the exact balance", () => {
    expect(
      checkPaymentAmount({
        amountCentavos: parsePesos("1500"),
        balanceCentavos: parsePesos("1500"),
      }).ok,
    ).toBe(true);
  });

  it("takes a part payment, however small", () => {
    expect(
      checkPaymentAmount({
        amountCentavos: parsePesos("0.01"),
        balanceCentavos: parsePesos("1500"),
      }).ok,
    ).toBe(true);
  });
});

describe("down payment or balance", () => {
  it("starts on down payment while nothing has been paid", () => {
    expect(defaultPaymentKind({ nothingPaidYet: true })).toBe("down_payment");
  });

  it("starts on balance once something has", () => {
    expect(defaultPaymentKind({ nothingPaidYet: false })).toBe("balance");
  });
});

describe("the figures on a payment receipt", () => {
  const livePayments = [
    { id: "p1", takenAt: "2026-09-20T01:00:00Z", amountCentavos: parsePesos("500") },
    { id: "p2", takenAt: "2026-09-21T01:00:00Z", amountCentavos: parsePesos("700") },
    { id: "p3", takenAt: "2026-09-22T01:00:00Z", amountCentavos: parsePesos("300") },
  ];

  const total = parsePesos("2000");

  it("counts only the payments taken before the one being printed", () => {
    const figures = receiptFigures({
      totalCentavos: total,
      livePayments,
      payment: { ...livePayments[1], voided: false },
    });

    expect(figures.paidBeforeCentavos).toBe(parsePesos("500"));
    expect(figures.thisPaymentCentavos).toBe(parsePesos("700"));
    expect(figures.paidAfterCentavos).toBe(parsePesos("1200"));
    expect(figures.balanceRemainingCentavos).toBe(parsePesos("800"));
  });

  it("shows nothing paid before on the very first payment", () => {
    const figures = receiptFigures({
      totalCentavos: total,
      livePayments,
      payment: { ...livePayments[0], voided: false },
    });
    expect(figures.paidBeforeCentavos).toBe(0);
    expect(figures.balanceRemainingCentavos).toBe(parsePesos("1500"));
  });

  it("adds its own rows back up, on every payment of the job", () => {
    for (const payment of livePayments) {
      const figures = receiptFigures({
        totalCentavos: total,
        livePayments,
        payment: { ...payment, voided: false },
      });
      expect(figures.paidBeforeCentavos + figures.thisPaymentCentavos).toBe(
        figures.paidAfterCentavos,
      );
      expect(figures.paidAfterCentavos + figures.balanceRemainingCentavos).toBe(
        figures.totalCentavos,
      );
    }
  });

  it("orders two payments taken in the same second by id, not by chance", () => {
    const sameSecond = [
      { id: "aaa", takenAt: "2026-09-21T01:00:00Z", amountCentavos: parsePesos("100") },
      { id: "bbb", takenAt: "2026-09-21T01:00:00Z", amountCentavos: parsePesos("200") },
    ];

    expect(
      receiptFigures({
        totalCentavos: total,
        livePayments: sameSecond,
        payment: { ...sameSecond[0], voided: false },
      }).paidBeforeCentavos,
    ).toBe(0);

    expect(
      receiptFigures({
        totalCentavos: total,
        livePayments: sameSecond,
        payment: { ...sameSecond[1], voided: false },
      }).paidBeforeCentavos,
    ).toBe(parsePesos("100"));
  });

  it("makes a voided payment add nothing, and leaves the balance where it was", () => {
    // p2 was voided, so it is no longer among the live payments.
    const afterVoid = [livePayments[0], livePayments[2]];

    const figures = receiptFigures({
      totalCentavos: total,
      livePayments: afterVoid,
      payment: { ...livePayments[1], voided: true },
    });

    expect(figures.thisPaymentCentavos).toBe(parsePesos("700"));
    expect(figures.paidBeforeCentavos).toBe(parsePesos("500"));
    // The 700 is NOT added: the money was handed back.
    expect(figures.paidAfterCentavos).toBe(parsePesos("500"));
    expect(figures.balanceRemainingCentavos).toBe(parsePesos("1500"));
  });

  it("says a job was overpaid rather than showing a negative balance", () => {
    const figures = receiptFigures({
      totalCentavos: parsePesos("1000"),
      livePayments,
      payment: { ...livePayments[2], voided: false },
    });

    // 500 + 700 before, then 300 more against a 1,000 job.
    expect(figures.balanceRemainingCentavos).toBe(0);
    expect(figures.overpaid).toBe(true);
    expect(figures.overpaidByCentavos).toBe(parsePesos("500"));
  });

  it("copes with a job nobody has priced yet", () => {
    const figures = receiptFigures({
      totalCentavos: 0,
      livePayments: [livePayments[0]],
      payment: { ...livePayments[0], voided: false },
    });
    expect(figures.balanceRemainingCentavos).toBe(0);
    expect(figures.overpaid).toBe(true);
    expect(figures.overpaidByCentavos).toBe(parsePesos("500"));
  });
});

describe("money held for work the shop still owes", () => {
  it("adds up both divisions and counts the jobs", () => {
    const held = heldForUnfinishedWork({
      apparel: [
        { paidCentavos: parsePesos("500") },
        { paidCentavos: parsePesos("1000") },
      ],
      dabztech: [{ paidCentavos: parsePesos("200") }],
    });

    expect(held.apparelCentavos).toBe(parsePesos("1500"));
    expect(held.dabztechCentavos).toBe(parsePesos("200"));
    expect(held.centavos).toBe(parsePesos("1700"));
    expect(held.orderCount).toBe(2);
    expect(held.ticketCount).toBe(1);
  });

  it("is zero, with nothing held, when every job is finished", () => {
    const held = heldForUnfinishedWork({ apparel: [], dabztech: [] });
    expect(held.centavos).toBe(0);
    expect(held.orderCount).toBe(0);
  });
});
