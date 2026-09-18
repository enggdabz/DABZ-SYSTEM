import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getAllProducts, SECTION_LABELS } from "@/lib/data/pos";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";

import { PriceTiersForm, ProductActiveForm, ProductForm } from "./ProductForms";

export const metadata = { title: "Products · Dabz System" };

export default async function ProductsPage() {
  await connection();

  await requireOwnerOrAdmin();
  const products = await getAllProducts();

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

      <Notice tone="info" title="Colour tiers are named by ink coverage">
        <p>
          Light, medium, heavy and full page match the ₱5 / ₱8 / ₱10 / ₱15 you
          gave me. That is my guess at what the tiers are for &mdash; rename them
          here if they mean something else in your shop.
        </p>
      </Notice>

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

            <details className="mt-4 border-t border-line/60 pt-4">
              <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                Edit, or set a bulk price
              </summary>
              <div className="mt-5 space-y-6">
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
                    For example: from 50 pages up, each one costs ₱2.50. You have
                    not given me any bulk rules, so there are none.
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

                <div className="border-t border-line/60 pt-5">
                  <ProductActiveForm
                    productId={product.id}
                    name={product.name}
                    active
                  />
                </div>
              </div>
            </details>
          </Card>
        ))}
      </section>

      {hidden.length > 0 ? (
        <Card
          title={`Hidden from the counter (${hidden.length})`}
          description="Kept, because old receipts still refer to them."
        >
          <ul className="space-y-3">
            {hidden.map((product) => (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm">{product.name}</span>
                <ProductActiveForm
                  productId={product.id}
                  name={product.name}
                  active={false}
                />
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
