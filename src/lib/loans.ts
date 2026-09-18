/**
 * Loans and debt (spec 12.2).
 *
 * The shop owes somewhere near two million pesos, and the owner's stated goal
 * is to get out of debt as fast as possible. The most important thing this file
 * does is answer one question honestly: is this loan actually shrinking?
 *
 * A loan whose monthly payment is smaller than its monthly interest grows no
 * matter how faithfully it is paid. That is worth a warning on the screen, not
 * a number buried in a table.
 */
import { sumCentavos, type Centavos } from "./money";
import {
  compareCivilDates,
  parseISODate,
  type CivilDate,
} from "./period";

export interface LoanPayment {
  amountCentavos: Centavos;
  /** The day the money left, as a plain calendar date. */
  paidOn: CivilDate;
}

export interface Loan {
  id: string;
  lender: string;
  /** The balance printed on the statement. */
  statementBalanceCentavos: Centavos;
  /** The date that statement balance was true. */
  statementDate: CivilDate;
  /** Null when the loan has no fixed monthly payment (spec 12.2). */
  monthlyPaymentCentavos: Centavos | null;
  /** Percent per month. Null until the owner reads it off a statement. */
  interestPercentPerMonth: number | null;
  note: string | null;
  active: boolean;
}

/**
 * What is still owed.
 *
 * The statement balance is the truth as of its date, so only payments made
 * AFTER that date are subtracted - otherwise a payment the statement already
 * accounts for would be counted twice.
 *
 * Interest is deliberately not added in here. Adding an estimate to a real
 * statement figure would produce a number that is neither, and the owner needs
 * to be able to tie this to a piece of paper from the bank.
 */
export function remainingBalance(
  loan: Pick<Loan, "statementBalanceCentavos" | "statementDate">,
  payments: readonly LoanPayment[],
): Centavos {
  const paidSince = payments.filter(
    (payment) => compareCivilDates(payment.paidOn, loan.statementDate) > 0,
  );

  const remaining =
    loan.statementBalanceCentavos -
    sumCentavos(paidSince.map((payment) => payment.amountCentavos));

  // A loan cannot be owed backwards; an overpayment simply clears it.
  return Math.max(0, remaining);
}

/** Roughly what this month's interest adds, when the rate is known. */
export function estimatedMonthlyInterest(
  balance: Centavos,
  interestPercentPerMonth: number | null,
): Centavos | null {
  if (interestPercentPerMonth === null) return null;
  if (balance <= 0) return 0;
  return Math.round((balance * interestPercentPerMonth) / 100);
}

/**
 * The warning from spec 12.2: the payment is not even covering the interest,
 * so the balance grows every month.
 *
 * "Equal to" counts as growing, because a payment that exactly matches the
 * interest never reduces the debt by a single centavo.
 */
export function isBalanceGrowing(options: {
  monthlyPaymentCentavos: Centavos | null;
  monthlyInterestCentavos: Centavos | null;
}): boolean {
  const { monthlyPaymentCentavos, monthlyInterestCentavos } = options;
  if (monthlyInterestCentavos === null || monthlyInterestCentavos <= 0) return false;
  // No fixed payment at all means nothing is chipping away at it.
  if (monthlyPaymentCentavos === null || monthlyPaymentCentavos <= 0) return true;
  return monthlyPaymentCentavos <= monthlyInterestCentavos;
}

export interface PayoffProjection {
  /** Whole months, or null when it cannot be worked out. */
  months: number | null;
  /** True when the payment will never clear the balance. */
  neverPaysOff: boolean;
  /** Total interest still to be paid, when the rate is known. */
  totalInterestCentavos: Centavos | null;
  /** True when no interest rate is known, so this is payment-only division. */
  ignoresInterest: boolean;
}

/** Stop projecting beyond this; a century is "never" in practice. */
const MAX_PROJECTION_MONTHS = 1200;

/**
 * How long this loan takes to clear at the current monthly payment.
 *
 * Worked out by stepping through the months in whole centavos rather than with
 * an amortisation formula. It is slower, but it is exact, it handles the
 * "never pays off" case without a special rule, and anyone reading it can see
 * what it claims: add the interest, take off the payment, repeat.
 */
