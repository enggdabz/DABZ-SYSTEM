"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TAP_AREA } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import { newCartKey, type CartFile, type CartItem } from "@/lib/online/cart";
import {
  checkOptions,
  checkQuantity,
  cleanRosterEntry,
  pieceCount,
  quantityShape,
  sizeSummary,
  sizesFromRoster,
  type CleanRosterEntry,
} from "@/lib/online/items";
import { SIZES, type Design, type Product, type Size } from "@/lib/online/types";
import { useCart } from "@/lib/online/useCart";

import { FileAttachment } from "./FileAttachment";

/**
 * The product page's working half (docs/spec.md 8.2).
 *
 * The rule it is built around, said once here and enforced three more times
 * behind it: THE QUANTITY IS NEVER TYPED TWICE. A roster of names IS the
 * pieces; a tally of sizes IS the pieces; only a product that asks for
 * neither has a number to type. Everything below - the counter, the running
 * price, the minimum warning - reads the one derived figure.
 *
 * The prices shown are a PREVIEW. Nothing here is trusted by the order: the
 * cart carries ids and choices, and `create_online_order` reads the price out
 * of the database when the order is placed.
 */

interface RosterRow extends CleanRosterEntry {
  id: number;
  /** What is in the boxes, before it is tidied. */
  typedName: string;
  typedNumber: string;
}

let nextRowId = 1;

function blankRow(): RosterRow {
  return {
    id: nextRowId++,
    typedName: "",
    typedNumber: "",
    playerName: null,
    playerNumber: null,
    size: "M",
  };
}

