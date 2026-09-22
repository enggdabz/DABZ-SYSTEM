"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import type { Product } from "@/lib/online/types";

import { addManualOrderAction, type OrderActionState } from "./actions";

/**
 * An order that came in by Messenger or over the counter (decision D1).
 *
 * DELIBERATELY SIMPLER THAN THE SHOP'S OWN FORM: one product, a quantity, and
 * the customer's details. The shop's form exists to let a stranger describe a
 * team without a conversation; this one is used by somebody who is already
 * having the conversation and only needs the order to exist so the reports
 * count the whole shop rather than the website half.
 *
 * It goes through the same database function as the website, which is what
 * makes it a `manual` order, prices it from the database, and lifts the lead
 * time - the date was agreed in the chat before anybody opened this.
 */
export function AddManualOrder({
  products,
  minDaysAhead,
}: {
  products: Product[];
  minDaysAhead: number;
}) {
  const [state, submit, pending] = useActionState<OrderActionState, FormData>(
    addManualOrderAction,
    {},
  );
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const errors = state.fieldErrors ?? {};

  const product = products.find((candidate) => candidate.id === productId);

  if (products.length === 0) {
    return (
      <Notice tone="info" title="Nothing to order yet">
        <p>
          Add a product to the online shop first &mdash; a typed-in order is
          priced from the same catalogue, so there has to be something in it.
        </p>
      </Notice>
    );
  }

  return (
    <form action={submit} className="space-y-5">
      <p className="text-sm text-muted">
        For an order somebody gave you on Messenger or at the counter. It is
        priced from the shop&rsquo;s own catalogue and marked as typed in, so
        the reports count it. The {minDaysAhead}-day lead time does not apply
        here.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Customer or team name" error={errors.customerName}>
          <Input name="customerName" required maxLength={80} />
        </Field>

        <Field label="Mobile number" hint="Eleven digits starting 09." error={errors.mobile}>
          <Input name="mobile" required inputMode="tel" placeholder="09171234567" />
        </Field>

        <Field label="Facebook name" hint="Optional.">
          <Input name="facebookName" maxLength={80} />
        </Field>

        <Field label="Date needed" error={errors.dateNeeded}>
          <Input name="dateNeeded" type="date" required />
        </Field>

        <Field label="What did they order?" error={errors.productId}>
          <Select
            name="productId"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            {products.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>

        {product && product.pricingMode === "fixed" && product.prices.length > 0 ? (
          <Field label="Which one">
            <Select name="variantLabel">
              {product.prices.map((price) => (
                <option key={price.id} value={price.label}>
                  {price.label} · {formatPesos(price.priceCentavos)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label="How many pieces"
          hint={
            product && product.minOrderQty > 1
              ? `The smallest order for this is ${product.minOrderQty}.`
              : undefined
          }
          error={errors.qty}
        >
          <Input
            name="qty"
            type="number"
            min={1}
            defaultValue={product?.minOrderQty ?? 1}
            required
          />
        </Field>

        <Field label="How will they get it?">
          <Select name="method" defaultValue="pickup">
            <option value="pickup">Pick up</option>
            <option value="delivery">Delivery</option>
          </Select>
        </Field>
      </div>

      <Field label="Delivery address" hint="Only needed for a delivery." error={errors.address}>
        <Input name="address" maxLength={200} />
      </Field>

      <Field label="Team colours or anything else about the item" hint="Optional.">
        <Input name="teamColors" maxLength={120} />
      </Field>

      <Field label="Notes on the order" hint="Optional.">
        <Input name="notes" maxLength={500} />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add the order"}
      </Button>
    </form>
  );
}
