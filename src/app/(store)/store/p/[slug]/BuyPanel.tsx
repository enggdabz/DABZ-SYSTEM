"use client";

import { useMemo, useState } from "react";

import { formatPesos } from "@/lib/money";
import { totalFor, unitPriceFor } from "@/lib/store/catalogue";
import type { BulkTier, PricingMode, StoreVariant } from "@/lib/store/types";
import {
  availabilityText,
  colorOptions,
  findVariant,
  optionAvailable,
  sizeOptions,
} from "@/lib/store/variants";

export interface BuyPanelProduct {
  pricingMode: PricingMode;
  basePriceCentavos: number | null;
  minOrderQty: number;
  tiers: BulkTier[];
  sizeSurcharges: Record<string, number>;
  variants: StoreVariant[];
}

/**
 * Choosing a size, a colour and a quantity, with the price following along.
 *
 * Every figure comes from `lib/store/catalogue.ts` - the same functions the
 * tests hold - and never from arithmetic written here. What this screen shows
 * is a PREVIEW: when ordering is built, the server re-derives the price from
 * the database and does not believe this one.
 *
 * A quote-only product never reaches the price code at all: there is no price
 * in the data, and this panel shows the request-a-quote note instead.
 */
export function BuyPanel({
  product,
  chatHref,
}: {
  product: BuyPanelProduct;
  /** m.me link, or null when the shop has not said its Messenger name. */
  chatHref: string | null;
}) {
  const sizes = useMemo(() => sizeOptions(product.variants), [product.variants]);
  const colors = useMemo(() => colorOptions(product.variants), [product.variants]);

  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(product.minOrderQty);

  const quote = product.pricingMode === "quote";
  const selected = findVariant(product.variants, size, color);
  const stockNote = selected ? availabilityText(selected.availability) : null;

  const unit = unitPriceFor(product, quantity, size);
  const total = totalFor(product, quantity, size);

  function changeQuantity(next: number) {
    if (!Number.isFinite(next)) return;
    setQuantity(Math.min(9999, Math.max(product.minOrderQty, Math.trunc(next))));
  }

  // The tier the current quantity falls in, for the highlighted row.
  const activeTier = [...product.tiers]
    .filter((tier) => quantity >= tier.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];

  return (
    <div className="space-y-6">
      {quote ? (
        <div className="rounded-card bg-tile p-5">
          <p className="text-2xl font-semibold tracking-tight text-accent">Request quote</p>
          <p className="mt-2 text-sm text-muted">
            We price this after seeing your design and how many you need. Message
            us and we will reply with a quote.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-3xl font-semibold tracking-tight">
            {formatPesos(unit ?? product.basePriceCentavos ?? 0)}
            <span className="ml-1 text-base font-normal text-muted">each</span>
          </p>
        </div>
      )}

      {sizes.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Size{size ? <span className="ml-2 font-normal text-muted">{size}</span> : null}
          </legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((option) => {
              const available = optionAvailable(product.variants, "size", option);
              const extra = product.sizeSurcharges[option];
              return (
                <button
                  key={option}
                  type="button"
                  disabled={!available}
                  aria-pressed={size === option}
                  onClick={() => setSize(size === option ? null : option)}
                  className={`min-h-11 min-w-12 rounded-control px-4 text-sm font-medium ring-1 transition-colors ${
                    size === option
                      ? "bg-ink text-page ring-ink"
                      : "bg-page text-ink ring-line hover:bg-seg"
                  } disabled:cursor-not-allowed disabled:text-muted disabled:line-through disabled:opacity-60`}
                >
                  {option}
                  {!quote && extra ? (
                    <span className="ml-1 text-xs opacity-70">+{formatPesos(extra, { withSign: false })}</span>
                  ) : null}
                  {!available ? <span className="sr-only"> (sold out)</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {colors.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Colour{color ? <span className="ml-2 font-normal text-muted">{color}</span> : null}
          </legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((option) => {
              const available = optionAvailable(product.variants, "color", option.name);
              return (
                <button
                  key={option.name}
                  type="button"
                  disabled={!available}
                  aria-pressed={color === option.name}
                  onClick={() => setColor(color === option.name ? null : option.name)}
                  className={`flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium ring-1 transition-colors ${
                    color === option.name
                      ? "bg-ink text-page ring-ink"
                      : "bg-page text-ink ring-line hover:bg-seg"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {option.hex ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-full ring-1 ring-line"
                      style={{ backgroundColor: option.hex }}
                    />
                  ) : null}
                  {option.name}
                  {!available ? <span className="text-xs"> (sold out)</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {stockNote ? (
        <p
          className={`flex items-center gap-2 text-sm font-medium ${
            selected?.availability === "low" ? "text-attention" : "text-muted"
          }`}
        >
          <span aria-hidden="true">{selected?.availability === "low" ? "⚠" : "•"}</span>
          {stockNote}
        </p>
      ) : null}

      {!quote ? (
        <>
          <div>
            <label htmlFor="qty" className="mb-2 block text-sm font-medium">
              Quantity
            </label>
            <div className="inline-flex items-center rounded-control ring-1 ring-line">
              <button
                type="button"
                aria-label="Fewer"
                disabled={quantity <= product.minOrderQty}
                onClick={() => changeQuantity(quantity - 1)}
                className="flex h-11 w-11 items-center justify-center text-lg hover:bg-seg disabled:opacity-40"
              >
                −
              </button>
              <input
                id="qty"
                type="number"
                inputMode="numeric"
                min={product.minOrderQty}
                max={9999}
                value={quantity}
                onChange={(event) => changeQuantity(event.target.valueAsNumber)}
                className="h-11 w-16 bg-transparent text-center text-base [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="More"
                onClick={() => changeQuantity(quantity + 1)}
                className="flex h-11 w-11 items-center justify-center text-lg hover:bg-seg"
              >
                +
              </button>
            </div>
            {product.minOrderQty > 1 ? (
              <p className="mt-2 text-xs text-muted">Minimum order: {product.minOrderQty} pieces</p>
            ) : null}
          </div>

          {product.tiers.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">Order more, pay less each</p>
              <table className="w-full text-sm">
                <tbody>
                  <TierRow
                    label={`${product.minOrderQty}${product.tiers[0] ? `–${product.tiers[0].minQty - 1}` : "+"}`}
                    price={product.basePriceCentavos}
                    active={activeTier === undefined}
                  />
                  {product.tiers.map((tier, i) => {
                    const next = product.tiers[i + 1];
                    return (
                      <TierRow
                        key={tier.minQty}
                        label={next ? `${tier.minQty}–${next.minQty - 1}` : `${tier.minQty}+`}
                        price={tier.unitPriceCentavos}
                        active={activeTier?.minQty === tier.minQty}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">Total</span>
            <span aria-live="polite" className="text-2xl font-semibold tracking-tight">
              {total === null ? "—" : formatPesos(total)}
            </span>
          </div>
        </>
      ) : null}

      {chatHref ? (
        <a
          href={chatHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex min-h-12 w-full items-center justify-center rounded-full px-6 text-base font-medium ${
            quote ? "bg-accent text-on-accent" : "bg-page text-ink ring-1 ring-ink"
          }`}
        >
          {quote ? "Message us for a quote" : "Chat now"}
        </a>
      ) : null}
    </div>
  );
}

function TierRow({ label, price, active }: { label: string; price: number | null; active: boolean }) {
  return (
    <tr className={active ? "bg-tile font-semibold" : ""}>
      <td className="rounded-l-control px-3 py-2">
        {label} pcs
        {active ? <span className="ml-2 text-xs font-medium text-accent">✓ your price</span> : null}
      </td>
      <td className="rounded-r-control px-3 py-2 text-right">
        {price === null ? "—" : `${formatPesos(price)} each`}
      </td>
    </tr>
  );
}
