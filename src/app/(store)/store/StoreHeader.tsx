import Link from "next/link";
import { Suspense } from "react";

import { Wordmark } from "@/components/ui";
import type { StoreCategory } from "@/lib/store/types";

import { CategoryTabs } from "./CategoryTabs";
import { SearchBox } from "./SearchBox";

/**
 * The store's top bar: black, like the rest of the system, with the crest and
 * the name on the left and the search across the middle - on its own row
 * below the name on a phone, where there is no room beside it.
 *
 * The cart, the sign-in and the shop profile join it as they are built; a
 * button that goes nowhere is worse than no button.
 */
export function StoreHeader({ categories }: { categories: StoreCategory[] }) {
  return (
    <header data-app-chrome className="sticky top-0 z-40">
      <div className="bg-sidebar text-sidebar-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
          <Link href="/store" aria-label="Dabz Apparel home" className="shrink-0">
            <Wordmark subtitle="APPAREL" />
          </Link>

          <div className="order-last w-full md:order-none md:max-w-xl md:flex-1">
            <SearchBox />
          </div>
        </div>
      </div>

      {/* The tabs read the address, which a static shell cannot know yet. */}
      <Suspense fallback={<div className="h-14 border-b border-line bg-page" />}>
        <CategoryTabs categories={categories} />
      </Suspense>
    </header>
  );
}
