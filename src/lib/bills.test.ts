import { describe, expect, it } from "vitest";

import {
  REMINDER_DAYS,
  billAppliesTo,
  billLoanLink,
  billStatus,
  carriedOverBills,
  compareByDueDate,
  billsNeedingAttention,
  monthTotals,
  needsAttention,
  paidKey,
  partPaidTotals,
  remainingFor,
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
    frequency: "monthly",
    startsMonth: null,
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

describe("monthly and one-time bills", () => {
  const AUG = { year: 2026, month: 8 };
  const OCT = { year: 2026, month: 10 };

  it("owes a monthly bill from its first month onwards, never before", () => {
    const rent = bill({ startsMonth: SEPT });
    expect(billAppliesTo(rent, AUG)).toBe(false);
    expect(billAppliesTo(rent, SEPT)).toBe(true);
    expect(billAppliesTo(rent, OCT)).toBe(true);
  });

  it("owes a one-time bill in its own month only", () => {
    const repair = bill({ frequency: "one_time", startsMonth: SEPT });
    expect(billAppliesTo(repair, AUG)).toBe(false);
    expect(billAppliesTo(repair, SEPT)).toBe(true);
    expect(billAppliesTo(repair, OCT)).toBe(false);
  });

  it("counts a one-time bill in the daily target for its own month only", () => {
    const bills = [
      bill({ id: "rent", amountCentavos: parsePesos("10000"), startsMonth: SEPT }),
      bill({
        id: "aircon",
        amountCentavos: parsePesos("4500"),
        frequency: "one_time",
        startsMonth: SEPT,
      }),
    ];
    expect(totalMonthlyBills(bills, SEPT)).toBe(parsePesos("14500"));
    expect(totalMonthlyBills(bills, OCT)).toBe(parsePesos("10000"));
  });

  it("leaves a one-time bill out of another month's totals", () => {
    const totals = monthTotals({
      bills: [bill({ frequency: "one_time", startsMonth: OCT })],
      paidKeys: new Set(),
      period: SEPT,
      today: TODAY,
    });
    expect(totals.total).toBe(0);
    expect(totals.unpaidCount).toBe(0);
  });
});

describe("carriedOverBills (priority bills)", () => {
  const OCT = { year: 2026, month: 10 };
  const OCT_2 = { year: 2026, month: 10, day: 2 };

  it("carries a bill unpaid last month into this month", () => {
    const water = bill({ id: "water", dueDay: 15, startsMonth: SEPT });
    const carried = carriedOverBills({
      bills: [water],
      paidKeys: new Set(),
      period: OCT,
      today: OCT_2,
    });
    expect(carried).toHaveLength(1);
    expect(carried[0].period).toEqual(SEPT);
    expect(carried[0].status).toMatchObject({ kind: "overdue", warn: true });
    expect(carried[0].status.label).toBe(
      "Unpaid from September 2026 · overdue 17 days",
    );
  });

  it("does not carry a month that was paid", () => {
    const water = bill({ id: "water", startsMonth: SEPT });
    expect(
      carriedOverBills({
        bills: [water],
        paidKeys: new Set([paidKey("water", SEPT)]),
        period: OCT,
        today: OCT_2,
      }),
    ).toEqual([]);
  });

  it("keeps carrying every unpaid month, oldest first, not only last month", () => {
    const rent = bill({ id: "rent", startsMonth: { year: 2026, month: 7 } });
    const carried = carriedOverBills({
      bills: [rent],
      paidKeys: new Set([paidKey("rent", { year: 2026, month: 8 })]),
      period: OCT,
      today: OCT_2,
    });
    expect(carried.map((entry) => entry.period.month)).toEqual([7, 9]);
  });

  it("carries an unpaid one-time bill forward until it is paid", () => {
    const repair = bill({ id: "repair", frequency: "one_time", startsMonth: SEPT });
    const carried = carriedOverBills({
      bills: [repair],
      paidKeys: new Set(),
      period: { year: 2026, month: 11 },
      today: { year: 2026, month: 11, day: 3 },
    });
    expect(carried.map((entry) => entry.period)).toEqual([SEPT]);
  });

  it("never calls the current month unpaid, even when looking ahead", () => {
    const water = bill({ id: "water", startsMonth: SEPT });
    const carried = carriedOverBills({
      bills: [water],
      paidKeys: new Set([paidKey("water", SEPT)]),
      period: { year: 2026, month: 11 },
      today: OCT_2,
    });
    // October has not ended, so it is not carried into November yet.
    expect(carried).toEqual([]);
  });

  it("invents no backlog for a bill with no first month, or a stopped one", () => {
    expect(
      carriedOverBills({
        bills: [bill({ startsMonth: null }), bill({ id: "x", startsMonth: SEPT, active: false })],
        paidKeys: new Set(),
        period: OCT,
        today: OCT_2,
      }),
    ).toEqual([]);
  });

  it("adds carried bills to the month's totals separately, to the centavo", () => {
    const totals = monthTotals({
      bills: [
        bill({ id: "a", amountCentavos: parsePesos("100.25"), dueDay: 28, startsMonth: SEPT }),
        bill({ id: "b", amountCentavos: parsePesos("50.50"), dueDay: 28, startsMonth: SEPT }),
      ],
      paidKeys: new Set([paidKey("b", SEPT)]),
      period: OCT,
      today: OCT_2,
    });
    expect(totals.total).toBe(parsePesos("150.75"));
    expect(totals.unpaid).toBe(parsePesos("150.75"));
    expect(totals.carriedOver).toBe(parsePesos("100.25"));
    expect(totals.carriedOverCount).toBe(1);
    expect(totals.attentionCount).toBe(1);
  });

  it("puts a carried bill in the reminder once, as overdue", () => {
    const water = bill({ id: "water", dueDay: 3, startsMonth: SEPT });
    const attention = billsNeedingAttention({
      bills: [water],
      paidKeys: new Set(),
      period: OCT,
      today: OCT_2,
    });
    expect(attention).toHaveLength(1);
    expect(attention[0].period).toEqual(SEPT);
    expect(attention[0].status.kind).toBe("overdue");
  });
});

describe("compareByDueDate", () => {
  it("lists bills by due day, with no due day last and ties by name", () => {
    const sorted = [
      bill({ id: "1", name: "Water", dueDay: null }),
      bill({ id: "2", name: "Rent", dueDay: 25 }),
      bill({ id: "3", name: "Internet", dueDay: 5 }),
      bill({ id: "4", name: "Electricity", dueDay: 5 }),
    ].sort(compareByDueDate);
    expect(sorted.map((b) => b.name)).toEqual([
      "Electricity",
      "Internet",
      "Rent",
      "Water",
    ]);
  });
});

describe("part payments", () => {
  const OCT = { year: 2026, month: 10 };
  const OCT_2 = { year: 2026, month: 10, day: 2 };

  it("adds up only the part payments, per bill and month", () => {
    const totals = partPaidTotals([
      { key: "a:2026-09", amountCentavos: parsePesos("1000"), isPartial: true },
      { key: "a:2026-09", amountCentavos: parsePesos("500.50"), isPartial: true },
      { key: "a:2026-10", amountCentavos: parsePesos("200"), isPartial: true },
      { key: "b:2026-09", amountCentavos: parsePesos("999"), isPartial: false },
    ]);
    expect(totals.get("a:2026-09")).toBe(parsePesos("1500.50"));
    expect(totals.get("a:2026-10")).toBe(parsePesos("200"));
    expect(totals.has("b:2026-09")).toBe(false);
  });

  it("leaves only the remaining amount, never below zero", () => {
    const rent = bill({ id: "rent", amountCentavos: parsePesos("5000") });
    expect(
      remainingFor(rent, SEPT, new Map([["rent:2026-09", parsePesos("1250.25")]])),
    ).toBe(parsePesos("3749.75"));
    expect(remainingFor(rent, SEPT, new Map([["rent:2026-09", parsePesos("6000")]]))).toBe(0);
    expect(remainingFor(rent, SEPT)).toBe(parsePesos("5000"));
  });

  it("counts a part payment as paid and only the rest as still to pay", () => {
    const totals = monthTotals({
      bills: [bill({ id: "rent", amountCentavos: parsePesos("5000") })],
      paidKeys: new Set(),
      partPaid: new Map([["rent:2026-09", parsePesos("2000")]]),
      period: SEPT,
      today: TODAY,
    });
    expect(totals.paid).toBe(parsePesos("2000"));
    expect(totals.unpaid).toBe(parsePesos("3000"));
    expect(totals.total).toBe(parsePesos("5000"));
    // Part paid is still not settled.
    expect(totals.paidCount).toBe(0);
    expect(totals.unpaidCount).toBe(1);
  });

  it("carries only the remaining amount of a part-paid month forward", () => {
    const water = bill({ id: "water", amountCentavos: parsePesos("800"), startsMonth: SEPT });
    const partPaid = new Map([["water:2026-09", parsePesos("300")]]);
    const carried = carriedOverBills({
      bills: [water],
      paidKeys: new Set(),
      partPaid,
      period: OCT,
      today: OCT_2,
    });
    expect(carried[0].remainingCentavos).toBe(parsePesos("500"));
    expect(
      monthTotals({ bills: [water], paidKeys: new Set(), partPaid, period: OCT, today: OCT_2 })
        .carriedOver,
    ).toBe(parsePesos("500"));
  });
});
