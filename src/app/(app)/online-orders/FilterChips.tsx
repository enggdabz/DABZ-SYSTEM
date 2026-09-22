"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { TAP_AREA } from "@/components/ui";
import { ORDER_FILTERS, ORDER_FILTER_LABELS, type OrderFilter } from "@/lib/online/list";

/**
 * The filter chips.
 *
 * Links rather than buttons, because the filter belongs in the URL: it
 * survives a reload, a back button and a link sent to whoever is at the
 * counter. The page does the filtering on the list it already has.
 */
export function FilterChips({
  current,
  counts,
}: {
  current: OrderFilter;
  counts: Partial<Record<OrderFilter, number>>;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <nav aria-label="Filter orders" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {ORDER_FILTERS.map((filter) => {
          const next = new URLSearchParams(params.toString());
          next.set("show", filter);
          const selected = filter === current;
          const count = counts[filter];

          return (
            <li key={filter}>
              <Link
                href={`${pathname}?${next.toString()}`}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-ink text-surface"
                    : "bg-ink/5 text-muted ring-1 ring-line hover:text-ink"
                } ${TAP_AREA}`}
              >
                {ORDER_FILTER_LABELS[filter]}
                {count !== undefined && count > 0 ? (
                  <span className={selected ? "opacity-70" : ""}>{count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
