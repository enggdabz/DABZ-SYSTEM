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
  /** Sales taken in cash today, excluding voided ones. */
  cashSalesCentavos: Centavos;
  /** Money that left the cash drawer today: expenses, cash advances, wages. */
  cashPaidOutCentavos: Centavos;
  countedCashCentavos: Centavos;
  gcashCentavos: Centavos;
  mayaCentavos: Centavos;
  bankCentavos: Centavos;
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
  const expectedCashCentavos =
    input.cashSalesCentavos - input.cashPaidOutCentavos;

  const differenceCentavos = input.countedCashCentavos - expectedCashCentavos;

  const totalSalesCentavos = sumCentavos([
    input.cashSalesCentavos,
    input.gcashCentavos,
    input.mayaCentavos,
    input.bankCentavos,
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