export function ProductOrderForm({
  product,
  designs,
  productImages,
  designImages,
}: {
  product: Product;
  designs: Design[];
  /** Built on the server, which is the only side that knows the storage host. */
  productImages: string[];
  designImages: Record<string, string | null>;
}) {
  const { cart, ready, addItem } = useCart();
  const shape = quantityShape(product);

  const [variantId, setVariantId] = useState(product.prices[0]?.id ?? null);
  const [options, setOptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.options.map((option) => [option.name, option.choices[0] ?? ""]),
    ),
  );
  const [designId, setDesignId] = useState<string | null>(null);
  const [teamColors, setTeamColors] = useState("");
  const [roster, setRoster] = useState<RosterRow[]>(() =>
    shape === "roster"
      ? Array.from({ length: Math.max(1, product.minOrderQty) }, blankRow)
      : [],
  );
  const [sizes, setSizes] = useState<Partial<Record<Size, number>>>({});
  const [qty, setQty] = useState(product.minOrderQty);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<CartFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const variant = product.prices.find((price) => price.id === variantId) ?? null;
  const design = designs.find((candidate) => candidate.id === designId) ?? null;

  const pieces = useMemo(
    () => pieceCount(product, { roster, sizes, qty }),
    [product, roster, sizes, qty],
  );

  const shownSizes = shape === "roster" ? sizesFromRoster(roster) : sizes;
  const summary = sizeSummary(shownSizes);

  const running =
    product.pricingMode === "fixed" && variant ? variant.priceCentavos * pieces : null;

  const shortBy = pieces > 0 && pieces < product.minOrderQty;

  const heroImage = design
    ? (designImages[design.id] ?? productImages[0] ?? null)
    : (productImages[0] ?? null);

  function add() {
    setAdded(false);

    const quantity = checkQuantity(product, pieces);
    if (!quantity.ok) {
      setProblem(quantity.error);
      return;
    }

    const chosen = checkOptions(product, options);
    if (!chosen.ok) {
      setProblem(chosen.error);
      return;
    }

    if (product.pricingMode === "fixed" && variant === null) {
      setProblem("Pick which one you want first.");
      return;
    }

    // Tidied one more time on the way in, so nothing but clean rows is stored
    // and the database is not the first thing to notice a bad one.
    const cleanRoster: CleanRosterEntry[] = [];
    for (const row of roster) {
      const cleaned = cleanRosterEntry({
        playerName: row.typedName,
        playerNumber: row.typedNumber,
        size: row.size,
      });
      if (!cleaned.ok) {
        setProblem(cleaned.error);
        return;
      }
      cleanRoster.push(cleaned.entry);
    }

    const item: CartItem = {
      key: newCartKey(),
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      categoryName: product.categoryName,
      pricingMode: product.pricingMode,
      variantLabel: variant?.label ?? null,
      unitPriceCentavos: variant?.priceCentavos ?? null,
      options: chosen.options,
      qty: pieces,
      sizes: shape === "sizes" ? sizes : {},
      roster: shape === "roster" ? cleanRoster : [],
      designId: design?.id ?? null,
      designCode: design?.code ?? null,
      designName: design?.name ?? null,
      designImagePath: design?.imagePath ?? null,
      teamColors: design ? teamColors.trim() || null : null,
      notes: notes.trim() || null,
      file,
      imagePath: product.images[0]?.storagePath ?? null,
    };

    addItem(item);
    setProblem(null);
    setAdded(true);
  }

  return (
    <div className="space-y-8">
      <div className="aspect-square overflow-hidden rounded-card bg-tile">
        {heroImage ? (
          <Image
            src={heroImage}
            alt={design ? `${design.code} ${design.name}` : product.name}
            width={900}
            height={900}
            className="h-full w-full object-cover"
            priority
          />
        ) : null}
      </div>

      <div className="space-y-2">
        {product.pricingMode === "fixed" ? (
          <p className="text-2xl font-semibold tracking-tight">
            {variant ? formatPesos(variant.priceCentavos) : "—"}
            <span className="text-base font-normal text-muted"> each</span>
          </p>
        ) : (
          <>
            <p className="text-2xl font-semibold tracking-tight">Price on quote</p>
            <p className="text-sm text-muted">
              We check your design and quantity, then send the price on Messenger
              before anything is printed.
            </p>
          </>
        )}

        {product.description ? <p className="text-muted">{product.description}</p> : null}

        <p className="text-sm text-muted">
          Minimum order {product.minOrderQty} pcs &middot; normally ready in about{" "}
          {product.leadTimeDays} days
        </p>
      </div>

      {product.pricingMode === "fixed" && product.prices.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Choose one</legend>
          <div className="flex flex-wrap gap-2">
            {product.prices.map((price) => (
              <Box
                key={price.id}
                selected={price.id === variantId}
                onClick={() => setVariantId(price.id)}
                label={`${price.label} · ${formatPesos(price.priceCentavos)}`}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {product.options.map((option) => (
        <fieldset key={option.id} className="space-y-3">
          <legend className="text-sm font-medium">{option.name}</legend>
          <div className="flex flex-wrap gap-2">
            {option.choices.map((choice) => (
              <Box
                key={choice}
                selected={options[option.name] === choice}
                onClick={() =>
                  setOptions((current) => ({ ...current, [option.name]: choice }))
                }
                label={choice}
              />
            ))}
          </div>
        </fieldset>
      ))}

      {product.usesDesignGallery && designs.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Choose a design</legend>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <li>
              <button
                type="button"
                onClick={() => setDesignId(null)}
                aria-pressed={designId === null}
                className={`flex h-full w-full flex-col items-start gap-2 rounded-control p-3 text-left text-sm ${
                  designId === null
                    ? "outline outline-2 outline-ink"
                    : "ring-1 ring-line"
                }`}
              >
                <span className="flex aspect-square w-full items-center justify-center rounded-control bg-tile text-xs text-muted">
                  Your own
                </span>
                <span>My own design, upload it below</span>
              </button>
            </li>

            {designs.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setDesignId(candidate.id)}
                  aria-pressed={designId === candidate.id}
                  className={`flex h-full w-full flex-col items-start gap-2 rounded-control p-3 text-left text-sm ${
                    designId === candidate.id
                      ? "outline outline-2 outline-ink"
                      : "ring-1 ring-line"
                  }`}
                >
                  <span className="aspect-square w-full overflow-hidden rounded-control bg-tile">
                    {designImages[candidate.id] ? (
                      <Image
                        src={designImages[candidate.id] as string}
                        alt=""
                        width={300}
                        height={300}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="text-xs text-muted">{candidate.code}</span>
                  <span>{candidate.name}</span>
                </button>
              </li>
            ))}
          </ul>

          {design ? (
            <label className="block">
              <span className="text-sm font-medium">Your team colors</span>
              <span className="mt-0.5 block text-xs text-muted">
                We recolor the design for you. Example: black body, red accents,
                white numbers.
              </span>
              <input
                value={teamColors}
                onChange={(event) => setTeamColors(event.target.value)}
                maxLength={120}
                className="mt-1.5 w-full rounded-control bg-surface-sunken px-3 py-2 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      {shape === "roster" ? (
        <RosterTable roster={roster} setRoster={setRoster} />
      ) : shape === "sizes" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">How many of each size</legend>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            {SIZES.map((size) => (
              <label key={size} className="text-sm">
                <span className="block text-center font-medium">{size}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={sizes[size] ?? ""}
                  onChange={(event) => {
                    const count = Number(event.target.value);
                    setSizes((current) => {
                      const next = { ...current };
                      if (!Number.isInteger(count) || count <= 0) delete next[size];
                      else next[size] = count;
                      return next;
                    });
                  }}
                  className="mt-1 w-full rounded-control bg-surface-sunken px-2 py-2 text-center text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
                />
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="block max-w-40">
          <span className="text-sm font-medium">How many</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={qty}
            onChange={(event) => setQty(Number(event.target.value))}
            className="mt-1.5 w-full rounded-control bg-surface-sunken px-3 py-2 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
          />
        </label>
      )}

      <div className="space-y-1 rounded-card bg-seg px-4 py-3 text-sm">
        <p>
          <strong>
            {pieces} piece{pieces === 1 ? "" : "s"}
          </strong>
          {running !== null ? ` · ${formatPesos(running)}` : ""}
        </p>
        {summary ? <p className="text-muted">{summary}</p> : null}
        {shortBy ? (
          <p className="flex items-start gap-1.5 text-accent">
            <span aria-hidden="true">{"⚠"}</span>
            <span>The minimum is {product.minOrderQty} pieces.</span>
          </p>
        ) : null}
      </div>

      <FileAttachment
        label={
          design
            ? "Upload your team logo or sponsor logos (optional)"
            : "Upload your design, logo or reference photo"
        }
        file={file}
        onChange={setFile}
      />

      <label className="block">
        <span className="text-sm font-medium">Notes for this item</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          maxLength={300}
          className="mt-1.5 w-full rounded-control bg-surface-sunken px-3 py-2 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
        />
      </label>

      {problem ? (
        <p className="flex items-start gap-1.5 rounded-card bg-surface px-4 py-3 text-sm text-accent ring-1 ring-accent/30">
          <span aria-hidden="true">{"⚠"}</span>
          <span>{problem}</span>
        </p>
      ) : null}

      {added ? (
        <p className="rounded-card bg-gold px-4 py-3 text-sm font-medium text-on-gold">
          Added to your order.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface"
        >
          Add to order
        </button>
        <Link href="/shop/order" className={`text-sm text-accent underline ${TAP_AREA}`}>
          View order{ready && cart.length > 0 ? ` (${cart.length})` : ""}{" "}
          <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>
    </div>
  );
}

function Box({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-control px-4 py-2.5 text-sm ${
        selected ? "outline outline-2 outline-ink" : "ring-1 ring-line"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The team list.
 *
 * It starts with as many rows as the minimum order, so a customer who has
 * fifteen players does not have to press Add fifteen times before they can
 * see what it costs - and "Add 5 players" is there because a team is added in
 * handfuls, not one at a time.
 */
function RosterTable({
  roster,
  setRoster,
}: {
  roster: RosterRow[];
  setRoster: (update: (rows: RosterRow[]) => RosterRow[]) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Your team</legend>
      <p className="text-xs text-muted">
        One row per jersey. Leave a name blank if the team has not decided yet
        &mdash; the size is the part we cannot start without.
      </p>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-96 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Name on jersey</th>
              <th className="py-2 pr-2 font-medium">Number</th>
              <th className="py-2 pr-2 font-medium">Size</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {roster.map((row, index) => (
              <tr key={row.id} className="border-t border-line/60">
                <td className="py-2 pr-2 text-muted">{index + 1}</td>
                <td className="py-2 pr-2">
                  <input
                    value={row.typedName}
                    aria-label={`Name on jersey, row ${index + 1}`}
                    maxLength={20}
                    onChange={(event) =>
                      setRoster((rows) =>
                        rows.map((r) =>
                          r.id === row.id ? { ...r, typedName: event.target.value } : r,
                        ),
                      )
                    }
                    className="w-full rounded-control bg-surface-sunken px-2 py-1.5 text-sm uppercase ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    value={row.typedNumber}
                    aria-label={`Jersey number, row ${index + 1}`}
                    inputMode="numeric"
                    maxLength={3}
                    onChange={(event) =>
                      setRoster((rows) =>
                        rows.map((r) =>
                          r.id === row.id
                            ? { ...r, typedNumber: event.target.value }
                            : r,
                        ),
                      )
                    }
                    className="w-16 rounded-control bg-surface-sunken px-2 py-1.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={row.size}
                    aria-label={`Size, row ${index + 1}`}
                    onChange={(event) =>
                      setRoster((rows) =>
                        rows.map((r) =>
                          r.id === row.id
                            ? { ...r, size: event.target.value as Size }
                            : r,
                        ),
                      )
                    }
                    className="rounded-control bg-surface-sunken px-2 py-1.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/50"
                  >
                    {SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => setRoster((rows) => rows.filter((r) => r.id !== row.id))}
                    className={`text-sm text-accent underline ${TAP_AREA}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setRoster((rows) => [...rows, blankRow()])}
          className="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink"
        >
          Add player
        </button>
        <button
          type="button"
          onClick={() =>
            setRoster((rows) => [
              ...rows,
              ...Array.from({ length: 5 }, blankRow),
            ])
          }
          className="rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink"
        >
          Add 5 players
        </button>
      </div>
    </fieldset>
  );
}
