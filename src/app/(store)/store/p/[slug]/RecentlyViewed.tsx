"use client";

import { useEffect, useState } from "react";

import { pushRecent } from "@/lib/store/catalogue";
import type { StoreCard } from "@/lib/store/card";

import { ProductCard } from "../../ProductCard";

const KEY = "dabz-store-recent";

function readIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The products this browser looked at lately, this one left out.
 *
 * Kept in the browser (localStorage) and nowhere else: it is a convenience,
 * not a record, and a signed-in profile will carry its own copy later. Storage
 * can be blocked or full, so every read and write is wrapped - the strip just
 * stays empty.
 */
export function RecentlyViewed({ currentId }: { currentId: string }) {
  const [cards, setCards] = useState<StoreCard[]>([]);

  useEffect(() => {
    const before = readIds();
    try {
      localStorage.setItem(KEY, JSON.stringify(pushRecent(before, currentId)));
    } catch {
      // Storage blocked: nothing to remember, nothing lost.
    }

    const others = before.filter((id) => id !== currentId).slice(0, 8);
    if (others.length === 0) return;

    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/store/products?ids=${others.join(",")}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { products?: StoreCard[] };
        setCards(body.products ?? []);
      } catch {
        // Offline or aborted: the strip stays empty.
      }
    })();

    return () => controller.abort();
  }, [currentId]);

  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="space-y-4">
      <h2 id="recent-heading" className="text-xl font-semibold tracking-tight">
        Recently viewed
      </h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5">
        {cards.slice(0, 4).map((card) => (
          <li key={card.id}>
            <ProductCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}
