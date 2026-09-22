import type { ReactNode } from "react";

import { isShopOpen } from "@/lib/data/online";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * The frame around the shop's public page.
 *
 * The same frame the online shop wears - see `SiteHeader`. The two used to
 * differ, and moving between them read as leaving one website for another.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  // Read once here rather than in both bars. `getShopSettings` is per-request
  // cached, so the page below asking for the same row costs nothing more.
  const shopOpen = await isShopOpen();

  return (
    <>
      <SiteHeader shopOpen={shopOpen} />
      <main className="flex-1">{children}</main>
      <SiteFooter shopOpen={shopOpen} />
    </>
  );
}
