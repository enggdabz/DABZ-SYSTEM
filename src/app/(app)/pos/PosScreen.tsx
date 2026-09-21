"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Input, Notice, Select, TAP_AREA } from "@/components/ui";
import type { DivisionId } from "@/lib/divisions";
import { centavosToDecimalString, formatPesos, parsePesos } from "@/lib/money";
import {
  CUSTOM_TARPAULIN_RATE,
  DEFAULT_TARPAULIN_RATE,
  PosError,
  TARPAULIN_RATES,
  computeSale,
  parseTarpaulinRate,
  quoteTarpaulin,
  unitPriceFor,
  type PriceTier,
  type SaleLineInput,
} from "@/lib/pos";

import {
  completeSaleAction,
  saveCustomerAction,
  saveProductAction,
  type PosState,
} from "./actions";

export interface PosProduct {
  id: string;
  name: string;
  division: DivisionId;
  priceCentavos: number | null;
  manualPrice: boolean;
  unit: string | null;
  section: string;
  incomeCategory: string;
  tiers: (PriceTier & { id?: string })[];
}

export interface PosCustomer {
  id: string;
  name: string;
  contactNumber: string | null;
}

interface CartLine extends SaleLineInput {
  key: string;
  incomeCategory: string;
}

const SECTION_LABELS: Record<string, string> = {
  printing: "Printing",
  photocopy: "Photocopy",
  souvenirs: "Mugs & souvenirs",
  other: "Saved products",
};

/**
 * The counter screen (spec 6, 7).
 *
 * Two rules from the specification shape it:
 *   1. A sale ALWAYS starts blank. Nothing is added by tapping a button alone -
 *      the quantity (and the price, where it is not fixed) is confirmed first.
 *   2. Every figure is worked out by src/lib/pos.ts, the same tested code the
 *      server re-runs when the sale is completed. The screen never invents a
 *      total of its own.
 */
