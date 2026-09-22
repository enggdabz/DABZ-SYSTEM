import Image from "next/image";
import Link from "next/link";

import { TAP_AREA } from "@/components/ui";
import { priceLabel, termsLabel } from "@/lib/online/catalogue";
import { productImageUrl } from "@/lib/online/storage";
import type { Product } from "@/lib/online/types";

/**
 * What the shop sells, on the page a customer lands on.
 *
 * Somebody who types the shop's address wants to see what it makes, not a
 * button promising that things exist somewhere else. So the products come to
 * the front page, and the whole card is the link - a photo a thumb can hit.
 *
 * Six, not all of them: this is the front page, not the catalogue. They are
 * ordered the way the shop orders itself, most ordered first, which ties-break
 * by newest - so a shop with no orders yet reads as new arrivals rather than
 * as an arbitrary six.
 *
 * NOTHING is rendered when there are no products. An empty grid under a
 * heading that says "Order online" is a claim that the shop sells nothing, and
 * that is worse than the section simply not being there yet.
 */
export function ShopStrip({ products }: { products: readonly Product[] }) {
  if (products.length === 0) return null;

  return (
    <section
      id="order-online"
      className="mx-auto max-w-5xl px-4 py-12 sm:px-6"
      aria-labelledby="order-online-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="order-online-heading" className="text-2xl font-semibold tracking-tight">
          Order online
        </h2>
        <Link href="/shop" className={`text-sm text-accent underline ${TAP_AREA}`}>
          See the whole shop <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-muted">
        Pick what you need, add your team, and we take it from there. No payment
        is taken online &mdash; we confirm everything with you first.
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {products.map((product) => {
          const image = productImageUrl(product.images[0]?.storagePath ?? null);

          return (
            <li key={product.id}>
              <Link
                href={`/shop/products/${product.slug}`}
                className="group flex h-full flex-col gap-3 rounded-card bg-surface p-4 ring-1 ring-line/60 transition-transform hover:-translate-y-0.5"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">
                    {product.categoryName ?? "Dabz Apparel"}
                  </p>
                  <h3 className="font-semibold tracking-tight">{product.name}</h3>
                  <p className="text-sm">{priceLabel(product)}</p>
                  <p className="text-xs text-muted">{termsLabel(product)}</p>
                </div>

                <div className="mt-auto aspect-square overflow-hidden rounded-control bg-tile">
                  {image ? (
                    <Image
                      src={image}
                      alt=""
                      width={400}
                      height={400}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
