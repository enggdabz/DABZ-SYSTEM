import Link from "next/link";

import { TAP_AREA } from "@/components/ui";

/**
 * What a customer sees while the shop is switched off (Settings -> "Show the
 * online shop").
 *
 * A short, honest page rather than a 404, for the reason the Phase 9 public
 * page gives: a "not found" on a shop's front door reads as a shop that is
 * broken, and this one is only closed. Nothing here is addressed to the owner
 * either - a customer told to "fill this in under Settings" sees a shop that
 * was never open.
 *
 * Tracking an order and a receipt link stay open while this is up. Somebody
 * who already ordered is owed their order however long the shop stays shut.
 */
export function ShopClosed() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Dabz Apparel</h1>
      <p className="mt-4 text-muted">
        We are not taking online orders just now. Please message us on Facebook
        or drop by the shop and we will sort it out from there.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
        <Link href="/shop/track" className={`underline ${TAP_AREA}`}>
          Track an order you already placed
        </Link>
        <Link href="/" className={`underline ${TAP_AREA}`}>
          Everything else we do
        </Link>
      </div>
    </section>
  );
}
