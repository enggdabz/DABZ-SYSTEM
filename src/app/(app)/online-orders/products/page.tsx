import Image from "next/image";
import { connection } from "next/server";

import { Card, Disclosure, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getOnlineCategories, getOnlineProducts } from "@/lib/data/online";
import { formatManilaDate } from "@/lib/datetime";
import {
  ADMIN_SORTS,
  ADMIN_SORT_LABELS,
  orderedLabel,
  parseAdminSort,
  priceLabel,
  sortForAdmin,
} from "@/lib/online/catalogue";
import { productImageUrl } from "@/lib/online/storage";

import { OnlineTabs } from "../OnlineTabs";
import { onlineTabs } from "../tabs";
import {
  AddProduct,
  DeleteProduct,
  ProductForm,
  ProductPhotos,
  ProductVisibility,
} from "./ProductForms";
import { SortPicker } from "./SortPicker";

export const metadata = { title: "Online shop products · Dabz System" };

export default async function OnlineProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  await connection();
  await requireOwnerOrAdmin();

  const [params, products, categories] = await Promise.all([
    searchParams,
    getOnlineProducts(true),
    getOnlineCategories(),
  ]);

  const sort = parseAdminSort(params.sort);
  const sorted = sortForAdmin(products, sort);
  const hidden = products.filter((product) => !product.isVisible).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Online shop</h1>
        <p className="mt-2 text-muted">
          What a customer can order from their phone. Products you add here
          appear on the shop right away.
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(true)} />

      {products.length === 0 ? (
        <Notice tone="info" title="Nothing on the shop yet">
          <p>
            The shop is empty, and that is what a customer sees. Nothing was
            put here for you: a price is something only you can decide, and a
            made-up one on a page a customer orders from is worse than an
            honest empty shelf.
          </p>
          <p className="mt-2">
            Add the things you already make &mdash; a full sublimation jersey, a
            DTF shirt, a jacket. A product priced <strong>on quote</strong> is a
            real answer for anything you price after seeing the design.
          </p>
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {products.length} product{products.length === 1 ? "" : "s"}
          {hidden > 0 ? `, ${hidden} hidden from the shop` : ""}
        </p>
        <SortPicker
          value={sort}
          options={ADMIN_SORTS.map((option) => ({
            value: option,
            label: ADMIN_SORT_LABELS[option],
          }))}
        />
      </div>

      <AddProduct categories={categories} />

      <section className="space-y-4">
        {sorted.map((product) => {
          const photo = productImageUrl(product.images[0]?.storagePath ?? null);

          return (
            <Card key={product.id}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="size-20 shrink-0 overflow-hidden rounded-control bg-tile">
                  {photo ? (
                    <Image
                      src={photo}
                      alt=""
                      width={160}
                      height={160}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                      No photo
                    </span>
                  )}
                </div>

                <div className="min-w-48 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {product.name}
                    </h2>
                    {product.categoryName ? <Tag>{product.categoryName}</Tag> : null}
                    {product.isVisible ? null : (
                      <Tag tone="attention">{"⚠"} Hidden</Tag>
                    )}
                    {product.usesRoster ? <Tag>Roster</Tag> : null}
                  </div>
                  <p className="text-sm text-muted">
                    Min {product.minOrderQty} &middot; {product.leadTimeDays} days
                    &middot; {orderedLabel(product)}
                  </p>
                  <p className="text-sm">
                    <strong>{priceLabel(product)}</strong>
                    <span className="text-muted">
                      {" "}
                      &middot; added {formatManilaDate(product.createdAt)}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <ProductVisibility
                    productId={product.id}
                    isVisible={product.isVisible}
                  />
                  <DeleteProduct productId={product.id} name={product.name} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <ProductPhotos
                  photos={product.images.map((image) => ({
                    id: image.id,
                    url: productImageUrl(image.storagePath),
                    alt: image.alt,
                  }))}
                />

                <Disclosure label={`Edit ${product.name}`}>
                  <ProductForm product={product} categories={categories} />
                </Disclosure>
              </div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
