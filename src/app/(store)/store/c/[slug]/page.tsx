import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getStoreCategories, getStoreProducts, isStoreOpen } from "@/lib/data/store";
import { filterProducts, parseSort, sortProducts } from "@/lib/store/catalogue";
import { toCard } from "@/lib/store/card";
import { storeImageUrl } from "@/lib/store/storage";

import { ProductGrid } from "../../ProductGrid";
import { StoreClosed } from "../../StoreClosed";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = (await getStoreCategories()).find((c) => c.slug === slug);
  return { title: category ? category.name : "Not found" };
}

export default async function StoreCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  await connection();
  if (!(await isStoreOpen())) return <StoreClosed />;

  const { slug } = await params;
  const category = (await getStoreCategories()).find((c) => c.slug === slug);
  if (!category) notFound();

  const sort = parseSort((await searchParams).sort);
  const products = await getStoreProducts();

  const now = new Date();
  const cards = sortProducts(filterProducts(products, { categorySlug: slug }), sort).map((p) =>
    toCard(p, now, storeImageUrl),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <ProductGrid
        heading={category.name}
        cards={cards}
        sort={sort}
        basePath={`/store/c/${slug}`}
        emptyText={`Nothing in ${category.name} just yet. Please check back soon.`}
      />
    </div>
  );
}
