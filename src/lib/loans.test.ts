import { describe, expect, it } from "vitest";

import { parsePesos } from "./money";
import {
  describeMonths,
  estimatedMonthlyInterest,
  isBalanceGrowing,
  projectPayoff,
  remainingBalance,
  summarizeLoan,
  totalRemainingDebt,
  type Loan,
  type LoanPayment,
} from "./loans";

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "bpi",
    lender: "BPI",
    statementBalanceCentavos: parsePesos("300000"),
    statementDate: { year: 2026, month: 9, day: 1 },
    monthlyPaymentCentavos: parsePesos("33250"),
    interestPercentPerMonth: null,
    note: null,
    active: true,
    ...overrides,
  };
}

function payment(amount: string, day: number, month = 9): LoanPayment {
  return {
    amountCentavos: parsePesos(amount),
    paidOn: { year: 2026, month, day },
  };
}

describe("remainingBalance", () => {
  it("is the statement balance when nothing has been paid since", () => {
    expect(remainingBalance(loan(), [])).toBe(parsePesos("300000"));
  });

  it("subtracts payments made after the statement date", () => {
    expect(remainingBalance(loan(), [payment("33250", 15)])).toBe(
      parsePesos("266750"),
    );
  });

  it("ignores payments the statement already accounts for", () => {
    // The statement says PHP 300,000 as of 1 September. A payment made on
    // 20 August is already reflected in that figure - counting it again would
    // understate the debt and make the payoff look closer than it is.
    const payments = [payment("33250", 20, 8), payment("33250", 15, 9)];
    expect(remainingBalance(loan(), payments)).toBe(parsePesos("266750"));
  });

  it("treats a payment on the statement date itself as already counted", () => {
    expect(remainingBalance(loan(), [payment("33250", 1)])).toBe(
      parsePesos("300000"),
    );
  });

  it("adds up several payments exactly", () => {
    const payments = [payment("33250", 5), payment("33250", 15), payment("10000", 25)];
    expect(remainingBalance(loan(), payments)).toBe(parsePesos("223500"));
  });

  it("never goes below zero when the loan is overpaid", () => {
    expect(remainingBalance(loan(), [payment("400000", 15)])).toBe(0);
  });
});

