import { connection } from "next/server";

import { getStoreProducts, isStoreOpen } from "@/lib/data/store";
import { cleanSearchTerm, filterProducts, parseSort, sortProducts } from "@/lib/store/catalogue";
import { toCard } from "@/lib/store/card";
import { storeImageUrl } from "@/lib/store/storage";

import { ProductGrid } from "../ProductGrid";
import { StoreClosed } from "../StoreClosed";

export const metadata = { title: "Search" };

export default async function StoreSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }>;
}) {
  await connection();
  if (!(await isStoreOpen())) return <StoreClosed />;

  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const term = cleanSearchTerm(raw ?? "");
  const sort = parseSort(params.sort);

  const products = await getStoreProducts();
  const now = new Date();
  // No term is not "everything": the box is empty, so the page says so.
  const matches = term ? filterProducts(products, { search: term }) : [];
  const cards = sortProducts(matches, sort).map((p) => toCard(p, now, storeImageUrl));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <ProductGrid
        heading={term ? `Results for “${term}”` : "Search"}
        cards={cards}
        sort={sort}
        basePath="/store/search"
        query={term || undefined}
        emptyText={
          term
            ? "Nothing matches that. Try another word, or browse a category."
            : "Type a word in the search box above."
        }
      />
    </div>
  );
}
