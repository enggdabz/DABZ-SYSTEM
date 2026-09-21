"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TAP_AREA } from "@/components/ui";
import {
  filterProducts,
  orderedLabel,
  priceLabel,
  SHOP_SORTS,
  SHOP_SORT_LABELS,
  sortForShop,
  termsLabel,
  type ShopSort,
} from "@/lib/online/catalogue";
import type { Category, Product } from "@/lib/online/types";

/**
 * Search, the category chips and the sort, over the product grid
 * (docs/spec.md 8.1).
 *
 * All three run in the browser on a list the server already sent. A shop of
 * this size is a few dozen products, and a round trip per keystroke on a
 * phone on mobile data is the thing that makes a catalogue feel broken.
 *
 * Two columns on a phone, because that is the width most customers arrive at
 * from Facebook, and the card puts its text ABOVE the picture so a row of
 * cards lines up whatever the pictures do.
 */
export function CatalogueBrowser({
  products,
  categories,
  imageUrls,
}: {
  products: Product[];
  categories: Category[];
  /** Built on the server: the browser has no Supabase URL to work from. */
  imageUrls: Record<string, string | null>;
}) {
  const [search, setSearch] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [sort, setSort] = useState<ShopSort>("most_ordered");

  // Only the categories that have something in them: a chip that leads to an
  // empty grid is a chip that reads as a broken shop.
  const usedCategories = useMemo(() => {
    const slugs = new Set(products.map((product) => product.categorySlug));
    return categories.filter((category) => slugs.has(category.slug));
  }, [products, categories]);

  const shown = useMemo(
    () => sortForShop(filterProducts(products, { search, categorySlug }), sort),
    [products, search, categorySlug, sort],
  );

  return (
    <section id="products" className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Products</h2>

      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-48 flex-1">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="w-full rounded-full bg-seg px-4 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ShopSort)}
            className="rounded-full bg-seg px-3 py-2 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
          >
            {SHOP_SORTS.map((option) => (
              <option key={option} value={option}>
                {SHOP_SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          selected={categorySlug === null}
          onClick={() => setCategorySlug(null)}
          label="All"
        />
        {usedCategories.map((category) => (
          <Chip
            key={category.id}
            selected={categorySlug === category.slug}
            onClick={() => setCategorySlug(category.slug)}
            label={category.name}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted ring-1 ring-line/60">
          No products match. Try another word or category.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {shown.map((product) => (
            <li key={product.id}>
              <Link
                href={`/shop/products/${product.slug}`}
                className="group flex h-full flex-col gap-3 rounded-card bg-surface p-4 ring-1 ring-line/60 transition-transform hover:-translate-y-0.5"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">
                    {product.categoryName ?? "Dabz Apparel"}
                  </p>
                  <h3 className="font-semibold tracking-tight">{product.name}</h3>
                  <p className="text-sm">{priceLabel(product)}</p>
                  <p className="text-xs text-muted">{termsLabel(product)}</p>
                  {product.orderedPieces > 0 ? (
                    <p className="text-xs text-muted">{orderedLabel(product)}</p>
                  ) : null}
                </div>

                <div className="mt-auto aspect-square overflow-hidden rounded-control bg-tile">
                  {imageUrls[product.id] ? (
                    <Image
                      src={imageUrls[product.id] as string}
                      alt=""
                      width={400}
                      height={400}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? "bg-ink text-surface"
          : "bg-ink/5 text-muted ring-1 ring-line hover:text-ink"
      } ${TAP_AREA}`}
    >
      {label}
    </button>
  );
}
