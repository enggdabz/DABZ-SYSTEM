/**
 * The daily target (spec 12.3).
 *
 * The number the owner asked for: how much the shop must clear in a day to
 * cover its fixed costs.
 *
 *     daily target = (monthly bills + monthly payroll) / working days
 *
 * It is deliberately labelled as PROFIT NEEDED PER DAY, AFTER MATERIAL COSTS.
 * Treating it as a sales figure would be comforting and wrong: PHP 5,000 of
 * tarpaulin sales that used PHP 2,000 of material has not covered PHP 5,000 of
 * bills.
 */
import type { Centavos } from "./money";

export interface DailyTarget {
  targetCentavos: Centavos;
  monthlyBillsCentavos: Centavos;
  monthlyPayrollCentavos: Centavos;
  workingDaysPerMonth: number;
  /**
   * True while staff daily rates do not exist yet (they arrive in Phase 3), so
   * the target covers bills only and is therefore too low.
   */
  payrollIsMissing: boolean;
}

export function computeDailyTarget(options: {
  monthlyBillsCentavos: Centavos;
  monthlyPayrollCentavos: Centavos | null;
  workingDaysPerMonth: number;
}): DailyTarget {
  const { monthlyBillsCentavos, workingDaysPerMonth } = options;
  const payroll = options.monthlyPayrollCentavos ?? 0;

  if (workingDaysPerMonth < 1) {
    throw new Error("Working days per month must be at least 1");
  }

  const monthlyNeed = monthlyBillsCentavos + payroll;

  // Rounded UP, so the daily targets across a month add up to at least what is
  // actually owed. Rounding down would leave a small shortfall every month.
  const targetCentavos = Math.ceil(monthlyNeed / workingDaysPerMonth);

  return {
    targetCentavos,
    monthlyBillsCentavos,
    monthlyPayrollCentavos: payroll,
    workingDaysPerMonth,
    payrollIsMissing: options.monthlyPayrollCentavos === null,
  };
}

export interface TargetProgress {
  achievedCentavos: Centavos;
  targetCentavos: Centavos;
  /** 0-100, capped so the bar cannot overflow. */
  percent: number;
  reached: boolean;
  shortfallCentavos: Centavos;
}

export function targetProgress(options: {
  achievedCentavos: Centavos;
  targetCentavos: Centavos;
}): TargetProgress {
  const { achievedCentavos, targetCentavos } = options;

  if (targetCentavos <= 0) {
    return {
      achievedCentavos,
      targetCentavos,
      percent: 100,
      reached: true,
      shortfallCentavos: 0,
    };
  }

  const percent = Math.min(
    100,
    Math.max(0, Math.round((achievedCentavos / targetCentavos) * 100)),
  );

  return {
    achievedCentavos,
    targetCentavos,
    percent,
    reached: achievedCentavos >= targetCentavos,
    shortfallCentavos: Math.max(0, targetCentavos - achievedCentavos),
  };
}
