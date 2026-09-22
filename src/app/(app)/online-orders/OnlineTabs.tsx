"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TAP_AREA } from "@/components/ui";

/**
 * The online shop's own tab bar (docs/spec.md 9).
 *
 * The rail carries two links into this module; the rest of it lives here, so
 * the six screens are one tap from each other without adding six more lines to
 * a rail the counter scrolls past all day.
 *
 * It scrolls sideways on a phone rather than wrapping, because a wrapped bar
 * changes height as you move through it and pushes the page around.
 */
export interface OnlineTab {
  href: string;
  label: string;
}

export function OnlineTabs({ tabs }: { tabs: OnlineTab[] }) {
  const pathname = usePathname();

  // The longest matching href wins, so /online-orders/products does not also
  // light up /online-orders.
  const here = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="Online shop"
      className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-2">
        {tabs.map((tab) => {
          const current = tab.href === here;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  current
                    ? "bg-ink text-surface"
                    : "bg-ink/5 text-muted ring-1 ring-line hover:text-ink"
                } ${TAP_AREA}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
