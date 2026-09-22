import Image from "next/image";
import Link from "next/link";

import { TAP_AREA } from "@/components/ui";
import { designImageUrl, productImageUrl } from "@/lib/online/storage";
import type { Category, Design, Product } from "@/lib/online/types";

import { CatalogueBrowser } from "./CatalogueBrowser";

/**
 * The online shop, on the page a customer lands on.
 *
 * This used to be a page of its own at `/shop`, with its own hero and its own
 * header, and the front page had a button pointing at it. That made two
 * websites for one business: a customer who typed the shop's address got a
 * description of it and a door to somewhere else.
 *
 * So the shop moved here, and `/shop` now redirects to this section. What was
 * dropped in the move is only the shop's separate hero - the page above
 * already says who this is and what they do, and saying it twice on one page
 * is how a page starts feeling like two.
 *
 * Everything else came with it: how ordering works, the ready-made designs,
 * and the catalogue with its search, its category chips and its sort.
 */
export function ShopSection({
  products,
  categories,
  designs,
}: {
  products: Product[];
  categories: Category[];
  designs: Design[];
}) {
  const imageUrls = Object.fromEntries(
    products.map((product) => [
      product.id,
      productImageUrl(product.images[0]?.storagePath ?? null),
    ]),
  );

  return (
    <section
      id="order-online"
      className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6"
      aria-labelledby="order-online-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="order-online-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          Order online
        </h2>
        <Link href="/shop/track" className={`text-sm text-accent underline ${TAP_AREA}`}>
          Track my order <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Choose your style.",
            body: "Pick a jersey, a shirt, a jacket — or one of our ready-made designs.",
          },
          {
            title: "Add your team.",
            body: "Type the names, numbers and sizes. The list is the quantity.",
          },
          {
            title: "We take it from there.",
            body: "We confirm the price on Messenger, then print, sew and pack it.",
          },
        ].map((step) => (
          <div key={step.title} className="rounded-card bg-surface p-5 ring-1 ring-line/60">
            <h3 className="font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{step.body}</p>
          </div>
        ))}
      </div>

      {designs.length > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold tracking-tight">
              Ready-made jersey designs
            </h3>
            <Link href="/shop/designs" className={`text-sm text-accent underline ${TAP_AREA}`}>
              See all designs <span aria-hidden="true">{"›"}</span>
            </Link>
          </div>

          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {designs.slice(0, 4).map((design) => {
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
                          width={300}
                          height={300}
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
        </div>
      ) : null}

      {products.length === 0 ? (
        /*
          Nothing here is addressed to the owner. A customer reading "add a
          product under Settings" sees a shop that is not open yet; that gap
          belongs on the To fill in screen, where the owner will look.
        */
        <div id="products" className="rounded-card bg-surface p-6 ring-1 ring-line/60">
          <p className="text-muted">
            Our online list is being put together. Message us on Facebook and we
            will send you what we have.
          </p>
        </div>
      ) : (
        <CatalogueBrowser
          products={products}
          categories={categories}
          imageUrls={imageUrls}
        />
      )}
    </section>
  );
}
