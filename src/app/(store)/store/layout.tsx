import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getStoreCategories } from "@/lib/data/store";

import { StoreHeader } from "./StoreHeader";
import "./store.css";

/*
  Not indexed yet. Nothing links here, and search engines should not find a
  store that is still being built. Remove `robots` on the day the homepage is
  switched to the store (docs/store/progress.md - "Before you switch the
  homepage").
*/
export const metadata: Metadata = {
  title: {
    default: "Dabz Apparel",
    template: "%s · Dabz Apparel",
  },
  description: "Custom jerseys, shirts, jackets and prints from Dabz Apparel.",
  robots: { index: false, follow: false },
};

/**
 * The frame around the store. Its own, and not the app's: a customer has no
 * sections to navigate and nothing to sign out of.
 */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const categories = await getStoreCategories();

  return (
    <div className="store flex flex-1 flex-col">
      <StoreHeader categories={categories} />

      <main className="flex-1">{children}</main>

      <footer data-app-chrome className="border-t border-line py-8 text-sm text-muted">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="font-medium text-ink">Dabz Apparel</p>
          <p>
            Part of Dabz Printshoppe &middot; San Carlos City, Pangasinan &middot; since 18 June
            2017
          </p>
        </div>
      </footer>
    </div>
  );
}