export function PosScreen({
  products,
  customers,
  canDiscount,
  discountLimitPercent,
  discountLimitCentavos,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  canDiscount: boolean;
  discountLimitPercent: number;
  discountLimitCentavos: number;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState<PosState, FormData>(
    completeSaleAction,
    {},
  );

  const [lines, setLines] = useState<CartLine[]>([]);
  const [pendingProduct, setPendingProduct] = useState<PosProduct | null>(null);
  const [discountKind, setDiscountKind] = useState<"none" | "amount" | "percent">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [moneyGiven, setMoneyGiven] = useState("");
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  /*
    `useActionState` holds its result until the NEXT submit, so nothing the
    screen does - a refresh included - takes the completed sale away by itself.
    Remembering which sale has been acknowledged is what lets "Start the next
    sale" get back to a blank counter.
  */
  const [finishedSaleId, setFinishedSaleId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const discount =
      discountKind === "none" || discountValue.trim() === ""
        ? ({ kind: "none" } as const)
        : discountKind === "percent"
          ? ({ kind: "percent", percent: Number(discountValue) || 0 } as const)
          : (() => {
              try {
                return { kind: "amount", centavos: parsePesos(discountValue) } as const;
              } catch {
                return { kind: "none" } as const;
              }
            })();

    try {
      return computeSale({ lines, discount });
    } catch {
      return computeSale({ lines });
    }
  }, [lines, discountKind, discountValue]);

  const changeCentavos = useMemo(() => {
    if (paymentMethod !== "cash" || moneyGiven.trim() === "") return null;
    try {
      const given = parsePesos(moneyGiven);
      return given - totals.totalCentavos;
    } catch {
      return null;
    }
  }, [moneyGiven, paymentMethod, totals.totalCentavos]);

  const bySection = useMemo(() => {
    const groups = new Map<string, PosProduct[]>();
    for (const product of products) {
      const list = groups.get(product.section) ?? [];
      list.push(product);
      groups.set(product.section, list);
    }
    return groups;
  }, [products]);

  function addLine(line: Omit<CartLine, "key">) {
    setLines((current) => [...current, { ...line, key: crypto.randomUUID() }]);
  }

  function clearSale() {
    setLines([]);
    setPendingProduct(null);
    setDiscountKind("none");
    setDiscountValue("");
    setMoneyGiven("");
    setCustomerId("");
    setPaymentMethod("cash");
  }

  // Back to a blank counter (spec 6): the last customer's items go, and the
  // refresh picks up anything the sale changed on the server - stock levels,
  // a product added mid-sale.
  function startNextSale(saleId: string) {
    clearSale();
    setFinishedSaleId(saleId);
    router.refresh();
  }

  // Once the sale is saved the screen clears itself and offers the receipt
  // (spec 6), rather than leaving the last customer's items on screen.
  if (state.completed && state.completed.saleId !== finishedSaleId) {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-10 text-center">
        <p className="text-sm font-medium text-muted">Sale complete</p>
        <p className="text-5xl font-semibold tracking-tight">
          {state.completed.saleNumber}
        </p>
        {state.completed.changeCentavos > 0 ? (
          <div className="rounded-card bg-surface p-6 ring-1 ring-line/60">
            <p className="text-sm text-muted">Change</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              {formatPesos(state.completed.changeCentavos)}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            type="button"
            onClick={() => router.push(`/sales/${state.completed!.saleId}/receipt`)}
          >
            Print the receipt
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => startNextSale(state.completed!.saleId)}
          >
            Start the next sale
          </Button>
        </div>
      </div>
    );
  }

  return (
    /*
      Side by side from `lg` up (desktop and tablet landscape). Below that -
      tablet portrait and phones - the sale panel drops underneath the buttons,
      and a fixed bar keeps the total and the pay button reachable without
      scrolling back down. The bottom padding stops that bar covering the last
      row of buttons.
    */
    <div className="grid gap-6 pb-24 lg:grid-cols-[1fr_22rem] lg:pb-0">
      <div className="space-y-6">
        {[...bySection.entries()].map(([section, items]) => (
          <section key={section}>
            <h2 className="text-sm font-medium text-muted">
              {SECTION_LABELS[section] ?? section}
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setPendingProduct(product)}
                  className="rounded-control bg-surface px-4 py-3 text-left ring-1 ring-line/60 transition-colors hover:ring-accent/50"
                >
                  <span className="block text-sm font-medium">{product.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {product.priceCentavos === null
                      ? "Price asked each time"
                      : `${formatPesos(product.priceCentavos)}${product.unit ? ` / ${product.unit}` : ""}`}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowNewProduct(true)}>
            + New product
          </Button>
        </div>

        <TarpaulinCalculator
          onAdd={(line) =>
            addLine({
              ...line,
              division: "printshoppe",
              incomeCategory: "tarpaulin",
              productId: null,
            })
          }
        />
      </div>

      {/* The sale itself. */}
      <aside id="this-sale" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-surface p-5 shadow-sm ring-1 ring-line/60">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold tracking-tight">This sale</h2>
            {lines.length > 0 ? (
              <button
                type="button"
                onClick={clearSale}
                className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
              >
                Clear sale
              </button>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nothing added yet. Tap a button to start.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line/60">
              {totals.lines.map((line, index) => (
                <li key={lines[index].key} className="flex gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted">
                      {line.quantity} &times; {formatPesos(line.unitPriceCentavos)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatPesos(line.lineTotalCentavos)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((entry) => entry.key !== lines[index].key),
                        )
                      }
                      className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 space-y-1.5 border-t border-line/60 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPesos(totals.subtotalCentavos)}</dd>
            </div>
            {totals.discountCentavos > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd>&minus;{formatPesos(totals.discountCentavos)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-line/60 pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-2xl font-semibold tracking-tight">
                {formatPesos(totals.totalCentavos)}
              </dd>
            </div>
          </dl>
        </div>

        <form action={submit} className="space-y-4">
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="discountKind" value={discountKind} />
          <input type="hidden" name="discountValue" value={discountValue} />

          {canDiscount ? (
            <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
              <p className="text-sm font-medium">Discount</p>
              <div className="mt-2 flex gap-1 rounded-full bg-ink/5 p-1">
                {(["none", "amount", "percent"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDiscountKind(kind)}
                    className={`flex-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      discountKind === kind ? "bg-surface shadow-sm" : "text-muted"
                    }`}
                  >
                    {kind === "none" ? "None" : kind === "amount" ? "₱" : "%"}
                  </button>
                ))}
              </div>
              {discountKind !== "none" ? (
                <div className="mt-3">
                  <Input
                    inputMode="decimal"
                    value={discountValue}
                    onChange={(event) => setDiscountValue(event.target.value)}
                    placeholder={discountKind === "percent" ? "e.g. 10" : "e.g. 50"}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Your limit is {discountLimitPercent}% or{" "}
                    {formatPesos(discountLimitCentavos)}, whichever comes first.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
            <Field label="Paying with">
              <Select
                name="paymentMethod"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
                <option value="bank">Bank</option>
              </Select>
            </Field>

            {paymentMethod === "cash" ? (
              <div className="mt-4">
                <Field label="Money given" error={state.fieldErrors?.moneyGiven}>
                  <Input
                    name="moneyGiven"
                    inputMode="decimal"
                    value={moneyGiven}
                    onChange={(event) => setMoneyGiven(event.target.value)}
                    placeholder="e.g. 500"
                  />
                </Field>
                {changeCentavos !== null ? (
                  <div className="mt-3 rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
                    <p className="text-xs text-muted">Change</p>
                    <p
                      className={`mt-0.5 text-2xl font-semibold tracking-tight ${
                        changeCentavos < 0 ? "text-attention" : ""
                      }`}
                    >
                      {changeCentavos < 0 ? (
                        <>
                          <span aria-hidden="true">{"⚠"} </span>
                          {formatPesos(Math.abs(changeCentavos))} short
                        </>
                      ) : (
                        formatPesos(changeCentavos)
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4">
                <Field label="Reference number" hint="From the payment app or slip.">
                  <Input name="referenceNumber" placeholder="e.g. 0012345678" />
                </Field>
              </div>
            )}
          </div>

          <div className="rounded-card bg-surface p-5 ring-1 ring-line/60">
            <p className="text-sm font-medium">Customer</p>
            <p className="mt-1 text-sm text-muted">
              {customerId
                ? customers.find((entry) => entry.id === customerId)?.name
                : "Walk-in (no customer)"}
            </p>
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={() => setShowCustomer(true)}>
                {customerId ? "Change customer" : "Add a customer"}
              </Button>
            </div>
          </div>

          {state.error ? <Notice tone="attention" title={state.error} /> : null}
          {state.fieldErrors?.discount ? (
            <Notice tone="attention" title={state.fieldErrors.discount} />
          ) : null}

          <Button
            type="submit"
            className="w-full py-3 text-base"
            disabled={pending || lines.length === 0}
          >
            {pending ? "Saving…" : "Complete sale & print"}
          </Button>
        </form>
      </aside>

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted">
                {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
              </p>
              <p className="text-xl font-semibold tracking-tight">
                {formatPesos(totals.totalCentavos)}
              </p>
            </div>
            <a
              href="#this-sale"
              className="rounded-control bg-accent px-5 py-2.5 text-sm font-medium text-on-accent"
            >
              Review &amp; pay
            </a>
          </div>
        </div>
      ) : null}

      {pendingProduct ? (
        <AddItemDialog
          product={pendingProduct}
          onCancel={() => setPendingProduct(null)}
          onAdd={(line) => {
            addLine(line);
            setPendingProduct(null);
          }}
        />
      ) : null}

      {showCustomer ? (
        <CustomerDialog
          customers={customers}
          onClose={() => setShowCustomer(false)}
          onChoose={(id) => {
            setCustomerId(id);
            setShowCustomer(false);
          }}
        />
      ) : null}

      {showNewProduct ? (
        <NewProductDialog
          onCancel={() => setShowNewProduct(false)}
          onAdd={(line) => {
            addLine(line);
            setShowNewProduct(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Dialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-card bg-surface p-6 shadow-lg ring-1 ring-line/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`text-sm text-muted underline hover:text-ink ${TAP_AREA}`}
          >
            Close
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Spec 6: nothing is added until the quantity - and the price, where it is not
 * fixed - is confirmed. This is that confirmation.
 */
function AddItemDialog({
  product,
  onAdd,
  onCancel,
}: {
  product: PosProduct;
  onAdd: (line: Omit<CartLine, "key">) => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState(
    product.priceCentavos === null ? "" : centavosToDecimalString(product.priceCentavos),
  );
  const [error, setError] = useState<string | null>(null);

  const quantityNumber = Number(quantity);
  // Bulk pricing, if the owner has set any rules for this product.
  const suggested = useMemo(() => {
    if (product.priceCentavos === null || !Number.isInteger(quantityNumber)) return null;
    try {
      const unit = unitPriceFor(product.priceCentavos, quantityNumber, product.tiers);
      return unit === product.priceCentavos ? null : unit;
    } catch {
      return null;
    }
  }, [product, quantityNumber]);

  function confirm() {
    setError(null);

    if (!Number.isInteger(quantityNumber) || quantityNumber < 1) {
      setError("Enter a whole quantity of 1 or more.");
      return;
    }

    let unitPriceCentavos: number;
    try {
      unitPriceCentavos = parsePesos(price);
    } catch {
      setError("Enter a price like 25 or 25.50.");
      return;
    }

    onAdd({
      name: product.name,
      quantity: quantityNumber,
      unitPriceCentavos,
      division: product.division,
      productId: product.id,
      incomeCategory: product.incomeCategory,
    });
  }

  return (
    <Dialog
      title={product.name}
      description={
        product.priceCentavos === null
          ? "This one has no set price yet, so type what you are charging."
          : undefined
      }
      onClose={onCancel}
    >
      <div className="space-y-4">
        <Field label={`Quantity${product.unit ? ` (${product.unit})` : ""}`}>
          <Input
            type="number"
            min={1}
            value={quantity}
            autoFocus
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>

        <Field label="Price each">
          <Input
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>

        {suggested !== null ? (
          <Notice tone="info" title={`Bulk price: ${formatPesos(suggested)} each`}>
            <p>
              <button
                type="button"
                className={`underline ${TAP_AREA}`}
                onClick={() => setPrice(centavosToDecimalString(suggested))}
              >
                Use the bulk price
              </button>
            </p>
          </Notice>
        ) : null}

        {error ? <Notice tone="attention" title={error} /> : null}

        <div className="flex gap-2">
          <Button type="button" onClick={confirm}>
            Add to sale
          </Button>
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Spec 7.3: always beside the counter, and useful for a quote alone. */
function TarpaulinCalculator({
  onAdd,
}: {
  onAdd: (line: { name: string; quantity: number; unitPriceCentavos: number }) => void;
}) {
  const [width, setWidth] = useState("3");
  const [height, setHeight] = useState("5");
  const [choice, setChoice] = useState(String(DEFAULT_TARPAULIN_RATE));
  const [typedRate, setTypedRate] = useState("");

  const custom = choice === CUSTOM_TARPAULIN_RATE;

  /*
    The typed rate is read by `parseTarpaulinRate`, not by `Number()`: a rate is
    money, and money in this system is only ever parsed in one place.
  */
  const rate = useMemo<{ centavos: number | null; error: string | null }>(() => {
    if (!custom) return { centavos: Number(choice), error: null };
    try {
      return { centavos: parseTarpaulinRate(typedRate), error: null };
    } catch (thrown) {
      return {
        centavos: null,
        error: thrown instanceof PosError ? thrown.message : "That is not a peso amount.",
      };
    }
  }, [custom, choice, typedRate]);

  // An empty box is not a mistake - it is a box that has only just been opened -
  // so the warning under the Field waits until something has been typed into it.
  const rateError = typedRate.trim() === "" ? undefined : (rate.error ?? undefined);

  const quote = useMemo(() => {
    if (rate.centavos === null) return null;
    try {
      return quoteTarpaulin({
        widthFeet: Number(width),
        heightFeet: Number(height),
        ratePerSquareFootCentavos: rate.centavos,
      });
    } catch {
      return null;
    }
  }, [width, height, rate.centavos]);

  return (
    <section className="rounded-card bg-surface p-5 ring-1 ring-line/60">
      <h2 className="font-semibold tracking-tight">Tarpaulin</h2>
      <p className="mt-1 text-sm text-muted">
        Works out the price. Use it to quote a customer without adding anything.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Width (ft)">
          <Input
            inputMode="decimal"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
        </Field>
        <Field label="Height (ft)">
          <Input
            inputMode="decimal"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </Field>
        {/*
          The typed rate sits in the SAME grid cell as the picker rather than
          becoming a fourth column, so it stays directly under the thing it
          belongs to at every width - beside it on a phone, under it on a tablet.
        */}
        <div className="space-y-3">
          <Field label="Rate per sq ft">
            <Select value={choice} onChange={(event) => setChoice(event.target.value)}>
              {TARPAULIN_RATES.map((option) => (
                <option key={option} value={option}>
                  {formatPesos(option)}
                </option>
              ))}
              <option value={CUSTOM_TARPAULIN_RATE}>Custom amount</option>
            </Select>
          </Field>
          {custom ? (
            <Field label="Amount per sq ft" hint="In pesos" error={rateError}>
              <Input
                autoFocus
                inputMode="decimal"
                // A format, not a suggestion: what a square foot is worth is
                // the owner's to say, so no figure is put in this box.
                placeholder="0.00"
                value={typedRate}
                onChange={(event) => setTypedRate(event.target.value)}
              />
            </Field>
          ) : null}
        </div>
      </div>

      {quote ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-sunken p-4 ring-1 ring-line/60">
          <div>
            <p className="text-xs text-muted">
              {quote.areaSquareFeet.toFixed(2)} sq ft
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {formatPesos(quote.totalCentavos)}
            </p>
          </div>
          <Button
            type="button"
            onClick={() =>
              onAdd({
                name: quote.description,
                quantity: 1,
                unitPriceCentavos: quote.totalCentavos,
              })
            }
          >
            Add to sale
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-attention">
          <span aria-hidden="true">{"⚠"} </span>
          {rate.centavos === null
            ? "Enter the amount per sq ft."
            : "Enter a width and height in feet."}
        </p>
      )}
    </section>
  );
}

/** Spec 7.2, including the "save this to my product list" tick. */
function NewProductDialog({
  onAdd,
  onCancel,
}: {
  onAdd: (line: Omit<CartLine, "key">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingProduct, startSaving] = useTransition();

  function confirm() {
    setError(null);
    const quantityNumber = Number(quantity);

    if (name.trim() === "") {
      setError("Give the product a name.");
      return;
    }
    if (!Number.isInteger(quantityNumber) || quantityNumber < 1) {
      setError("Enter a whole quantity of 1 or more.");
      return;
    }

    let unitPriceCentavos: number;
    try {
      unitPriceCentavos = parsePesos(price);
    } catch {
      setError("Enter a price like 25 or 25.50.");
      return;
    }

    /*
      Saving it to the product list is a SEPARATE step from adding it to this
      sale (spec 7.2). It is deliberately fire-and-forget: if the list cannot be
      added to, the customer standing at the counter still gets their sale.
    */
    if (save) {
      const form = new FormData();
      form.set("name", name.trim());
      form.set("price", price);
      form.set("division", "printshoppe");
      startSaving(() => {
        void saveProductAction({}, form);
      });
    }

    onAdd({
      name: name.trim(),
      quantity: quantityNumber,
      unitPriceCentavos,
      division: "printshoppe",
      productId: null,
      incomeCategory: "other_print_jobs",
    });
  }

  return (
    <Dialog
      title="New product"
      description="For something that is not on a button yet."
      onClose={onCancel}
    >
      <div className="space-y-4">
        <Field label="Product name">
          <Input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price each">
            <Input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Field>
          <Field label="Quantity">
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={save}
            onChange={(event) => setSave(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Save this product to my product list
            <span className="block text-muted">
              It becomes a button for next time. The owner can rename or remove
              it later.
            </span>
          </span>
        </label>

        {error ? <Notice tone="attention" title={error} /> : null}

        <div className="flex gap-2">
          <Button type="button" onClick={confirm} disabled={savingProduct}>
            Add to sale
          </Button>
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The customer pop-up from spec 5, including "skip - walk-in". */
function CustomerDialog({
  customers,
  onChoose,
  onClose,
}: {
  customers: PosCustomer[];
  onChoose: (customerId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [state, submit, pending] = useActionState(saveCustomerAction, {});

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return customers.slice(0, 8);
    return customers
      .filter(
        (customer) =>
          customer.name.toLowerCase().includes(needle) ||
          (customer.contactNumber ?? "").includes(needle),
      )
      .slice(0, 8);
  }, [customers, search]);

  // A new customer was just saved, so use them for this sale. Doing this during
  // render would be calling a parent's setState mid-render, which React forbids
  // - so it waits for the click on the name that now appears in the list above.
  const justSaved = state.customerId
    ? customers.find((entry) => entry.id === state.customerId)
    : undefined;

  return (
    <Dialog title="Customer" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Search by name or number">
          <Input
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Start typing…"
          />
        </Field>

        {matches.length > 0 ? (
          <ul className="divide-y divide-line/60">
            {matches.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => onChoose(customer.id)}
                  className="w-full py-2.5 text-left text-sm hover:text-accent"
                >
                  <span className="font-medium">{customer.name}</span>
                  {customer.contactNumber ? (
                    <span className="block text-xs text-muted">
                      {customer.contactNumber}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No customer found by that name.</p>
        )}

        <details className="border-t border-line/60 pt-4">
          <summary className="cursor-pointer text-sm text-muted hover:text-ink">
            Add a new customer
          </summary>
          <form action={submit} className="mt-4 space-y-3">
            <Field label="Name, team or company">
              <Input name="name" required />
            </Field>
            <Field label="Contact number">
              <Input name="contactNumber" />
            </Field>
            <Field label="Facebook / Messenger name">
              <Input name="facebookName" />
            </Field>
            {state.error ? <Notice tone="attention" title={state.error} /> : null}
            {state.customerId ? (
              <Notice tone="success" title="Customer saved">
                <p>
                  <button
                    type="button"
                    className={`underline ${TAP_AREA}`}
                    onClick={() => onChoose(state.customerId!)}
                  >
                    Use {justSaved?.name ?? "them"} for this sale
                  </button>
                </p>
              </Notice>
            ) : null}
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Saving…" : "Save customer"}
            </Button>
          </form>
        </details>

        <div className="border-t border-line/60 pt-4">
          <Button type="button" variant="quiet" onClick={() => onChoose("")}>
            Skip &mdash; walk-in
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
