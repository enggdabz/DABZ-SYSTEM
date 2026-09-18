"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { completeSale, type CartLine } from "@/app/admin/sales/actions";
import { Alert, Button, Card, CardHeader, Field, fieldClass } from "@/components/ui";
import { emptyActionState } from "@/lib/action-state";
import { DIVISION_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type Division, type PaymentMethod } from "@/lib/domain";
import { formatCentavos, parsePesosToCentavos } from "@/lib/money";

export type PosProduct = {
  id: string;
  name: string;
  division: Division;
  price_centavos: number;
  manual_price: boolean;
  unit: string | null;
  income_category: string | null;
  tiers: { min_quantity: number; unit_price_centavos: number }[];
};

export type PosCustomer = { id: string; name: string };

/** The cheapest tier whose minimum quantity this line reaches. */
function priceFor(product: PosProduct, quantity: number): number {
  const tier = product.tiers
    .filter((t) => quantity >= t.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity)[0];
  return tier ? tier.unit_price_centavos : product.price_centavos;
}

type Line = CartLine & { key: string; manual: boolean };

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} className="w-full">
      {pending ? "Completing…" : "Complete sale"}
    </Button>
  );
}

export function Pos({
  products,
  customers,
  canDiscount,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  canDiscount: boolean;
}) {
  const [state, action] = useActionState(completeSale, emptyActionState);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [discountKind, setDiscountKind] = useState("none");
  const [discountText, setDiscountText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashText, setCashText] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? products.filter((p) => p.name.toLowerCase().includes(needle))
      : products;
  }, [products, search]);

  function addProduct(product: PosProduct) {
    setLines((current) => {
      const existing = current.find((l) => l.product_id === product.id && !l.manual);
      if (existing) {
        return current.map((l) =>
          l.key === existing.key
            ? {
                ...l,
                quantity: l.quantity + 1,
                unit_price_centavos: product.manual_price
                  ? l.unit_price_centavos
                  : priceFor(product, l.quantity + 1),
              }
            : l,
        );
      }
      return [
        ...current,
        {
          key: `${product.id}-${Date.now()}`,
          product_id: product.id,
          name: product.name,
          division: product.division,
          income_category: product.income_category ?? "other_print_jobs",
          quantity: 1,
          unit_price_centavos: priceFor(product, 1),
          manual: product.manual_price,
        },
      ];
    });
  }

  function setQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      setLines((c) => c.filter((l) => l.key !== key));
      return;
    }
    setLines((current) =>
      current.map((l) => {
        if (l.key !== key) return l;
        const product = products.find((p) => p.id === l.product_id);
        return {
          ...l,
          quantity,
          unit_price_centavos:
            product && !l.manual ? priceFor(product, quantity) : l.unit_price_centavos,
        };
      }),
    );
  }

  function setPrice(key: string, text: string) {
    const centavos = parsePesosToCentavos(text);
    if (centavos === null || centavos < 0) return;
    setLines((c) =>
      c.map((l) => (l.key === key ? { ...l, unit_price_centavos: centavos } : l)),
    );
  }

  const subtotal = lines.reduce((s, l) => s + l.unit_price_centavos * l.quantity, 0);

  const discountValue = (() => {
    if (discountKind === "amount") return parsePesosToCentavos(discountText) ?? 0;
    if (discountKind === "percent") return Number(discountText || 0);
    return 0;
  })();

  const discount =
    discountKind === "amount"
      ? Math.min(discountValue, subtotal)
      : discountKind === "percent"
        ? Math.floor((subtotal * Math.min(100, Math.max(0, discountValue))) / 100)
        : 0;

  const total = subtotal - discount;
  const cash = parsePesosToCentavos(cashText) ?? 0;
  const change = method === "cash" ? cash - total : 0;
  const short = method === "cash" && cash < total;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {/* The server recomputes every total from these lines. */}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines.map((line) => ({
            product_id: line.product_id,
            name: line.name,
            division: line.division,
            income_category: line.income_category,
            quantity: line.quantity,
            unit_price_centavos: line.unit_price_centavos,
          })),
        )}
      />
      <input type="hidden" name="discount_kind" value={discountKind} />
      <input type="hidden" name="discount_value" value={discountKind === "amount" ? discount : discountValue} />
      <input type="hidden" name="money_given" value={method === "cash" ? cash : ""} />
      <input type="hidden" name="sale_date" value={new Date().toISOString().slice(0, 10)} />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Items" />
          <div className="p-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
              className={`${fieldClass} mb-4`}
            />
            <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
              {visible.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="rounded-lg border border-line px-3 py-2 text-left transition hover:border-brand"
                >
                  <span className="block text-sm font-medium text-fg">{product.name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {DIVISION_LABEL[product.division]} ·{" "}
                    {product.manual_price ? "Manual price" : formatCentavos(product.price_centavos)}
                  </span>
                </button>
              ))}
              {visible.length === 0 ? (
                <p className="text-sm text-fg-muted">No products match.</p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Cart" />
          {lines.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">
              Nothing added yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((line) => (
                <li key={line.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium text-fg">{line.name}</p>
                    <p className="text-xs text-fg-subtle">{DIVISION_LABEL[line.division]}</p>
                  </div>

                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => setQuantity(line.key, Number(e.target.value))}
                    aria-label={`Quantity for ${line.name}`}
                    className="w-20 rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg"
                  />

                  {line.manual ? (
                    <input
                      defaultValue={(line.unit_price_centavos / 100).toFixed(2)}
                      onBlur={(e) => setPrice(line.key, e.target.value)}
                      aria-label={`Price for ${line.name}`}
                      className="w-24 rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg"
                    />
                  ) : (
                    <span className="w-24 text-right text-sm tabular-nums text-fg-muted">
                      {formatCentavos(line.unit_price_centavos)}
                    </span>
                  )}

                  <span className="w-28 text-right text-sm font-medium tabular-nums text-fg">
                    {formatCentavos(line.unit_price_centavos * line.quantity)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setQuantity(line.key, 0)}
                    aria-label={`Remove ${line.name}`}
                    className="label-caps text-fg-subtle transition hover:text-brand"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Payment" />
          <div className="space-y-4 p-5">
            <Field label="Customer (optional)">
              <select name="customer_id" defaultValue="" className={fieldClass}>
                <option value="">Walk-in</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            {canDiscount ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount">
                  <select
                    value={discountKind}
                    onChange={(e) => { setDiscountKind(e.target.value); setDiscountText(""); }}
                    className={fieldClass}
                  >
                    <option value="none">None</option>
                    <option value="amount">Amount</option>
                    <option value="percent">Percent</option>
                  </select>
                </Field>
                <Field label={discountKind === "percent" ? "Percent" : "Amount"}>
                  <input
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    disabled={discountKind === "none"}
                    inputMode="decimal"
                    className={fieldClass}
                  />
                </Field>
              </div>
            ) : null}

            <Field label="Method">
              <select
                name="payment_method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className={fieldClass}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                ))}
              </select>
            </Field>

            {method === "cash" ? (
              <Field label="Cash received">
                <input
                  value={cashText}
                  onChange={(e) => setCashText(e.target.value)}
                  inputMode="decimal"
                  className={fieldClass}
                />
              </Field>
            ) : (
              <Field label="Reference number">
                <input name="reference_number" className={fieldClass} />
              </Field>
            )}

            <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Subtotal</dt>
                <dd className="tabular-nums text-fg">{formatCentavos(subtotal)}</dd>
              </div>
              {discount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Discount</dt>
                  <dd className="tabular-nums text-brand">−{formatCentavos(discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold">
                <dt className="text-fg">Total</dt>
                <dd className="tabular-nums text-fg">{formatCentavos(total)}</dd>
              </div>
              {method === "cash" && cashText ? (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Change</dt>
                  <dd className={`tabular-nums ${short ? "text-brand" : "text-fg"}`}>
                    {short ? "Short" : formatCentavos(change)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {state.error ? <Alert>{state.error}</Alert> : null}

            <Submit disabled={lines.length === 0 || short} />
          </div>
        </Card>
      </div>
    </form>
  );
}