export function projectPayoff(options: {
  balanceCentavos: Centavos;
  monthlyPaymentCentavos: Centavos | null;
  interestPercentPerMonth: number | null;
}): PayoffProjection {
  const { balanceCentavos, monthlyPaymentCentavos, interestPercentPerMonth } = options;

  if (balanceCentavos <= 0) {
    return {
      months: 0,
      neverPaysOff: false,
      totalInterestCentavos: 0,
      ignoresInterest: interestPercentPerMonth === null,
    };
  }

  if (monthlyPaymentCentavos === null || monthlyPaymentCentavos <= 0) {
    return {
      months: null,
      neverPaysOff: true,
      totalInterestCentavos: null,
      ignoresInterest: interestPercentPerMonth === null,
    };
  }

  // No rate known: simple division, clearly flagged as ignoring interest.
  if (interestPercentPerMonth === null) {
    return {
      months: Math.ceil(balanceCentavos / monthlyPaymentCentavos),
      neverPaysOff: false,
      totalInterestCentavos: null,
      ignoresInterest: true,
    };
  }

  let balance = balanceCentavos;
  let months = 0;
  let interestPaid = 0;

  while (balance > 0 && months < MAX_PROJECTION_MONTHS) {
    const interest = Math.round((balance * interestPercentPerMonth) / 100);
    const afterInterest = balance + interest;

    // Not even covering the interest: this will never end.
    if (monthlyPaymentCentavos <= interest) {
      return {
        months: null,
        neverPaysOff: true,
        totalInterestCentavos: null,
        ignoresInterest: false,
      };
    }

    interestPaid += interest;
    balance = afterInterest - monthlyPaymentCentavos;
    months += 1;
  }

  if (balance > 0) {
    return {
      months: null,
      neverPaysOff: true,
      totalInterestCentavos: null,
      ignoresInterest: false,
    };
  }

  return {
    months,
    neverPaysOff: false,
    totalInterestCentavos: interestPaid,
    ignoresInterest: false,
  };
}

/** "1 year 8 months" - easier to feel than "20 months". */
export function describeMonths(months: number): string {
  if (months <= 0) return "paid off";
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = years === 1 ? "1 year" : `${years} years`;
  if (rest === 0) return yearPart;
  return `${yearPart} ${rest === 1 ? "1 month" : `${rest} months`}`;
}

export interface LoanSummary {
  loan: Loan;
  remainingCentavos: Centavos;
  monthlyInterestCentavos: Centavos | null;
  balanceGrowing: boolean;
  payoff: PayoffProjection;
}

export function summarizeLoan(
  loan: Loan,
  payments: readonly LoanPayment[],
): LoanSummary {
  const remainingCentavos = remainingBalance(loan, payments);
  const monthlyInterestCentavos = estimatedMonthlyInterest(
    remainingCentavos,
    loan.interestPercentPerMonth,
  );

  return {
    loan,
    remainingCentavos,
    monthlyInterestCentavos,
    balanceGrowing: isBalanceGrowing({
      monthlyPaymentCentavos: loan.monthlyPaymentCentavos,
      monthlyInterestCentavos,
    }),
    payoff: projectPayoff({
      balanceCentavos: remainingCentavos,
      monthlyPaymentCentavos: loan.monthlyPaymentCentavos,
      interestPercentPerMonth: loan.interestPercentPerMonth,
    }),
  };
}

/** Everything still owed, for the Overview (spec 15.1). */
export function totalRemainingDebt(summaries: readonly LoanSummary[]): Centavos {
  return sumCentavos(
    summaries
      .filter((summary) => summary.loan.active)
      .map((summary) => summary.remainingCentavos),
  );
}

/** Reads a stored date column into a plain calendar date. */
export function loanDateFromISO(value: string): CivilDate {
  const parsed = parseISODate(value);
  if (!parsed) throw new Error(`Not a valid date: ${value}`);
  return parsed;
}
