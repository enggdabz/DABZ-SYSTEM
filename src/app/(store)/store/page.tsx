import { connection } from "next/server";

import { getStoreBanners, getStoreProducts, isStoreOpen } from "@/lib/data/store";
import { parseSort, sortProducts } from "@/lib/store/catalogue";
import { toCard } from "@/lib/store/card";
import { storeImageUrl } from "@/lib/store/storage";

import { BannerSlider } from "./BannerSlider";
import { Hero } from "./Hero";
import { ProductGrid } from "./ProductGrid";
import { StoreClosed } from "./StoreClosed";

export const metadata = {
  title: "Dabz Apparel — custom jerseys, shirts and jackets",
};

export default async function StoreHomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  await connection();
  if (!(await isStoreOpen())) return <StoreClosed />;

  const sort = parseSort((await searchParams).sort);
  const [products, banners] = await Promise.all([getStoreProducts(), getStoreBanners()]);

  const now = new Date();
  const cards = sortProducts(products, sort).map((p) => toCard(p, now, storeImageUrl));

  const slides = banners
    .map((banner) => ({
      id: banner.id,
      imageUrl: storeImageUrl(banner.imagePath),
      title: banner.title,
      subtitle: banner.subtitle,
      linkUrl: banner.linkUrl,
    }))
    .filter((slide): slide is typeof slide & { imageUrl: string } => slide.imageUrl !== null);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
      {slides.length > 0 ? <BannerSlider slides={slides} /> : <Hero />}

      <ProductGrid
        heading="All products"
        cards={cards}
        sort={sort}
        basePath="/store"
        emptyText="Our products are on their way. Please check back soon."
      />
    </div>
  );
}
