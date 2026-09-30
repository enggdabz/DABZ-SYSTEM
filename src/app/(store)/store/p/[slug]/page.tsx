import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import {
  getStoreMessengerUsername,
  getStoreProductBySlug,
  getStoreProducts,
  isStoreOpen,
} from "@/lib/data/store";
import { relatedProducts } from "@/lib/store/catalogue";
import { toCard } from "@/lib/store/card";
import { messengerLink, productRef } from "@/lib/store/messenger";
import { storeImageUrl } from "@/lib/store/storage";

import { ProductCard } from "../../ProductCard";
import { StoreClosed } from "../../StoreClosed";

import { BuyPanel } from "./BuyPanel";
import { ProductGallery } from "./ProductGallery";
import { RecentlyViewed } from "./RecentlyViewed";
import { SizeChartView } from "./SizeChartView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getStoreProductBySlug(slug);
  if (!product) return { title: "Not found" };

  return {
    title: product.name,
    description: product.description ?? `${product.name} from Dabz Apparel.`,
  };
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  if (!(await isStoreOpen())) return <StoreClosed />;

  const { slug } = await params;
  const [product, all, messengerUsername] = await Promise.all([
    getStoreProductBySlug(slug),
    getStoreProducts(),
    getStoreMessengerUsername(),
  ]);
  if (!product) notFound();

  const now = new Date();
  const related = relatedProducts(all, product, 4).map((p) => toCard(p, now, storeImageUrl));

  const photos = product.photos.flatMap((photo) => {
    const url = storeImageUrl(photo.path);
    return url ? [{ url, alt: photo.alt ?? "" }] : [];
  });

  const chatHref = messengerLink(messengerUsername, productRef(product.id));

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/store" className={`hover:underline ${TAP_AREA}`}>
            Store
          </Link>
          {product.categorySlug ? (
            <>
              <span aria-hidden="true"> / </span>
              <Link href={`/store/c/${product.categorySlug}`} className={`hover:underline ${TAP_AREA}`}>
                {product.categoryName}
              </Link>
            </>
          ) : null}
        </nav>

        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          <ProductGallery photos={photos} name={product.name} />

          <div className="space-y-6">
            <div>
              {product.categoryName ? (
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {product.categoryName}
                </p>
              ) : null}
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
            </div>

            <BuyPanel
              product={{
                pricingMode: product.pricingMode,
                basePriceCentavos: product.basePriceCentavos,
                minOrderQty: product.minOrderQty,
                tiers: product.tiers,
                sizeSurcharges: product.sizeSurcharges,
                variants: product.variants,
              }}
              chatHref={chatHref}
            />

            {product.sizeChart ? <SizeChartView chart={product.sizeChart} /> : null}
          </div>
        </div>
      </div>

      {product.description ? (
        <section aria-labelledby="about-heading" className="max-w-2xl space-y-3">
          <h2 id="about-heading" className="text-xl font-semibold tracking-tight">
            About this product
          </h2>
          <p className="whitespace-pre-line text-muted">{product.description}</p>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="space-y-4">
          <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
            You may also like
          </h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5">
            {related.map((card) => (
              <li key={card.id}>
                <ProductCard card={card} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RecentlyViewed currentId={product.id} />
    </div>
  );
}
