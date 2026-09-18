import { describe, expect, it } from "vitest";

import {
  describeApprovalRule,
  describeExpenseStatus,
  expenseStatusFor,
  expenseTotals,
  payableStatus,
  payableTotals,
  type ExpenseRow,
  type Payable,
} from "./expenses";
import { formatPesos, parsePesos } from "./money";
import { DEFAULT_SETTINGS } from "./settings";

const LIMIT = DEFAULT_SETTINGS.staffExpenseApprovalLimitCentavos;

describe("expenseStatusFor", () => {
  it("records a staff expense under the limit straight away", () => {
    expect(
      expenseStatusFor({
        isOwnerOrAdmin: false,
        amountCentavos: parsePesos("500"),
        staffExpenseApprovalLimitCentavos: LIMIT,
      }),
    ).toBe("approved");
  });

  it("lets an expense exactly at the limit through", () => {
    // The limit is what staff may spend, not what they may not.
    expect(
      expenseStatusFor({
        isOwnerOrAdmin: false,
        amountCentavos: LIMIT,
        staffExpenseApprovalLimitCentavos: LIMIT,
      }),
    ).toBe("approved");
  });

  it("holds a staff expense one centavo above the limit", () => {
    expect(
      expenseStatusFor({
        isOwnerOrAdmin: false,
        amountCentavos: LIMIT + 1,
        staffExpenseApprovalLimitCentavos: LIMIT,
      }),
    ).toBe("pending");
  });

  it("never holds the owner up with the owner's own limit", () => {
    expect(
      expenseStatusFor({
        isOwnerOrAdmin: true,
        amountCentavos: parsePesos("50000"),
        staffExpenseApprovalLimitCentavos: LIMIT,
      }),
    ).toBe("approved");
  });

  it("holds everything when the limit is zero", () => {
    expect(
      expenseStatusFor({
        isOwnerOrAdmin: false,
        amountCentavos: 1,
        staffExpenseApprovalLimitCentavos: 0,
      }),
    ).toBe("pending");
  });
});

describe("describeApprovalRule", () => {
  it("tells staff the rule before they press the button", () => {
    const line = describeApprovalRule({
      isOwnerOrAdmin: false,
      staffExpenseApprovalLimitCentavos: parsePesos("2000"),
      formatAmount: formatPesos,
    });
    expect(line).toContain("₱2,000.00");
  });

  it("says nothing to the owner, who is not limited", () => {
    expect(
      describeApprovalRule({
        isOwnerOrAdmin: true,
        staffExpenseApprovalLimitCentavos: LIMIT,
        formatAmount: formatPesos,
      }),
    ).toBeNull();
  });
});

describe("describeExpenseStatus", () => {
  it("marks a waiting entry as not yet counted", () => {
    const pending = describeExpenseStatus("pending");
    expect(pending.waiting).toBe(true);
    expect(pending.warn).toBe(true);
  });

  it("is quiet about a recorded one", () => {
    expect(describeExpenseStatus("approved").warn).toBe(false);
  });
});

function expense(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: "e1",
    occurredAt: "2026-09-18T02:00:00Z",
    spentOn: "2026-09-18",
    amountCentavos: parsePesos("480"),
    category: "materials_supplies",
    tag: "printshoppe",
    source: "cash_drawer",
    supplierId: null,
    note: null,
    status: "approved",
    createdBy: null,
    createdByName: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    ledgerEntryId: "g1",
    ...overrides,
  };
}

