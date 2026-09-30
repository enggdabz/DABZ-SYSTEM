/** A size chart's rows are jsonb; keep only arrays of strings, whatever was stored. */
export function parseChartRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
}
