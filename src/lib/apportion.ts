/**
 * Splits `total` across `weights` so the parts stay proportional and sum back
 * to exactly `total`.
 *
 * Rounding each share independently would leave the ledger a centavo or two
 * away from the sale it came from — over a day of trading those gaps are what
 * makes a cash count fail to reconcile. Here the fractional parts are floored
 * and the leftover centavos handed to the largest remainders, which keeps the
 * total exact for any split.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w * total) / sum);
  const parts = exact.map(Math.floor);
  let leftover = total - parts.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; leftover > 0 && i < byRemainder.length; i += 1, leftover -= 1) {
    parts[byRemainder[i].index] += 1;
  }
  return parts;
}