describe("expenseTotals", () => {
  it("counts only what was actually spent", () => {
    const totals = expenseTotals([
      expense({ amountCentavos: parsePesos("480") }),
      expense({ id: "e2", amountCentavos: parsePesos("120") }),
      expense({ id: "e3", amountCentavos: parsePesos("5000"), status: "pending" }),
      expense({ id: "e4", amountCentavos: parsePesos("900"), status: "rejected" }),
    ]);

    expect(totals.spentCentavos).toBe(parsePesos("600"));
    expect(totals.pendingCentavos).toBe(parsePesos("5000"));
    expect(totals.pendingCount).toBe(1);
  });

  it("never counts a rejected expense anywhere", () => {
    const totals = expenseTotals([
      expense({ status: "rejected", amountCentavos: parsePesos("900") }),
    ]);
    expect(totals.spentCentavos).toBe(0);
    expect(totals.pendingCentavos).toBe(0);
  });

  it("is zero for an empty list", () => {
    expect(expenseTotals([])).toEqual({
      spentCentavos: 0,
      pendingCentavos: 0,
      pendingCount: 0,
    });
  });
});

function payable(overrides: Partial<Payable> = {}): Payable {
  return {
    id: "p1",
    supplierId: null,
    supplierName: "Negros Paper Supply",
    description: "20 reams bond paper",
    amountCentavos: parsePesos("4800"),
    receivedOn: "2026-09-10",
    dueOn: "2026-09-25",
    status: "unpaid",
    paidOn: null,
    note: null,
    ...overrides,
  };
}

describe("payableStatus", () => {
  const today = "2026-09-18";

  it("counts down to the due date", () => {
    expect(payableStatus(payable({ dueOn: "2026-09-25" }), today).kind).toBe("unpaid");
    expect(payableStatus(payable({ dueOn: "2026-09-23" }), today).kind).toBe("due_soon");
    expect(payableStatus(payable({ dueOn: "2026-09-18" }), today).kind).toBe("due_today");
  });

  it("counts the days it is late", () => {
    const status = payableStatus(payable({ dueOn: "2026-09-15" }), today);
    expect(status.kind).toBe("overdue");
    expect(status.label).toBe("Overdue 3 days");
    expect(status.warn).toBe(true);
  });

  it("says one day, not 1 days", () => {
    expect(payableStatus(payable({ dueOn: "2026-09-17" }), today).label).toBe(
      "Overdue 1 day",
    );
  });

  it("warns that no due date is set rather than assuming one", () => {
    const status = payableStatus(payable({ dueOn: null }), today);
    expect(status.kind).toBe("no_due_date");
    expect(status.warn).toBe(true);
  });

  it("stops warning once it is paid, even if it was late", () => {
    const status = payableStatus(
      payable({ dueOn: "2026-01-01", status: "paid" }),
      today,
    );
    expect(status.kind).toBe("paid");
    expect(status.warn).toBe(false);
  });

  it("counts across a month end correctly", () => {
    // 1 Oct is 13 days after 18 Sep, which is not "due soon" yet.
    expect(payableStatus(payable({ dueOn: "2026-10-01" }), today).kind).toBe("unpaid");
    // 1 Sep is 17 days before.
    expect(payableStatus(payable({ dueOn: "2026-09-01" }), today).label).toBe(
      "Overdue 17 days",
    );
  });
});

describe("payableTotals", () => {
  const today = "2026-09-18";

  it("adds up only what is still owed", () => {
    const totals = payableTotals(
      [
        payable({ amountCentavos: parsePesos("4800") }),
        payable({ id: "p2", amountCentavos: parsePesos("1200"), dueOn: "2026-09-15" }),
        payable({
          id: "p3",
          amountCentavos: parsePesos("9000"),
          status: "paid",
          paidOn: "2026-09-16",
        }),
      ],
      today,
    );

    expect(totals.unpaidCentavos).toBe(parsePesos("6000"));
    expect(totals.unpaidCount).toBe(2);
    // Only the overdue one needs attention; the other is not due for a week.
    expect(totals.needingAttentionCount).toBe(1);
  });

  it("counts a missing due date as needing attention", () => {
    const totals = payableTotals([payable({ dueOn: null })], today);
    expect(totals.needingAttentionCount).toBe(1);
  });

  it("is zero when nothing is owed", () => {
    expect(payableTotals([], today)).toEqual({
      unpaidCentavos: 0,
      unpaidCount: 0,
      needingAttentionCount: 0,
    });
  });
});
