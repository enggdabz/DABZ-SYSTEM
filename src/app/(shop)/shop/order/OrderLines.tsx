"use client";

import Image from "next/image";
import Link from "next/link";

import { TAP_AREA } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import { cartPreview } from "@/lib/online/cart";
import { sizeSummary, sizesFromRoster } from "@/lib/online/items";

import { useCart } from "@/lib/online/useCart";

/**
 * The customer's order, before their details (docs/spec.md 8.3).
 *
 * The totals here are the same three sentences the order page will show
 * later: an order with something still to be priced says "PHP 2,700 + quote"
 * rather than printing the half it knows, and shows no balance at all. A
 * figure a customer might pay has to be the whole figure.
 */
export function OrderLines({
  imageUrls,
}: {
  /** Storage path to URL, built on the server. */
  imageUrls: Record<string, string>;
}) {
  const { cart, ready, removeItem } = useCart();
  const preview = cartPreview(cart);

  if (!ready) {
    return <p className="text-muted">Reading your order&hellip;</p>;
  }

  if (cart.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-card bg-surface p-6 text-muted ring-1 ring-line/60">
          There is nothing in your order yet.
        </p>
        <Link href="/shop" className={`text-accent underline ${TAP_AREA}`}>
          Choose something <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-4">
        {cart.map((item) => {
          const image =
            (item.designImagePath ? imageUrls[item.designImagePath] : null) ??
            (item.imagePath ? imageUrls[item.imagePath] : null);
          const sizes =
            item.roster.length > 0 ? sizesFromRoster(item.roster) : item.sizes;
          const summary = sizeSummary(sizes);
          const line =
            item.pricingMode === "fixed" && item.unitPriceCentavos !== null
              ? formatPesos(item.unitPriceCentavos * item.qty)
              : "To be quoted";

          return (
            <li
              key={item.key}
              className="flex flex-wrap gap-4 rounded-card bg-surface p-4 ring-1 ring-line/60"
            >
              <div className="size-20 shrink-0 overflow-hidden rounded-control bg-tile">
                {image ? (
                  <Image
                    src={image}
                    alt=""
                    width={160}
                    height={160}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              <div className="min-w-40 flex-1 space-y-1 text-sm">
                <p className="font-semibold tracking-tight">{item.productName}</p>
                {item.variantLabel ? (
                  <p className="text-muted">{item.variantLabel}</p>
                ) : null}
                {Object.entries(item.options).length > 0 ? (
                  <p className="text-muted">
                    {Object.entries(item.options)
                      .map(([name, value]) => `${name}: ${value}`)
                      .join(" · ")}
                  </p>
                ) : null}
                {item.designCode ? (
                  <p className="text-muted">
                    Design {item.designCode}
                    {item.designName ? ` ${item.designName}` : ""}
                    {item.teamColors ? ` · ${item.teamColors}` : ""}
                  </p>
                ) : null}
                {summary ? <p className="text-muted">{summary}</p> : null}
                {item.file ? (
                  <p className="text-muted">
                    <span aria-hidden="true">{"📎"}</span> {item.file.originalName}
                  </p>
                ) : null}
                {item.notes ? <p className="text-muted">{item.notes}</p> : null}
                <p>
                  {item.qty} piece{item.qty === 1 ? "" : "s"} &middot;{" "}
                  <strong>{line}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeItem(item.key)}
                className={`self-start text-sm text-accent underline ${TAP_AREA}`}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1 rounded-card bg-surface p-5 text-sm ring-1 ring-line/60">
        <p className="flex justify-between">
          <span>Pieces</span>
          <span>{preview.pieces}</span>
        </p>
        <p className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>
            {preview.hasQuoteItems
              ? preview.fixedTotalCentavos === 0
                ? "To be quoted"
                : `${formatPesos(preview.fixedTotalCentavos)} + quote`
              : formatPesos(preview.fixedTotalCentavos)}
          </span>
        </p>
        {preview.hasQuoteItems ? (
          <p className="text-muted">
            We send the price for the rest on Messenger before anything is
            printed.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/shop/order/details"
          className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface"
        >
          Continue to your details
        </Link>
        <Link href="/shop" className={`text-sm text-accent underline ${TAP_AREA}`}>
          Add another product <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>
    </div>
  );
}
