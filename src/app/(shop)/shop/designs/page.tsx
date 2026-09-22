import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getOnlineDesigns, isShopOpen } from "@/lib/data/online";
import { designImageUrl } from "@/lib/online/storage";

import { ShopClosed } from "../../ShopClosed";

export const metadata = {
  title: "Jersey designs · Dabz Apparel",
  description:
    "Ready-made jersey designs from Dabz Apparel. Pick one and we recolor it to your team's colors.",
};

export default async function DesignGalleryPage() {
  await connection();

  if (!(await isShopOpen())) return <ShopClosed />;

  const designs = await getOnlineDesigns();

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <Link href="/shop" className={`text-sm text-accent underline ${TAP_AREA}`}>
          <span aria-hidden="true">{"‹"}</span> Back to the shop
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Ready-made jersey designs
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          Pick one and tell us your colors. We recolor it for you before
          anything is printed &mdash; the design stays the same, the colors are
          yours.
        </p>
      </div>

      {designs.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted ring-1 ring-line/60">
          Our design gallery is being photographed. Message us on Facebook and
          we will send you what we have.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {designs.map((design) => {
            const url = designImageUrl(design.imagePath);
            return (
              <li key={design.id}>
                <Link
                  href={`/shop/designs/${design.code}`}
                  className="block space-y-2 rounded-card bg-surface p-3 ring-1 ring-line/60"
                >
                  <div className="aspect-square overflow-hidden rounded-control bg-tile">
                    {url ? (
                      <Image
                        src={url}
                        alt=""
                        width={400}
                        height={400}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">{design.code}</p>
                  <p className="text-sm font-medium">{design.name}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
