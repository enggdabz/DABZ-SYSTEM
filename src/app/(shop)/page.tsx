import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import {
  getOnlineCategories,
  getOnlineDesigns,
  getOnlineProducts,
  getShopSettings,
} from "@/lib/data/online";
import { designImageUrl, productImageUrl } from "@/lib/online/storage";

import { CatalogueBrowser } from "./CatalogueBrowser";

/**
 * The shop's front door (22 September 2026).
 *
 * This page used to live at `/shop`, behind the Phase 9 page about the whole
 * business. The owner asked for it the other way round: what a customer can
 * actually finish by themselves is the products, so the products are what they
 * land on. The rest of the shop - the three divisions, their price lists, the
 * address and the enquiry form - is one link away at `/about`, and `/shop`
 * still answers, permanently redirected here in `next.config.ts` for every
 * link already handed out.
 */
export const metadata = {
  title: "Dabz Apparel — custom teamwear, ordered online",
  description:
    "Full sublimation and DTF uniforms from Dabz Printshoppe in San Carlos City. Pick a design, add your team, and we take it from there.",
  openGraph: {
    title: "Dabz Apparel — custom teamwear",
    description:
      "Full sublimation and DTF uniforms, ordered online in minutes.",
  },
};

export default async function HomePage() {
  await connection();

  const [products, categories, designs, settings] = await Promise.all([
    getOnlineProducts(),
    getOnlineCategories(),
    getOnlineDesigns(),
    getShopSettings(),
  ]);

  /*
    The "Show the online shop" switch, answered differently here than anywhere
    else in the shop.

    Everywhere else, off shows `ShopClosed` - a short honest page instead of a
    404. On the FRONT DOOR that would be a dead end where the homepage used to
    be: no address, no opening hours, no price lists, no way to ask. So this
    one page sends the customer to the page about the rest of the shop, which
    is exactly what stood here before. `shop-closed.test.ts` holds it to that.
  */
  if (!settings.onlineShopEnabled) redirect("/about");

  const imageUrls = Object.fromEntries(
    products.map((product) => [
      product.id,
      productImageUrl(product.images[0]?.storagePath ?? null),
    ]),
  );

  const heroImages = products
    .map((product) => imageUrls[product.id])
    .filter((url): url is string => url !== null)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl space-y-14 px-4 py-10 sm:px-6">
      <section className="rounded-[28px] bg-surface p-6 ring-1 ring-line/60 sm:p-10">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Custom teamwear
        </p>
        <h1 className="mt-3 text-[clamp(38px,6.4vw,72px)] font-semibold leading-[1.05] tracking-tight">
          Your team. Your colors.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Full sublimation and DTF uniforms, ordered online in minutes.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link
            href="#products"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface"
          >
            Shop uniforms
          </Link>
          <Link href="/shop/track" className={`text-sm text-accent underline ${TAP_AREA}`}>
            Track my order <span aria-hidden="true">{"›"}</span>
          </Link>
        </div>

        {heroImages.length > 0 ? (
          <div className="mt-8 grid grid-cols-3 gap-3">
            {heroImages.map((url) => (
              <div
                key={url}
                className="aspect-square overflow-hidden rounded-control bg-tile"
              >
                <Image
                  src={url}
                  alt=""
                  width={400}
                  height={400}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
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
            <h2 className="font-semibold tracking-tight">{step.title}</h2>
            <p className="mt-1.5 text-sm text-muted">{step.body}</p>
          </div>
        ))}
      </section>

      {designs.length > 0 ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              Ready-made jersey designs
            </h2>
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
        </section>
      ) : null}

      {products.length === 0 ? (
        <section
          id="products"
          className="rounded-card bg-surface p-6 ring-1 ring-line/60"
        >
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          {/*
            Nothing here is addressed to the owner. A customer reading "add a
            product under Settings" sees a shop that is not open yet; the gap
            belongs on the To fill in screen, where the owner will look.
          */}
          <p className="mt-2 text-muted">
            Our online list is being put together. Message us on Facebook and we
            will quote your team straight away.
          </p>
        </section>
      ) : (
        <CatalogueBrowser
          products={products}
          categories={categories}
          imageUrls={imageUrls}
        />
      )}
    </div>
  );
}
