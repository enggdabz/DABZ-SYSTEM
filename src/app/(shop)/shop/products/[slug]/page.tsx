import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getDesignsForProduct, getOnlineProductBySlug } from "@/lib/data/online";
import { designImageUrl, productImageUrl } from "@/lib/online/storage";

import { ProductOrderForm } from "./ProductOrderForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getOnlineProductBySlug(slug);

  if (!product) return { title: "Not found · Dabz Apparel" };

  return {
    title: `${product.name} · Dabz Apparel`,
    description:
      product.description ??
      `${product.name} from Dabz Apparel. Minimum ${product.minOrderQty} pcs, ready in about ${product.leadTimeDays} days.`,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();

  const { slug } = await params;
  const product = await getOnlineProductBySlug(slug);
  if (!product) notFound();

  const designs = await getDesignsForProduct(product);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link href="/shop" className={`text-sm text-accent underline ${TAP_AREA}`}>
          <span aria-hidden="true">{"‹"}</span> Back to the shop
        </Link>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-accent">
          {product.categoryName ?? "Dabz Apparel"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{product.name}</h1>
      </div>

      <ProductOrderForm
        product={product}
        designs={designs}
        productImages={product.images
          .map((image) => productImageUrl(image.storagePath))
          .filter((url): url is string => url !== null)}
        designImages={Object.fromEntries(
          designs.map((design) => [design.id, designImageUrl(design.imagePath)]),
        )}
      />
    </div>
  );
}
