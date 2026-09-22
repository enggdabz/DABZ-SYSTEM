import type { ReactNode } from "react";

import { isShopOpen } from "@/lib/data/online";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * The frame around the online shop.
 *
 * The same frame the public page wears, and that is the point: the shop is not
 * a separate website bolted on beside this one, it is the part of it a customer
 * can finish by themselves. `SiteHeader` has the whole story.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const shopOpen = await isShopOpen();

  return (
    <>
      <SiteHeader shopOpen={shopOpen} />
      <main className="flex-1">{children}</main>
      <SiteFooter shopOpen={shopOpen} />
    </>
  );
}
