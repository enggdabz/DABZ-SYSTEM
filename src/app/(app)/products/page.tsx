import { connection } from "next/server";

import { DeleteButton } from "@/components/DeleteButton";
import { Card, Disclosure, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  getAllProducts,
  getProductsWithSales,
  SECTION_LABELS,
} from "@/lib/data/pos";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";

import { deleteProductAction } from "./actions";
import { PriceTiersForm, ProductActiveForm, ProductForm } from "./ProductForms";

export const metadata = { title: "Products · Dabz System" };

export default async function ProductsPage() {
  await connection();

  await requireOwnerOrAdmin();
  const [products, productsWithSales] = await Promise.all([
    getAllProducts(),
    // Which ones have been sold, and so may only be hidden rather than deleted.
    getProductsWithSales(),
  ]);

  const active = products.filter((product) => product.active);
  const hidden = products.filter((product) => !product.active);
  const unpriced = active.filter((product) => product.priceCentavos === null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <p className="mt-2 text-muted">
          The buttons on the counter screen, and their prices.
        </p>
      </div>

      {unpriced.length > 0 ? (
        <Notice
          tone="attention"
          title={`${unpriced.length} ${unpriced.length === 1 ? "product has" : "products have"} no price yet`}
        >
          <p>
            {unpriced.map((product) => product.name).join(", ")} &mdash; the
            counter asks for the amount every time. Nothing was guessed, because
            a wrong price on a real sale is worse than a question. Fill one in
            below to turn it into a fixed button.
          </p>
        </Notice>
      ) : null}

      {products.length === 0 ? (
        <Notice tone="info" title="No products yet">
          <p>
            The counter has no buttons, so every sale has to be typed in by
            hand. Add the things you sell most often below &mdash; black &amp;
            white printing, photocopies, lamination, mugs. A product with no
            price still works: the counter asks for the amount each time, which
            is the right answer for anything you price per job.
          </p>
        </Notice>
      ) : null}

      <section className="space-y-4">
        {active.map((product) => (
          <Card key={product.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {product.name}
                  </h2>
                  <Tag>{SECTION_LABELS[product.section] ?? product.section}</Tag>
                  <Tag tone="neutral">{DIVISIONS[product.division].name}</Tag>
                  {product.priceCentavos === null ? (
                    <Tag tone="attention">{"⚠"} No price</Tag>
                  ) : null}
                </div>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {product.priceCentavos === null
                    ? "Asked at the counter"
                    : `${formatPesos(product.priceCentavos)}${product.unit ? ` / ${product.unit}` : ""}`}
                </p>
              </div>
            </div>

            <Disclosure
              className="mt-4 border-t border-line/60 pt-4"
              label="Edit, set a bulk price, or delete"
            >
              <div className="space-y-6">
                <ProductForm
                  product={{
                    id: product.id,
                    name: product.name,
                    division: product.division,
                    priceCentavos: product.priceCentavos,
                    unit: product.unit,
                    section: product.section,
                    incomeCategory: product.incomeCategory,
                  }}
                />

                <div className="border-t border-line/60 pt-5">
                  <h3 className="text-sm font-medium">Bulk price</h3>
                  <p className="mt-1 text-sm text-muted">
                    For example: from 50 pages up, each one costs ₱2.50. Leave
                    it alone if every quantity costs the same.
                  </p>
                  <div className="mt-3">
                    <PriceTiersForm
                      productId={product.id}
                      tiers={product.tiers.map((tier) => ({
                        id: tier.id,
                        minQuantity: tier.minQuantity,
                        unitPriceLabel: formatPesos(tier.unitPriceCentavos),
                      }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-3 border-t border-line/60 pt-5">
                  <ProductActiveForm
                    productId={product.id}
                    name={product.name}
                    active
                  />
                  <DeleteButton
                    kind="product"
                    name={product.name}
                    idField="productId"
                    id={product.id}
                    hasHistory={productsWithSales.has(product.id)}
                    action={deleteProductAction}
                    consequence={
                      product.tiers.length > 0
                        ? `Its ${product.tiers.length} bulk price rule${
                            product.tiers.length === 1 ? "" : "s"
                          } go with it.`
                        : undefined
                    }
                  />
                </div>
              </div>
            </Disclosure>
          </Card>
        ))}
      </section>

      {hidden.length > 0 ? (
        <Card
          title={`Hidden from the counter (${hidden.length})`}
          description="Kept, because old receipts still refer to them."
        >
          <ul className="space-y-4">
            {hidden.map((product) => (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm">{product.name}</span>
                <div className="flex flex-wrap items-start gap-3">
                  <ProductActiveForm
                    productId={product.id}
                    name={product.name}
                    active={false}
                  />
                  <DeleteButton
                    kind="product"
                    name={product.name}
                    idField="productId"
                    id={product.id}
                    hasHistory={productsWithSales.has(product.id)}
                    action={deleteProductAction}
                    consequence={
                      product.tiers.length > 0
                        ? `Its ${product.tiers.length} bulk price rule${
                            product.tiers.length === 1 ? "" : "s"
                          } go with it.`
                        : undefined
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Add a product">
        <ProductForm />
      </Card>
    </div>
  );
}
