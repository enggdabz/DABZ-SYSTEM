import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getOnlineDesigns, getOnlineProducts, isShopOpen } from "@/lib/data/online";
import { designImageUrl } from "@/lib/online/storage";

import { ShopClosed } from "../../../ShopClosed";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();

  if (!(await isShopOpen())) return <ShopClosed />;

  const { code } = await params;
  const [designs, products] = await Promise.all([
    getOnlineDesigns(),
    getOnlineProducts(),
  ]);

  const design = designs.find(
    (candidate) => candidate.code.toLowerCase() === code.toLowerCase(),
  );
  if (!design) notFound();

  const url = designImageUrl(design.imagePath);
  const offeredOn = products.filter(
    (product) => product.usesDesignGallery && design.productIds.includes(product.id),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <Link href="/shop/designs" className={`text-sm text-accent underline ${TAP_AREA}`}>
          <span aria-hidden="true">{"‹"}</span> All designs
        </Link>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-accent">
          {design.code}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{design.name}</h1>
      </div>

      <div className="aspect-square overflow-hidden rounded-card bg-tile">
        {url ? (
          <Image
            src={url}
            alt={design.name}
            width={800}
            height={800}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      {design.description ? <p className="text-muted">{design.description}</p> : null}

      <p className="text-muted">
        We recolor this design to your team&rsquo;s colors. Tell us what you
        want when you order &mdash; for example: black body, red accents, white
        numbers.
      </p>

      {offeredOn.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Order it on</h2>
          <ul className="space-y-2">
            {offeredOn.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/shop/products/${product.slug}`}
                  className={`text-accent underline ${TAP_AREA}`}
                >
                  {product.name} <span aria-hidden="true">{"›"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-card bg-surface p-5 text-sm text-muted ring-1 ring-line/60">
          This design is not on a product page yet. Message us on Facebook and
          we will quote it for you.
        </p>
      )}
    </div>
  );
}
