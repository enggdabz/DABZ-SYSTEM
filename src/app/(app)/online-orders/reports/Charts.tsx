"use client";

import { useState } from "react";

import { TAP_AREA } from "@/components/ui";
import { formatPesos } from "@/lib/money";

/**
 * The charts (docs/spec.md 5.4).
 *
 * Hand-built from divs, because a chart library for three charts is a
 * dependency to keep up to date for the sake of some rectangles.
 *
 * Four rules the shapes here exist to keep:
 *
 *   TWO SERIES AT MOST, and they are ink and gold - never two shades of the
 *   same thing, and never a third.
 *   EVERY CHART HAS A TABLE. "Show table" swaps the plot for the exact
 *   numbers, which is both the accessible answer and the one the owner
 *   actually wants when a bar looks wrong.
 *   THE TOOLTIP IS TEXT. Set as a text node and as the element's own title,
 *   never as markup - a product name is customer input.
 *   IT APPEARS ON FOCUS AS WELL AS HOVER, so a keyboard reaches every value.
 */

export interface Series {
  label: string;
  /** "ink" is series one and every single-series chart; "gold" is series two. */
  tone: "ink" | "gold";
  values: number[];
}

const BAR_TONE = { ink: "bg-ink", gold: "bg-gold" } as const;

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10]
    .map((multiple) => multiple * magnitude)
    .find((candidate) => candidate >= rough) ?? magnitude * 10;

  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  return ticks;
}

function ShowTable({
  showing,
  onToggle,
}: {
  showing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-sm text-accent underline ${TAP_AREA}`}
    >
      {showing ? "Show chart" : "Show table"}
    </button>
  );
}

export function ColumnChart({
  labels,
  series,
  format,
  caption,
}: {
  labels: string[];
  series: Series[];
  format: (value: number) => string;
  caption?: string;
}) {
  const [table, setTable] = useState(false);

  const max = Math.max(1, ...series.flatMap((one) => one.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || max;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-sm">
            {series.map((one) => (
              <li key={one.label} className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block size-3 rounded-sm ${BAR_TONE[one.tone]}`}
                />
                {/* The text is never coloured with the series colour. */}
                <span>{one.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <ShowTable showing={table} onToggle={() => setTable(!table)} />
      </div>

      {table ? (
        <Table labels={labels} series={series} format={format} />
      ) : (
        <div className="flex gap-3">
          <ul className="flex w-16 shrink-0 flex-col-reverse justify-between py-1 text-right text-xs text-muted">
            {ticks.map((tick) => (
              <li key={tick}>{format(tick)}</li>
            ))}
          </ul>

          <div className="relative min-w-0 flex-1">
            <div aria-hidden="true" className="absolute inset-0 flex flex-col-reverse justify-between">
              {ticks.map((tick) => (
                <div key={tick} className="border-t border-seg" />
              ))}
            </div>

            <div className="relative flex h-48 items-end gap-1 border-b border-line">
              {labels.map((label, index) => (
                <div
                  key={label}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
                >
                  {series.map((one) => {
                    const value = one.values[index] ?? 0;
                    return (
                      <button
                        key={one.label}
                        type="button"
                        title={`${label} — ${one.label}: ${format(value)}`}
                        aria-label={`${label}, ${one.label}, ${format(value)}`}
                        style={{ height: `${Math.max(0, (value / top) * 100)}%` }}
                        className={`w-full max-w-6 rounded-t focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${BAR_TONE[one.tone]}`}
                      />
                    );
                  })}

                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs text-surface group-hover:block group-focus-within:block"
                  >
                    {label}
                    {series.map((one) => (
                      <span key={one.label} className="block">
                        {one.label}: {format(one.values[index] ?? 0)}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>

            <ul className="mt-1 flex gap-1 text-center text-[10px] text-muted">
              {labels.map((label) => (
                <li key={label} className="min-w-0 flex-1 truncate">
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {caption ? <p className="text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

function Table({
  labels,
  series,
  format,
}: {
  labels: string[];
  series: Series[];
  format: (value: number) => string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-1 pr-3 font-medium">Period</th>
            {series.map((one) => (
              <th key={one.label} className="py-1 pr-3 text-right font-medium">
                {one.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={label} className="border-t border-line/60">
              <td className="py-1 pr-3">{label}</td>
              {series.map((one) => (
                <td key={one.label} className="py-1 pr-3 text-right">
                  {format(one.values[index] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BarChart({
  rows,
}: {
  rows: { label: string; value: number; note?: string }[];
}) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nothing sold in this period yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ShowTable showing={table} onToggle={() => setTable(!table)} />
      </div>

      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1 pr-3 font-medium">Product</th>
              <th className="py-1 text-right font-medium">Sales</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line/60">
                <td className="py-1 pr-3">{row.label}</td>
                <td className="py-1 text-right">{formatPesos(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label} className="group space-y-1">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="font-medium">
                  {formatPesos(row.value)}
                  {row.note ? (
                    <span className="ml-2 font-normal text-muted">{row.note}</span>
                  ) : null}
                </span>
              </div>
              <div
                className="h-2.5 rounded-r-full bg-seg"
                title={`${row.label}: ${formatPesos(row.value)}`}
              >
                <div
                  className="h-full rounded-r-full bg-ink"
                  style={{ width: `${Math.max(1, (row.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
