import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  getApparelOptions,
  getApparelProducts,
  getSizePrices,
} from "@/lib/data/apparel";
import { formatPesos } from "@/lib/money";

import { OptionForm, ProductForm, SizePriceForm } from "./PriceForms";

export const metadata = { title: "Apparel prices · Dabz System" };

export default async function ApparelPricesPage() {
  await connection();

  // Prices are the owner's to set (spec 7.2), the same rule as products.
  await requireOwnerOrAdmin();

  const [products, sizes, options, settings] = await Promise.all([
    getApparelProducts(),
    getSizePrices(),
    getApparelOptions(),
    getSettings(),
  ]);

  const unpriced = products.filter(
    (product) => product.active && product.basePriceCentavos === null,
  );
  const sizesWithoutPrice = sizes.filter((size) => size.extraCentavos === null);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/apparel" className="text-sm text-muted underline">
          &larr; Back to job orders
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Apparel prices
        </h1>
        <p className="mt-2 text-muted">
          What each item costs, what the big sizes add, and the fabrics and
          collars you offer. Nothing here was filled in for you.
        </p>
      </div>

      <Notice tone="info" title="Why these are empty">
        A price is a figure only you can know. A made-up one would be quoted to
        a real customer and honoured, so every box below starts blank and the
        order screen simply asks for the amount until you fill it in.
      </Notice>

      <Card
        title="Items"
        description="The five things Dabz Apparel sells, from your own list."
      >
        {unpriced.length > 0 ? (
          <div className="mb-5">
            <Notice
              tone="attention"
              title={`${unpriced.length} item${
                unpriced.length === 1 ? " has" : "s have"
              } no price`}
            >
              {unpriced.map((product) => product.name).join(", ")}. Orders still
              work &mdash; whoever writes one is asked for the price.
            </Notice>
          </div>
        ) : null}

        <ul className="divide-y divide-line/60">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span>
                <span className="font-medium">{product.name}</span>
                {!product.active ? (
                  <span className="ml-2">
                    <Tag>Not offered</Tag>
                  </span>
                ) : null}
                <span className="block text-xs text-muted">
                  {product.basePriceCentavos === null ? (
                    <>
                      <span aria-hidden="true">{"⚠"} </span>no price set
                    </>
                  ) : (
                    formatPesos(product.basePriceCentavos)
                  )}
                  {product.note ? ` · ${product.note}` : ""}
                </span>
              </span>
              <ProductForm product={product} />
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <ProductForm />
        </div>
      </Card>

      <Card
        title="Size add-ons"
        description="What each size adds on top of the item price. A 2XL costs more fabric to make, so most shops charge for it."
      >
        {sizesWithoutPrice.length > 0 ? (
          <div className="mb-5">
            <Notice
              tone="attention"
              title={`${sizesWithoutPrice.length} size${
                sizesWithoutPrice.length === 1 ? " has" : "s have"
              } no add-on set`}
            >
              Until you set one, those sizes are added to an order at no extra
              cost. That is not the same as free &mdash; it is unknown, and the
              order screen says so when the list is pasted in.
            </Notice>
          </div>
        ) : null}

        <p className="mb-4 text-sm text-muted">
          Leave a box empty to say nothing extra is charged yet. Enter 0 to say
          the size genuinely costs no more.
        </p>

        <div className="space-y-2">
          {sizes.map((size) => (
            <SizePriceForm
              key={size.size}
              size={size.size}
              extraCentavos={size.extraCentavos}
            />
          ))}
        </div>

        <p className="mt-4 text-xs text-muted">
          Changing one of these never rewrites an order already written: the
          add-on is copied onto each name when it is added.
        </p>
      </Card>

      <Card
        title="Down payment"
        description="How much of an order you ask for up front."
      >
        {settings.apparelDownPaymentPercent === null ? (
          <Notice tone="attention" title="No policy set">
            The order screen asks for whatever the customer hands over and never
            says a payment is short.{" "}
            <Link href="/settings" className="underline">
              Set a percentage in Settings
            </Link>{" "}
            if you want it checked.
          </Notice>
        ) : (
          <p className="text-sm">
            You ask for{" "}
            <span className="font-semibold">
              {settings.apparelDownPaymentPercent}%
            </span>{" "}
            up front.{" "}
            <Link href="/settings" className="underline">
              Change it in Settings
            </Link>
            .
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Fabrics"
          description="A shortcut list. Anything can still be typed on an order."
        >
          {options.filter((option) => option.kind === "fabric").length === 0 ? (
            <p className="text-sm text-muted">
              None added. The order form takes free text either way.
            </p>
          ) : (
            <ul className="mb-4 flex flex-wrap gap-2">
              {options
                .filter((option) => option.kind === "fabric")
                .map((option) => (
                  <li key={option.id}>
                    <Tag>{option.label}</Tag>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-4">
            <OptionForm kind="fabric" />
          </div>
        </Card>

        <Card
          title="Collars"
          description="A shortcut list. Anything can still be typed on an order."
        >
          {options.filter((option) => option.kind === "collar").length === 0 ? (
            <p className="text-sm text-muted">
              None added. The order form takes free text either way.
            </p>
          ) : (
            <ul className="mb-4 flex flex-wrap gap-2">
              {options
                .filter((option) => option.kind === "collar")
                .map((option) => (
                  <li key={option.id}>
                    <Tag>{option.label}</Tag>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-4">
            <OptionForm kind="collar" />
          </div>
        </Card>
      </div>
    </div>
  );
}
