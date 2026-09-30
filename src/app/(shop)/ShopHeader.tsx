"use client";

import Link from "next/link";

import { TAP_AREA } from "@/components/ui";
import { cartPieces } from "@/lib/online/cart";

import { useCart } from "./useCart";

/**
 * The shop's top bar (docs/spec.md 8.1).
 *
 * The order count is the only live thing on it, and it is deliberately blank
 * until the browser has read the cart: a number rendered on the server would
 * be a guess, and the guess would be wrong for everybody who has anything in
 * their order.
 *
 * "What we do" is here because the catalogue is the homepage now (22 September
 * 2026): the page about the whole shop is no longer what a customer lands on,
 * so there has to be a way to it from the top of every page and not only from
 * the bottom. It is deliberately the quiet one of the three - a customer who
 * came to order a jersey is not looking for it.
 */
export function ShopHeader() {
  const { cart, ready } = useCart();
  const pieces = cartPieces(cart);

  return (
    <header
      data-app-chrome
      className="sticky top-0 z-50 border-b border-line/60 bg-surface/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span>Dabz</span>
          <span aria-hidden="true" className="text-accent">
            ●
          </span>
          <span>Apparel</span>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <Link href="/about" className={`text-muted underline ${TAP_AREA}`}>
            What we do
          </Link>
          <Link href="/shop/designs" className={`text-accent underline ${TAP_AREA}`}>
            Designs{" "}
            <span aria-hidden="true">{"›"}</span>
          </Link>
          <Link href="/shop/order" className={`text-accent underline ${TAP_AREA}`}>
            Your order{ready && cart.length > 0 ? ` (${pieces})` : ""}{" "}
            <span aria-hidden="true">{"›"}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
