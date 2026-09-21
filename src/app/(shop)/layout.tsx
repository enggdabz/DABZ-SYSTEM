import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { TAP_AREA } from "@/components/ui";

import { ShopHeader } from "./ShopHeader";

/**
 * The frame around the online shop.
 *
 * Its own, and not the app's: a customer has no sections to navigate, no
 * account and nothing to sign out of. What they get is the shop's name, the
 * way to the designs, and their own order.
 *
 * It is also not the Phase 9 public page's frame. That one is the whole shop -
 * three divisions, their price lists and an enquiry form - and this one is
 * Dabz Apparel's counter. The link back to it is in the footer.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ShopHeader />

      <main className="flex-1">{children}</main>

      <footer
        data-app-chrome
        className="border-t border-line/60 px-4 py-8 text-sm text-muted sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <p>
            Dabz Apparel &middot; part of Dabz Printshoppe
            <span className="block text-xs">
              San Carlos City, Pangasinan &middot; since 18 June 2017
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/shop/track" className={`underline ${TAP_AREA}`}>
              Track my order
            </Link>
            <Link href="/" className={`underline ${TAP_AREA}`}>
              Everything else we do
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </>
  );
}
