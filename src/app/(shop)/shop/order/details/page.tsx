import Link from "next/link";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getShopSettings, isShopOpen } from "@/lib/data/online";
import { earliestDateNeeded } from "@/lib/online/checkout";
import { manilaToday } from "@/lib/period";

import { ShopClosed } from "../../../ShopClosed";

import { CheckoutForm } from "./CheckoutForm";

/*
  Not indexed: it is one person's own order, and a search result pointing at
  it would be a page that means nothing to anybody else.
*/
export const metadata = {
  title: "Your details · Dabz Apparel",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  await connection();

  if (!(await isShopOpen())) return <ShopClosed />;

  const settings = await getShopSettings();
  const minDaysAhead = settings.onlineMinDaysAhead;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <Link href="/shop/order" className={`text-sm text-accent underline ${TAP_AREA}`}>
          <span aria-hidden="true">{"‹"}</span> Back to your order
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Your details</h1>
      </div>

      <CheckoutForm
        earliest={earliestDateNeeded(manilaToday(), minDaysAhead)}
        minDaysAhead={minDaysAhead}
      />
    </div>
  );
}
