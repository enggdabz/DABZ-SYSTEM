import Link from "next/link";

import { TAP_AREA } from "@/components/ui";

/**
 * One footer for the whole customer-facing site, matching `SiteHeader`.
 *
 * It carries every way through the site, including the two the header leaves
 * out: Designs on a narrow phone, and Track my order - which a customer needs
 * exactly once per order and should not have to hunt for.
 *
 * Staff sign in stays small and last. This door is for staff, not customers.
 *
 * With the shop switched off the shop links go, but TRACK MY ORDER STAYS:
 * somebody who already ordered is owed their order however long the shop is
 * shut, and that page keeps working precisely so they are.
 */
export function SiteFooter({ shopOpen = true }: { shopOpen?: boolean }) {
  return (
    <footer
      data-app-chrome
      className="border-t border-line/60 px-4 py-8 text-sm text-muted sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <p>
          Dabz Printshoppe &middot; Dabz Apparel &middot; DabzTech Solutions
          <span className="block text-xs">
            San Carlos City, Pangasinan &middot; since 18 June 2017
          </span>
        </p>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/" className={`underline ${TAP_AREA}`}>
            Home
          </Link>
          {shopOpen ? (
            <>
              <Link href="/#order-online" className={`underline ${TAP_AREA}`}>
                Shop
              </Link>
              <Link href="/shop/designs" className={`underline ${TAP_AREA}`}>
                Designs
              </Link>
            </>
          ) : null}
          <Link href="/shop/track" className={`underline ${TAP_AREA}`}>
            Track my order
          </Link>
          <Link href="/#contact" className={`underline ${TAP_AREA}`}>
            Contact
          </Link>
          <Link href="/login" className={`text-xs underline ${TAP_AREA}`}>
            Staff sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
