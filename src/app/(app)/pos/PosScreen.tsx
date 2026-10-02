"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Input, Notice, Select, TAP_AREA, HEADING_BOX } from "@/components/ui";
import { listSale } from "@/lib/counter-list";
import type { DivisionId } from "@/lib/divisions";
import { formatPesos, parsePesos } from "@/lib/money";
import {
  CUSTOM_TARPAULIN_RATE,
  DEFAULT_TARPAULIN_RATE,
  PosError,
  TARPAULIN_RATES,
  computeSale,
  parseTarpaulinRate,
  quoteTarpaulin,
  type PriceTier,
  type SaleLineInput,
} from "@/lib/pos";

import { completeSaleAction, saveCustomerAction, type PosState } from "./actions";
import {
  CounterProductList,
  ManageCategoriesDialog,
  NewCounterProductDialog,
} from "./CounterProductList";
import { useCounterProducts } from "./useCounterProducts";

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
  /** The product photo's public address, or null for the placeholder. */
  imageUrl: string | null;
  /** The owner's category (0027), or null for none. */
  categoryId: string | null;
}

export interface PosCategory {
  id: string;
  name: string;
}

export interface PosCustomer {
  id: string;
  name: string;
  contactNumber: string | null;
}

/** A line that is not a saved product - today, a tarpaulin from the calculator. */
interface ExtraLine extends SaleLineInput {
  key: string;
  incomeCategory: string;
}

/**
 * The counter screen (spec 6, 7).
 *
 * Two rules from the specification shape it:
 *   1. A sale ALWAYS starts blank. Every quantity box is empty, and nothing is
 *      recorded until "Complete sale" is pressed - typing a number into a row
 *      is the confirmation the old tap-then-confirm step used to be.
 *   2. Every figure is worked out by src/lib/counter-list.ts and
 *      src/lib/pos.ts, the same tested code the server re-runs when the sale
 *      is completed. The screen never invents a total of its own.
 */
