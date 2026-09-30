"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { StoreCategory } from "@/lib/store/types";

/**
 * The category tabs under the header. A row you can swipe on a phone, with the
 * current one filled in - and marked `aria-current` too, so it is not colour
 * alone.
 */
export function CategoryTabs({ categories }: { categories: StoreCategory[] }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/store", label: "All", current: pathname === "/store" },
    ...categories.map((category) => ({
      href: `/store/c/${category.slug}`,
      label: category.name,
      current: pathname === `/store/c/${category.slug}`,
    })),
  ];

  return (
    <nav aria-label="Categories" className="border-b border-line bg-page">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-colors ${
                tab.current ? "bg-ink text-page" : "text-ink hover:bg-seg"
              }`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
