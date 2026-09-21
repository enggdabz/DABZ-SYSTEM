/**
 * End-of-day closing (spec 15.2).
 *
 *   cash sales - cash paid out = what should be in the drawer
 *
 * Then the staff count it, and the difference is shown. A difference is not an
 * accusation - it is usually change given wrong - but it has to be visible on
 * the day, because a week later nobody can remember.
 */
import { sumCentavos, type Centavos } from "./money";

export interface ClosingInput {
  /**
   * Everything collected in cash today, excluding voided rows.
   *
   * "Cash sales" was the old name and it was too narrow: since the counter
   * could always take an apparel down payment, and Phase 10 made that obvious,
   * this figure has always included apparel and DabzTech cash too.
   */
  cashSalesCentavos: Centavos;
  /** Money that left the cash drawer today: expenses, cash advances, wages. */
  cashPaidOutCentavos: Centavos;
  countedCashCentavos: Centavos;
  gcashCentavos: Centavos;
  mayaCentavos: Centavos;
  bankCentavos: Centavos;
  /**
   * Takings that went straight to the owner rather than into the drawer.
   *
   * It is money the shop collected, so it belongs in the day's total - but it
   * is NOT drawer cash, so it stays out of the drawer sum below. Leaving it
   * out of both, which is what happened before Phase 10, quietly lost it: the
   * day looked short against its target by exactly that amount.
   */
  ownersPocketCentavos: Centavos;
  targetCentavos: Centavos;
}

export interface ClosingResult {
  expectedCashCentavos: Centavos;
  countedCashCentavos: Centavos;
  /** Counted less expected. Negative means the drawer is short. */
  differenceCentavos: Centavos;
  balanced: boolean;
  short: boolean;
  over: boolean;
  totalSalesCentavos: Centavos;
  targetCentavos: Centavos;
  /**
   * False while the target is zero, which means "not known yet" rather than
   * "met" - see the note in `src/lib/target.ts`. A day closed before any bills
   * were entered must not go into the record as a day the target was hit.
   */
  targetReached: boolean;
}

export function computeClosing(input: ClosingInput): ClosingResult {
  /*
    THE DRAWER FORMULA, unchanged: cash collected less cash paid out. The
    owner's pocket is deliberately absent from it - counting money that never
    reached the drawer would make an honest drawer read as short.
  */
  const expectedCashCentavos =
    input.cashSalesCentavos - input.cashPaidOutCentavos;

  const differenceCentavos = input.countedCashCentavos - expectedCashCentavos;

  const totalSalesCentavos = sumCentavos([
    input.cashSalesCentavos,
    input.gcashCentavos,
    input.mayaCentavos,
    input.bankCentavos,
    input.ownersPocketCentavos,
  ]);

  return {
    expectedCashCentavos,
    countedCashCentavos: input.countedCashCentavos,
    differenceCentavos,
    balanced: differenceCentavos === 0,
    short: differenceCentavos < 0,
    over: differenceCentavos > 0,
    totalSalesCentavos,
    targetCentavos: input.targetCentavos,
    targetReached:
      input.targetCentavos > 0 && totalSalesCentavos >= input.targetCentavos,
  };
}
