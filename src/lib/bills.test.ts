import { describe, expect, it } from "vitest";

import {
  REMINDER_DAYS,
  billLoanLink,
  billStatus,
  billsNeedingAttention,
  monthTotals,
  needsAttention,
  paidKey,
  totalMonthlyBills,
  type Bill,
} from "./bills";
import { parsePesos } from "./money";

const SEPT = { year: 2026, month: 9 };
const TODAY = { year: 2026, month: 9, day: 18 };

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "electricity",
    name: "Electricity",
    amountCentavos: parsePesos("35000"),
    dueDay: 20,
    type: "operating",
    loanId: null,
    active: true,
    ...overrides,
  };
}

describe("billStatus", () => {
  it("says Paid once the month is marked paid", () => {
    const status = billStatus({ dueDay: 5, period: SEPT, paid: true, today: TODAY });
    expect(status).toMatchObject({ kind: "paid", label: "Paid", tone: "success" });
    // A paid bill is never a warning, even if the due date went by.
    expect(status.warn).toBe(false);
  });

  it("asks for the due day instead of guessing one", () => {
    const status = billStatus({ dueDay: null, period: SEPT, paid: false, today: TODAY });
    expect(status).toMatchObject({
      kind: "due_day_not_set",
      label: "Due day not set",
      tone: "attention",
      warn: true,
    });
  });

  it("counts the days overdue", () => {
    expect(
      billStatus({ dueDay: 16, period: SEPT, paid: false, today: TODAY }),
    ).toMatchObject({ kind: "overdue", label: "Overdue 2 days", warn: true });

    expect(
      billStatus({ dueDay: 17, period: SEPT, paid: false, today: TODAY }).label,
    ).toBe("Overdue 1 day");
  });

  it("says Due today on the day itself", () => {
    expect(
      billStatus({ dueDay: 18, period: SEPT, paid: false, today: TODAY }),
    ).toMatchObject({ kind: "due_today", label: "Due today", warn: true });
  });

  it("warns from five days out, and not before", () => {
    // 23rd is 5 days after the 18th: the last day that counts as due soon.
    expect(
      billStatus({ dueDay: 23, period: SEPT, paid: false, today: TODAY }),
    ).toMatchObject({ kind: "due_soon", label: "Due in 5 days" });

    // 24th is 6 days out: not yet a warning.
    expect(
      billStatus({ dueDay: 24, period: SEPT, paid: false, today: TODAY }),
    ).toMatchObject({ kind: "not_yet_due", tone: "neutral", warn: false });

    expect(
      billStatus({ dueDay: 19, period: SEPT, paid: false, today: TODAY }).label,
    ).toBe("Due in 1 day");
  });

  it("shows the due date on a bill that is not yet due", () => {
    const status = billStatus({ dueDay: 28, period: SEPT, paid: false, today: TODAY });
    expect(status.label).toBe("Not yet paid · due Sep 28, 2026");
  });

  it("handles a bill due on the 31st in a short month", () => {
    // Due on the 31st, checked on 28 February 2026: February ends on the 28th,
    // so the bill is due today, not skipped and not overdue.
    expect(
      billStatus({
        dueDay: 31,
        period: { year: 2026, month: 2 },
        paid: false,
        today: { year: 2026, month: 2, day: 28 },
      }),
    ).toMatchObject({ kind: "due_today" });

    // In a leap year the same bill is due on the 29th.
    expect(
      billStatus({
        dueDay: 31,
        period: { year: 2028, month: 2 },
        paid: false,
        today: { year: 2028, month: 2, day: 28 },
      }),
    ).toMatchObject({ kind: "due_soon", label: "Due in 1 day" });
  });

  it("only warns for the statuses the reminder is about", () => {
    const kinds = [
      { dueDay: 5, paid: true, expected: false },
      { dueDay: 16, paid: false, expected: true }, // overdue
      { dueDay: 18, paid: false, expected: true }, // due today
      { dueDay: 21, paid: false, expected: true }, // due soon
      { dueDay: 28, paid: false, expected: false }, // not yet due
      { dueDay: null, paid: false, expected: false }, // needs an answer, not money
    ];

    for (const { dueDay, paid, expected } of kinds) {
      const status = billStatus({ dueDay, period: SEPT, paid, today: TODAY });
      expect(needsAttention(status), status.kind).toBe(expected);
    }
  });
});