export function PosScreen({
  products,
  customers,
  canDiscount,
  canManageProducts,
  categories = null,
  discountLimitPercent,
  discountLimitCentavos,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  canDiscount: boolean;
  /** Owner/Admin with 0026 applied: drag, photos and delete. */
  canManageProducts: boolean;
  /** The owner's categories (0027), by name. Null: the database has none yet. */
  categories?: PosCategory[] | null;
  discountLimitPercent: number;
  discountLimitCentavos: number;
}) {
  const router = useRouter();
  const [state, submit, pending] = useActionState<PosState, FormData>(
    completeSaleAction,
    {},
  );

  const list = useCounterProducts(products, categories);
  const [extraLines, setExtraLines] = useState<ExtraLine[]>([]);
  const [discountKind, setDiscountKind] = useState<"none" | "amount" | "percent">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [moneyGiven, setMoneyGiven] = useState("");
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  /*
    `useActionState` holds its result until the NEXT submit, so nothing the
    screen does - a refresh included - takes the completed sale away by itself.
    Remembering which sale has been acknowledged is what lets "Start the next
    sale" get back to a blank counter.
  */
  const [finishedSaleId, setFinishedSaleId] = useState<string | null>(null);

  // The rows with a quantity, in the order they are shown.
  const fromList = useMemo(
    () => listSale(list.items, list.quantities, list.prices),
    [list.items, list.quantities, list.prices],
  );

  const lines = useMemo(
    () => [
      ...fromList.lines,
      ...extraLines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPriceCentavos: line.unitPriceCentavos,
        division: line.division,
        productId: line.productId ?? null,
        incomeCategory: line.incomeCategory,
      })),
    ],
    [fromList.lines, extraLines],
  );

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

  const nothingChosen = lines.length === 0 && fromList.rowsWithQuantity === 0;
  const blocked = fromList.missingPrice.length > 0;

  function clearSale() {
    list.clearQuantities();
    setExtraLines([]);
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
      tablet portrait and phones - the payment panel drops underneath, and the
      total with the Complete sale button sticks to the bottom of the screen
      while the list is being scrolled, so it is always reachable.
    */
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <section aria-labelledby="saved-products">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="saved-products" className={`${HEADING_BOX} grow text-sm font-medium`}>
              Saved products
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {canManageProducts && list.items.length > 1 ? (
                <p className="text-xs text-muted">
                  Drag <span aria-hidden="true">⋮⋮</span> to put the best sellers at the top.
                </p>
              ) : null}
              {canManageProducts && list.categories !== null ? (
                <button
                  type="button"
                  onClick={() => setShowCategories(true)}
                  className={`text-xs font-medium text-ink underline hover:text-gold ${TAP_AREA}`}
                >
                  Manage categories
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3">
            <CounterProductList
              items={list.items}
              categories={list.categories}
              quantities={list.quantities}
              prices={list.prices}
              canManage={canManageProducts}
              onQuantity={list.setQuantity}
              onPrice={list.setPrice}
              onReorder={(activeId, overId, groupIds) =>
                void list.reorder(activeId, overId, groupIds)
              }
              onReorderCategories={(activeId, overId) =>
                void list.reorderCategories(activeId, overId)
              }
              onChangePhoto={(id, file) => void list.changePhoto(id, file)}
              onRemovePhoto={(id) => void list.removePhoto(id)}
              onDelete={(id) => void list.remove(id)}
              onEdit={list.edit}
              photoBusy={list.photoBusy}
              photoErrors={list.photoErrors}
              notice={list.notice}
              onDismissNotice={list.dismissNotice}
            />
          </div>

          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => setShowNewProduct(true)}>
              + New product
            </Button>
          </div>

          {/* Below the list: the total, Clear, and the one Complete sale button. */}
          <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-card sm:border-0 sm:ring-1 sm:ring-line/60">
            {state.error ? (
              <div className="mb-3">
                <Notice tone="attention" title={state.error} />
              </div>
            ) : null}
            {state.fieldErrors?.moneyGiven ? (
              <div className="mb-3">
                <Notice tone="attention" title={state.fieldErrors.moneyGiven} />
              </div>
            ) : null}
            {blocked ? (
              <p className="mb-3 flex items-start gap-1.5 text-sm text-attention">
                <span aria-hidden="true">{"⚠"}</span>
                <span>
                  Type the price for {fromList.missingPrice.join(", ")} before completing the sale.
                </span>
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">
                  {totals.itemCount === 0
                    ? "Nothing chosen yet"
                    : `${totals.itemCount} item${totals.itemCount === 1 ? "" : "s"}`}
                  {totals.discountCentavos > 0
                    ? ` · less ${formatPesos(totals.discountCentavos)} discount`
                    : ""}
                </p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatPesos(totals.totalCentavos)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="quiet"
                  onClick={clearSale}
                  disabled={nothingChosen || pending}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  form="counter-sale"
                  className="py-3 text-base"
                  disabled={pending || lines.length === 0 || blocked}
                >
                  {pending ? "Saving…" : "Complete sale"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <TarpaulinCalculator
          onAdd={(line) =>
            setExtraLines((current) => [
              ...current,
              {
                ...line,
                key: crypto.randomUUID(),
                division: "printshoppe",
                incomeCategory: "tarpaulin",
                productId: null,
              },
            ])
          }
        />
      </div>

      {/* How the sale is paid. The items themselves are the rows on the left. */}
      <aside id="this-sale" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-card bg-surface p-5 shadow-sm ring-1 ring-line/60">
          <h2 className={`${HEADING_BOX} font-semibold tracking-tight`}>This sale</h2>

          {totals.lines.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nothing chosen yet. Type a quantity beside a product to start.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line/60">
              {totals.lines.map((line, index) => {
                const extra =
                  index >= fromList.lines.length
                    ? extraLines[index - fromList.lines.length]
                    : undefined;
                return (
                  <li key={line.productId ?? extra?.key ?? index} className="flex gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted">
                        {line.quantity} &times; {formatPesos(line.unitPriceCentavos)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatPesos(line.lineTotalCentavos)}</p>
                      {extra ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExtraLines((current) =>
                              current.filter((entry) => entry.key !== extra.key),
                            )
                          }
                          className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
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

        <form id="counter-sale" action={submit} className="space-y-4">
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
              {state.fieldErrors?.discount ? (
                <div className="mt-3">
                  <Notice tone="attention" title={state.fieldErrors.discount} />
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
                <Field
                  label="Money given"
                  hint="Leave it empty when the customer pays the exact amount."
                  error={state.fieldErrors?.moneyGiven}
                >
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
        </form>
      </aside>

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

      <NewCounterProductDialog
        open={showNewProduct}
        existingNames={list.items.map((product) => product.name)}
        canAddPhoto={canManageProducts}
        categories={list.categories}
        onClose={() => setShowNewProduct(false)}
        onAdd={list.add}
      />

      {list.categories !== null ? (
        <ManageCategoriesDialog
          open={showCategories}
          categories={list.categories}
          countFor={(id) => list.items.filter((product) => product.categoryId === id).length}
          onClose={() => setShowCategories(false)}
          onSave={list.saveCategory}
          onDelete={list.deleteCategory}
          onMove={(activeId, overId) => void list.reorderCategories(activeId, overId)}
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
          <div className="grow">
            <h2 className={`${HEADING_BOX} text-lg font-semibold tracking-tight`}>{title}</h2>
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
      <h2 className={`${HEADING_BOX} font-semibold tracking-tight`}>Tarpaulin</h2>
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
