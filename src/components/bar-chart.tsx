import { formatCentavos } from "@/lib/money";

export type Bar = { label: string; value: number };

/**
 * Daily takings as a single series of bars.
 *
 * One measure, one axis. Only the highest and the latest bar are labelled —
 * a number on every bar is noise at this size — and the values are read from
 * the table beneath, which is the accessible view of the same data.
 */
export function BarChart({ bars, caption }: { bars: Bar[]; caption: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const peak = bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);
  const last = bars.length - 1;

  return (
    <figure className="m-0">
      <figcaption className="label-caps mb-4 text-fg-subtle">{caption}</figcaption>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={caption}>
        {bars.map((bar, index) => {
          const height = (bar.value / max) * 100;
          const labelled = index === peak || index === last;
          return (
            <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {labelled && bar.value > 0 ? (
                <span className="text-[0.625rem] tabular-nums text-fg-muted">
                  {formatCentavos(bar.value)}
                </span>
              ) : null}
              <div
                // A 4px rounded top on a bar anchored to the baseline.
                className="w-full rounded-t bg-brand"
                style={{ height: `${Math.max(height, bar.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {bars.map((bar) => (
          <span
            key={bar.label}
            className="min-w-0 flex-1 truncate text-center text-[0.625rem] text-fg-subtle"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
