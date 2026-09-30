import Link from "next/link";

import { TAP_AREA } from "@/components/ui";

/**
 * What a customer sees when the store is switched off: a plain sentence and no
 * way to order. The switch is checked by every page a customer could order
 * from (`store-closed.test.ts` reads the source and fails if one forgets),
 * because a bookmarked product URL outlives a button.
 */
export function StoreClosed() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">We&rsquo;re closed for now</h1>
      <p className="mt-3 text-muted">
        The online store isn&rsquo;t taking orders at the moment. Please check
        back soon.
      </p>
      <Link href="/" className={`mt-6 text-sm text-accent underline ${TAP_AREA}`}>
        Visit the Dabz Printshoppe page
      </Link>
    </div>
  );
}
