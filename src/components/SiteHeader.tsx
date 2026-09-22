"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/ui";
import { cartPieces } from "@/lib/online/cart";
import { useCart } from "@/lib/online/useCart";

/**
 * One top bar for the whole customer-facing site.
 *
 * There used to be two: the Phase 9 public page had its own, and the Phase 14
 * shop had another with a different name, different colours and a different
 * idea of where "home" was. Tapping "Order jerseys online" moved a customer
 * from one to the other, and it read as leaving this shop's website for
 * somebody else's. They are one business, so they are now one site.
 *
 * It is a client component because of ONE thing: the order count. That has to
 * come from the browser - a number rendered on the server would be a guess,
 * and wrong for anybody with something already in their order - so it stays
 * blank until the cart has been read rather than flashing a zero.
 *
 * Deliberately still NOT the staff app's top bar. A customer has no sections
 * to navigate and nothing to sign out of; the way in for staff is in the
 * footer, small, where it has always been.
 *
 * `shopOpen` is the Settings switch, read by the layout. With the shop off the
 * shop links go entirely: a bar that offers "Shop" and lands on "we are not
 * taking orders" is the button lying about where it goes.
 */
export function SiteHeader({ shopOpen = true }: { shopOpen?: boolean }) {
  const { cart, ready } = useCart();
  const pieces = cartPieces(cart);

  return (
    <header
      data-app-chrome
      className="sticky top-0 z-50 bg-topbar text-topbar-ink backdrop-blur-xl"
    >
      <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
          {shopOpen ? (
            <>
              <NavLink href="/#order-online">Shop</NavLink>
              {/*
                Hidden on the narrowest phones, where five items and a theme
                toggle wrap onto three rows and push the page down. It is in
                the footer at every width, and the shop's page leads to it.
              */}
              <span className="hidden sm:contents">
                <NavLink href="/shop/designs">Designs</NavLink>
              </span>
              <NavLink href="/shop/order">
                Your order{ready && cart.length > 0 ? ` (${pieces})` : ""}
              </NavLink>
            </>
          ) : null}

          <Link
            href="/#contact"
            className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
          >
            Get in touch
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/**
 * A bar link. Not `TAP_AREA`: that is for underlined text inside a sentence,
 * and its `px-1` would fight the `px-3` here. A pill this size is already well
 * past the 24px a thumb needs.
 */
function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-sm text-topbar-ink/70 hover:bg-white/10 hover:text-topbar-ink"
    >
      {children}
    </Link>
  );
}
