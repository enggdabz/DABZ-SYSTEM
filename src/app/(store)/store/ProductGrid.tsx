import Link from "next/link";

import {
  STORE_SORTS,
  STORE_SORT_LABELS,
  type StoreSort,
} from "@/lib/store/catalogue";
import type { StoreCard } from "@/lib/store/card";

import { ProductCard } from "./ProductCard";

/**
 * A heading, the sort, and the grid - shared by the home page, a category and
 * a search, so the three cannot drift apart.
 *
 * The sort is a row of LINKS, not a select: it works before any script has
 * loaded, the address carries the choice so it can be shared, and every option
 * is visible at once on a phone instead of hidden in a menu.
 */
export function ProductGrid({
  heading,
  cards,
  sort,
  basePath,
  query,
  emptyText,
}: {
  heading: string;
  cards: StoreCard[];
  sort: StoreSort;
  /** The page this grid sits on, for the sort links. */
  basePath: string;
  /** Kept in the sort links so sorting a search does not forget the search. */
  query?: string;
  emptyText: string;
}) {
  const href = (option: StoreSort) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (option !== "newest") params.set("sort", option);
    const text = params.toString();
    return text ? `${basePath}?${text}` : basePath;
  };

  return (
    <section aria-labelledby="products-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="products-heading" className="text-2xl font-semibold tracking-tight">
            {heading}
          </h2>
          <p className="text-sm text-muted">
            {cards.length} {cards.length === 1 ? "product" : "products"}
          </p>
        </div>

        {cards.length > 1 ? (
          <nav aria-label="Sort products" className="flex flex-wrap gap-1.5">
            {STORE_SORTS.map((option) => (
              <Link
                key={option}
                href={href(option)}
                aria-current={option === sort ? "true" : undefined}
                className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-sm ring-1 transition-colors ${
                  option === sort
                    ? "bg-ink text-page ring-ink"
                    : "bg-page text-ink ring-line hover:bg-seg"
                }`}
              >
                {STORE_SORT_LABELS[option]}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <p className="rounded-card bg-tile p-8 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
          {cards.map((card, index) => (
            <li key={card.id}>
              <ProductCard card={card} priority={index < 4} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
