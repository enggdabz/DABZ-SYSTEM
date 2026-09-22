"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { TAP_AREA } from "@/components/ui";
import { CHART_PERIODS, CHART_PERIOD_LABELS, type ChartPeriod } from "@/lib/online/reports";

/**
 * One control above the charts, and it scopes every one of them
 * (docs/spec.md 9.5). Three separate pickers would let two charts underneath
 * each other show two different stretches of time.
 */
export function PeriodPicker({ current }: { current: ChartPeriod }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="inline-flex rounded-full bg-seg p-1">
      {CHART_PERIODS.map((period) => {
        const next = new URLSearchParams(params.toString());
        next.set("period", period);
        const selected = period === current;

        return (
          <Link
            key={period}
            href={`${pathname}?${next.toString()}`}
            aria-current={selected ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              selected ? "bg-ink text-surface" : "text-muted hover:text-ink"
            } ${TAP_AREA}`}
          >
            {CHART_PERIOD_LABELS[period]}
          </Link>
        );
      })}
    </div>
  );
}