describe("billsNeedingAttention", () => {
  const bills = [
    bill({ id: "electricity", name: "Electricity", dueDay: 16 }), // overdue 2
    bill({ id: "water", name: "Water", dueDay: 18 }), // due today
    bill({ id: "internet", name: "Internet", dueDay: 21 }), // due in 3
    bill({ id: "rent", name: "Rent", dueDay: 28 }), // not yet due
    bill({ id: "bir", name: "BIR", dueDay: null }), // no due day
  ];

  it("lists only what is overdue or due within five days", () => {
    const result = billsNeedingAttention({
      bills,
      paidKeys: new Set(),
      period: SEPT,
      today: TODAY,
    });

    expect(result.map((entry) => entry.bill.id)).toEqual([
      "electricity", // overdue 2 days
      "water", // due today
      "internet", // due in 3 days
    ]);
  });

  it("puts the most urgent first", () => {
    const result = billsNeedingAttention({
      bills: [
        bill({ id: "a", dueDay: 21 }), // due in 3
        bill({ id: "b", dueDay: 10 }), // overdue 8
        bill({ id: "c", dueDay: 18 }), // due today
      ],
      paidKeys: new Set(),
      period: SEPT,
      today: TODAY,
    });
    expect(result.map((entry) => entry.bill.id)).toEqual(["b", "c", "a"]);
  });

  it("leaves out a bill already marked paid", () => {
    const result = billsNeedingAttention({
      bills,
      paidKeys: new Set([paidKey("electricity", SEPT), paidKey("water", SEPT)]),
      period: SEPT,
      today: TODAY,
    });
    expect(result.map((entry) => entry.bill.id)).toEqual(["internet"]);
  });

  it("looks into next month near the end of this one", () => {
    // On 29 September, a bill due on 2 October is 3 days away.
    const result = billsNeedingAttention({
      bills: [bill({ id: "cp_plan", name: "CP Plan", dueDay: 2 })],
      paidKeys: new Set([paidKey("cp_plan", SEPT)]),
      period: SEPT,
      today: { year: 2026, month: 9, day: 29 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].period).toEqual({ year: 2026, month: 10 });
    expect(result[0].status.label).toBe("Due in 3 days");
  });

  it("crosses into a new year when December runs out", () => {
    const result = billsNeedingAttention({
      bills: [bill({ id: "rent", dueDay: 3 })],
      paidKeys: new Set([paidKey("rent", { year: 2026, month: 12 })]),
      period: { year: 2026, month: 12 },
      today: { year: 2026, month: 12, day: 30 },
    });

    expect(result[0].period).toEqual({ year: 2027, month: 1 });
    expect(result[0].status.label).toBe("Due in 4 days");
  });

  it("shows a bill once, not twice, when both months qualify", () => {
    // Due on the 20th: September's is overdue on 25 October... no - here today
    // is 29 September, so September's instance is overdue by 9 days AND
    // October's is due in 21 days. Only the urgent one should show.
    const result = billsNeedingAttention({
      bills: [bill({ id: "electricity", dueDay: 20 })],
      paidKeys: new Set(),
      period: SEPT,
      today: { year: 2026, month: 9, day: 29 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].period).toEqual(SEPT);
    expect(result[0].status.label).toBe("Overdue 9 days");
  });

  it("ignores a bill that is no longer active", () => {
    const result = billsNeedingAttention({
      bills: [bill({ id: "old", dueDay: 16, active: false })],
      paidKeys: new Set(),
      period: SEPT,
      today: TODAY,
    });
    expect(result).toEqual([]);
  });

  it("uses a five-day window, matching the specification", () => {
    expect(REMINDER_DAYS).toBe(5);
  });
});

describe("monthTotals", () => {
  // The owner's real bills from spec 12.1.
  const realBills: Bill[] = [
    bill({ id: "electricity", name: "Electricity", amountCentavos: parsePesos("35000"), dueDay: 20 }),
    bill({ id: "water", name: "Water", amountCentavos: parsePesos("1500"), dueDay: 10 }),
    bill({ id: "internet", name: "Internet", amountCentavos: parsePesos("2100"), dueDay: 15 }),
    bill({ id: "magic", name: "Magic Payment", amountCentavos: parsePesos("1677"), dueDay: null }),
    bill({ id: "bir", name: "BIR", amountCentavos: parsePesos("1500"), dueDay: null }),
    bill({ id: "rent", name: "Rent", amountCentavos: parsePesos("20000"), dueDay: 5 }),
    bill({ id: "cp", name: "CP Plan", amountCentavos: parsePesos("4500"), dueDay: null }),
    bill({ id: "lupa", name: "Lupa Lilimasan", amountCentavos: parsePesos("20000"), dueDay: null, type: "loan_installment" }),
    bill({ id: "bpi", name: "BPI", amountCentavos: parsePesos("33250"), dueDay: null, type: "loan_installment" }),
    bill({ id: "cc", name: "Credit card", amountCentavos: parsePesos("12000"), dueDay: null, type: "loan_installment" }),
    bill({ id: "forests", name: "Forests Lake", amountCentavos: parsePesos("9600"), dueDay: null, type: "loan_installment" }),
  ];

  it("adds up to the owner's stated monthly total", () => {
    // Spec 12.1 says PHP 141,127 a month. If this ever stops matching, either
    // the seed data or the owner's figure has changed.
    expect(totalMonthlyBills(realBills)).toBe(parsePesos("141127"));
  });

  it("splits paid from unpaid without losing a centavo", () => {
    const totals = monthTotals({
      bills: realBills,
      paidKeys: new Set([paidKey("electricity", SEPT), paidKey("rent", SEPT)]),
      period: SEPT,
      today: TODAY,
    });

    expect(totals.paid).toBe(parsePesos("55000")); // 35,000 + 20,000
    expect(totals.unpaid).toBe(parsePesos("86127"));
    expect(totals.paid + totals.unpaid).toBe(totals.total);
    expect(totals.total).toBe(parsePesos("141127"));
    expect(totals.paidCount).toBe(2);
    expect(totals.unpaidCount).toBe(9);
  });

  it("counts how many bills still need a due day", () => {
    const totals = monthTotals({
      bills: realBills,
      paidKeys: new Set(),
      period: SEPT,
      today: TODAY,
    });
    // Seven of the eleven have no due day yet (open decision 17.13).
    expect(totals.missingDueDayCount).toBe(7);
  });

  it("counts what needs attention today", () => {
    const totals = monthTotals({
      bills: realBills,
      paidKeys: new Set(),
      period: SEPT,
      today: TODAY,
    });
    // Water (10th) and Internet (15th) and Rent (5th) are overdue;
    // Electricity (20th) is due in 2 days. Bills with no due day do not count.
    expect(totals.attentionCount).toBe(4);
  });

  it("reports zeros for a month with no bills", () => {
    expect(
      monthTotals({ bills: [], paidKeys: new Set(), period: SEPT, today: TODAY }),
    ).toMatchObject({ total: 0, paid: 0, unpaid: 0, paidCount: 0, unpaidCount: 0 });
  });

  it("keeps each month separate", () => {
    // September marked paid must not make October look paid.
    const paidKeys = new Set([paidKey("rent", SEPT)]);
    const october = monthTotals({
      bills: [bill({ id: "rent", amountCentavos: parsePesos("20000"), dueDay: 5 })],
      paidKeys,
      period: { year: 2026, month: 10 },
      today: TODAY,
    });
    expect(october.paid).toBe(0);
    expect(october.unpaid).toBe(parsePesos("20000"));
  });
});

describe("billLoanLink", () => {
  /*
    The bug this exists to stop: a bill labelled "Loan installment" with no
    loan behind it. `mark_bill_paid` only writes a loan payment when
    `bills.loan_id` is set, so such a bill takes money out of the ledger every
    month and leaves the balance untouched - and nothing looks wrong, which is
    what makes it dangerous. Until the seeded bills were cleared, the link
    arrived with them and no form ever set it.
  */
  it("keeps the loan an installment bill was pointed at", () => {
    expect(billLoanLink("loan_installment", "loan-1")).toBe("loan-1");
  });

  it("allows an installment that has no loan to point at yet", () => {
    // Real state: the owner entered the bill before the loan.
    expect(billLoanLink("loan_installment", "")).toBeNull();
    expect(billLoanLink("loan_installment", null)).toBeNull();
    expect(billLoanLink("loan_installment", undefined)).toBeNull();
  });

  it("clears the link when a bill stops being an installment", () => {
    // The half that actually bites: a bill changed back to an operating cost
    // must stop paying a debt down, or it keeps doing it invisibly.
    expect(billLoanLink("operating", "loan-1")).toBeNull();
  });

  it("does not treat whitespace as a loan", () => {
    expect(billLoanLink("loan_installment", "   ")).toBeNull();
  });

  it("trims what it is given, so a stray space cannot break the key", () => {
    expect(billLoanLink("loan_installment", " loan-1 ")).toBe("loan-1");
  });
});