describe("estimatedMonthlyInterest", () => {
  it("returns nothing when the rate is unknown", () => {
    // Most of the owner's loans are in this state (open decision 17.13).
    expect(estimatedMonthlyInterest(parsePesos("500000"), null)).toBeNull();
  });

  it("works out the interest in whole centavos", () => {
    // 3.5% of PHP 500,000 is PHP 17,500.
    expect(estimatedMonthlyInterest(parsePesos("500000"), 3.5)).toBe(
      parsePesos("17500"),
    );
    // 2% of PHP 19,137 is PHP 382.74 exactly.
    expect(estimatedMonthlyInterest(parsePesos("19137"), 2)).toBe(parsePesos("382.74"));
  });

  it("rounds to the nearest centavo", () => {
    // 3.33% of PHP 17,127 is PHP 570.3291 -> PHP 570.33
    const result = estimatedMonthlyInterest(parsePesos("17127"), 3.33);
    expect(result).toBe(57033);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("is zero on a cleared loan", () => {
    expect(estimatedMonthlyInterest(0, 3.5)).toBe(0);
  });
});

describe("isBalanceGrowing", () => {
  it("warns when the payment is smaller than the interest", () => {
    expect(
      isBalanceGrowing({
        monthlyPaymentCentavos: parsePesos("12000"),
        monthlyInterestCentavos: parsePesos("17500"),
      }),
    ).toBe(true);
  });

  it("warns when the payment exactly matches the interest", () => {
    // Paying the interest and nothing more means the debt never shrinks, so
    // the specification counts "equal to" as growing.
    expect(
      isBalanceGrowing({
        monthlyPaymentCentavos: parsePesos("17500"),
        monthlyInterestCentavos: parsePesos("17500"),
      }),
    ).toBe(true);
  });

  it("does not warn when the payment beats the interest", () => {
    expect(
      isBalanceGrowing({
        monthlyPaymentCentavos: parsePesos("17500.01"),
        monthlyInterestCentavos: parsePesos("17500"),
      }),
    ).toBe(false);
  });

  it("warns when interest accrues and there is no fixed payment", () => {
    expect(
      isBalanceGrowing({
        monthlyPaymentCentavos: null,
        monthlyInterestCentavos: parsePesos("1000"),
      }),
    ).toBe(true);
  });

  it("stays quiet when the interest rate is simply unknown", () => {
    // An unknown rate is not evidence of a problem, so it must not raise a
    // warning the owner cannot act on.
    expect(
      isBalanceGrowing({
        monthlyPaymentCentavos: parsePesos("12000"),
        monthlyInterestCentavos: null,
      }),
    ).toBe(false);
    expect(
      isBalanceGrowing({ monthlyPaymentCentavos: null, monthlyInterestCentavos: null }),
    ).toBe(false);
  });
});

describe("projectPayoff", () => {
  it("divides balance by payment when no rate is known, and says so", () => {
    const result = projectPayoff({
      balanceCentavos: parsePesos("300000"),
      monthlyPaymentCentavos: parsePesos("33250"),
      interestPercentPerMonth: null,
    });
    // 300,000 / 33,250 = 9.02 -> 10 months
    expect(result).toMatchObject({
      months: 10,
      neverPaysOff: false,
      ignoresInterest: true,
      totalInterestCentavos: null,
    });
  });

  it("takes interest into account when the rate is known", () => {
    const withInterest = projectPayoff({
      balanceCentavos: parsePesos("300000"),
      monthlyPaymentCentavos: parsePesos("33250"),
      interestPercentPerMonth: 1.5,
    });

    expect(withInterest.ignoresInterest).toBe(false);
    expect(withInterest.totalInterestCentavos).toBeGreaterThan(0);
    expect(withInterest.neverPaysOff).toBe(false);
  });

  it("never reports a shorter payoff once interest is counted", () => {
    // The invariant is "no sooner", not "strictly later": both answers are
    // whole months, so on a loan cleared in nine-and-a-bit months the interest
    // disappears into the same rounded-up figure.
    for (const [balance, monthly, rate] of [
      ["300000", "33250", 1.5],
      ["450000", "20000", 1.5],
      ["19137", "5000", 2],
      ["1000", "300", 1],
    ] as const) {
      const without = projectPayoff({
        balanceCentavos: parsePesos(balance),
        monthlyPaymentCentavos: parsePesos(monthly),
        interestPercentPerMonth: null,
      });
      const withRate = projectPayoff({
        balanceCentavos: parsePesos(balance),
        monthlyPaymentCentavos: parsePesos(monthly),
        interestPercentPerMonth: rate,
      });

      expect(withRate.months, `${balance} at ${rate}%`).toBeGreaterThanOrEqual(
        without.months!,
      );
    }
  });

  it("shows interest lengthening a long loan", () => {
    // The owner's Lupa loan: PHP 450,000 at PHP 20,000 a month. Over two years
    // the interest is plainly visible in the payoff time.
    const without = projectPayoff({
      balanceCentavos: parsePesos("450000"),
      monthlyPaymentCentavos: parsePesos("20000"),
      interestPercentPerMonth: null,
    });
    const withRate = projectPayoff({
      balanceCentavos: parsePesos("450000"),
      monthlyPaymentCentavos: parsePesos("20000"),
      interestPercentPerMonth: 1.5,
    });

    expect(without.months).toBe(23);
    expect(withRate.months).toBeGreaterThan(23);
  });

  it("says a loan never pays off when the payment cannot cover the interest", () => {
    // The owner's Credit card 3: PHP 500,000 owed, PHP 12,000 a month. At 3%
    // the interest alone is PHP 15,000 a month.
    const result = projectPayoff({
      balanceCentavos: parsePesos("500000"),
      monthlyPaymentCentavos: parsePesos("12000"),
      interestPercentPerMonth: 3,
    });
    expect(result).toMatchObject({ months: null, neverPaysOff: true });
  });

  it("says never when there is no monthly payment at all", () => {
    expect(
      projectPayoff({
        balanceCentavos: parsePesos("50000"),
        monthlyPaymentCentavos: null,
        interestPercentPerMonth: null,
      }),
    ).toMatchObject({ months: null, neverPaysOff: true });
  });

  it("reports a cleared loan as already paid off", () => {
    expect(
      projectPayoff({
        balanceCentavos: 0,
        monthlyPaymentCentavos: parsePesos("1000"),
        interestPercentPerMonth: 3,
      }),
    ).toMatchObject({ months: 0, neverPaysOff: false, totalInterestCentavos: 0 });
  });

  it("agrees with adding it up by hand", () => {
    // PHP 1,000 owed at 1% a month, paying PHP 300:
    //   month 1: 1000 + 10.00 - 300 = 710.00
    //   month 2:  710 +  7.10 - 300 = 417.10
    //   month 3:  417.10 + 4.17 - 300 = 121.27
    //   month 4:  121.27 + 1.21 - 300 = paid off
    const result = projectPayoff({
      balanceCentavos: parsePesos("1000"),
      monthlyPaymentCentavos: parsePesos("300"),
      interestPercentPerMonth: 1,
    });
    expect(result.months).toBe(4);
    // Interest charged: 10.00 + 7.10 + 4.17 + 1.21 = 22.48
    expect(result.totalInterestCentavos).toBe(parsePesos("22.48"));
  });

  it("always returns whole months and whole centavos", () => {
    for (const rate of [0.5, 1, 2.5, 3.33]) {
      for (const balance of ["1000", "19137", "450000"]) {
        const result = projectPayoff({
          balanceCentavos: parsePesos(balance),
          monthlyPaymentCentavos: parsePesos("20000"),
          interestPercentPerMonth: rate,
        });
        if (result.months !== null) {
          expect(Number.isInteger(result.months)).toBe(true);
        }
        if (result.totalInterestCentavos !== null) {
          expect(Number.isInteger(result.totalInterestCentavos)).toBe(true);
        }
      }
    }
  });
});

describe("describeMonths", () => {
  it("reads the way a person would say it", () => {
    expect(describeMonths(0)).toBe("paid off");
    expect(describeMonths(1)).toBe("1 month");
    expect(describeMonths(11)).toBe("11 months");
    expect(describeMonths(12)).toBe("1 year");
    expect(describeMonths(13)).toBe("1 year 1 month");
    expect(describeMonths(20)).toBe("1 year 8 months");
    expect(describeMonths(24)).toBe("2 years");
    expect(describeMonths(37)).toBe("3 years 1 month");
  });
});

describe("the owner's real loans (spec 12.2)", () => {
  const loans: Loan[] = [
    loan({ id: "lupa", lender: "Lupa", statementBalanceCentavos: parsePesos("450000"), monthlyPaymentCentavos: parsePesos("20000") }),
    loan({ id: "bpi", lender: "BPI", statementBalanceCentavos: parsePesos("300000"), monthlyPaymentCentavos: parsePesos("33250") }),
    loan({ id: "cc3", lender: "Credit card 3", statementBalanceCentavos: parsePesos("500000"), monthlyPaymentCentavos: parsePesos("12000") }),
    loan({ id: "cenpelco", lender: "Cenpelco", statementBalanceCentavos: parsePesos("50000"), monthlyPaymentCentavos: null }),
    loan({ id: "cc2", lender: "Credit card 2", statementBalanceCentavos: parsePesos("19137"), monthlyPaymentCentavos: null }),
    loan({ id: "cc1", lender: "Credit card 1", statementBalanceCentavos: parsePesos("17127"), monthlyPaymentCentavos: null }),
  ];

  it("adds up to the owner's confirmed total", () => {
    // Spec 12.2 states PHP 1,336,264 confirmed. If this stops matching, either
    // the seed data or the owner's figures have changed.
    const summaries = loans.map((entry) => summarizeLoan(entry, []));
    expect(totalRemainingDebt(summaries)).toBe(parsePesos("1336264"));
  });

  it("leaves a closed loan out of the total", () => {
    const summaries = [
      ...loans.slice(1),
      loan({ id: "lupa", statementBalanceCentavos: parsePesos("450000"), active: false }),
    ].map((entry) => summarizeLoan(entry, []));

    expect(totalRemainingDebt(summaries)).toBe(parsePesos("886264"));
  });

  it("raises no interest warnings while the rates are unknown", () => {
    // All six rates are still unknown, so the system must not invent alarm.
    const summaries = loans.map((entry) => summarizeLoan(entry, []));
    expect(summaries.every((summary) => !summary.balanceGrowing)).toBe(true);
    expect(summaries.every((summary) => summary.monthlyInterestCentavos === null)).toBe(true);
  });

  it("flags Credit card 3 the moment a real rate is entered", () => {
    // PHP 500,000 at 3% is PHP 15,000 of interest against a PHP 12,000 payment.
    const summary = summarizeLoan(
      loan({
        id: "cc3",
        statementBalanceCentavos: parsePesos("500000"),
        monthlyPaymentCentavos: parsePesos("12000"),
        interestPercentPerMonth: 3,
      }),
      [],
    );

    expect(summary.monthlyInterestCentavos).toBe(parsePesos("15000"));
    expect(summary.balanceGrowing).toBe(true);
    expect(summary.payoff.neverPaysOff).toBe(true);
  });

  it("tracks a payment against the statement balance", () => {
    const summary = summarizeLoan(loan({ id: "bpi" }), [payment("33250", 15)]);
    expect(summary.remainingCentavos).toBe(parsePesos("266750"));
  });
});
