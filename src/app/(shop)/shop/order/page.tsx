import { connection } from "next/server";

import { getOnlineDesigns, getOnlineProducts } from "@/lib/data/online";
import { designImageUrl, productImageUrl } from "@/lib/online/storage";

import { OrderLines } from "./OrderLines";

/*
  Not indexed: it is one person's own order, and a search result pointing at
  it would be a page that means nothing to anybody else.
*/
export const metadata = {
  title: "Your order · Dabz Apparel",
  robots: { index: false, follow: false },
};

export default async function OrderPage() {
  await connection();

  /*
    The cart lives in the browser and carries storage PATHS, not URLs - the
    browser has no Supabase address to build one from. So the server hands
    down every picture it might need, which is a handful of strings.
  */
  const [products, designs] = await Promise.all([
    getOnlineProducts(),
    getOnlineDesigns(),
  ]);

  const imageUrls: Record<string, string> = {};
  for (const product of products) {
    for (const image of product.images) {
      const url = productImageUrl(image.storagePath);
      if (url) imageUrls[image.storagePath] = url;
    }
  }
  for (const design of designs) {
    const url = designImageUrl(design.imagePath);
    if (design.imagePath && url) imageUrls[design.imagePath] = url;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your order</h1>
      <OrderLines imageUrls={imageUrls} />
    </div>
  );
}
