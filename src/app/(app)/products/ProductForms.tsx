"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { DIVISION_LIST } from "@/lib/divisions";
import { centavosToDecimalString } from "@/lib/money";

import {
  addPriceTierAction,
  removePriceTierAction,
  saveProductAction,
  setProductActiveAction,
  type ProductActionState,
} from "./actions";

const SECTIONS = [
  { value: "printing", label: "Printing" },
  { value: "photocopy", label: "Photocopy" },
  { value: "souvenirs", label: "Mugs & souvenirs" },
  { value: "other", label: "Saved products" },
];

export interface ProductValues {
  id: string;
  name: string;
  division: string;
  priceCentavos: number | null;
  unit: string | null;
  section: string;
  incomeCategory: string;
}

export function ProductForm({ product }: { product?: ProductValues }) {
  const [state, submit, pending] = useActionState<ProductActionState, FormData>(
    saveProductAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-5">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input
        type="hidden"
        name="incomeCategory"
        value={product?.incomeCategory ?? "other_print_jobs"}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          <Input name="name" defaultValue={product?.name ?? ""} required />
        </Field>

        <Field
          label="Price"
          hint="Leave blank to be asked for the price at the counter every time."
          error={errors.price}
        >
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={
              product?.priceCentavos != null
                ? centavosToDecimalString(product.priceCentavos)
                : ""
            }
            placeholder="e.g. 25"
          />
        </Field>

        <Field label="Unit" hint="Optional, e.g. page, piece.">
          <Input name="unit" defaultValue={product?.unit ?? ""} />
        </Field>

        <Field label="Division" error={errors.division}>
          <Select name="division" defaultValue={product?.division ?? "printshoppe"}>
            {DIVISION_LIST.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Group on the counter">
          <Select name="section" defaultValue={product?.section ?? "other"}>
            {SECTIONS.map((section) => (
              <option key={section.value} value={section.value}>
                {section.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : product ? "Save changes" : "Add product"}
      </Button>
    </form>
  );
}

export function ProductActiveForm({
  productId,
  name,
  active,
}: {
  productId: string;
  name: string;
  active: boolean;
}) {
  const [state, submit, pending] = useActionState<ProductActionState, FormData>(
    setProductActiveAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={submit}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant={active ? "danger" : "secondary"} disabled={pending}>
          {pending ? "Saving…" : active ? `Hide ${name}` : `Show ${name}`}
        </Button>
      </form>
      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}
    </div>
  );
}

/** Bulk discounts (spec 7.4). The owner writes the rules; none are seeded. */
export function PriceTiersForm({
  productId,
  tiers,
}: {
  productId: string;
  tiers: { id: string; minQuantity: number; unitPriceLabel: string }[];
}) {
  const [addState, add, adding] = useActionState<ProductActionState, FormData>(
    addPriceTierAction,
    {},
  );
  const [removeState, remove] = useActionState<ProductActionState, FormData>(
    removePriceTierAction,
    {},
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {tiers.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {tiers
            .slice()
            .sort((a, b) => a.minQuantity - b.minQuantity)
            .map((tier) => (
              <li key={tier.id} className="flex items-center justify-between gap-3">
                <span>
                  From <strong>{tier.minQuantity}</strong> up:{" "}
                  {tier.unitPriceLabel} each
                </span>
                <form action={remove}>
                  <input type="hidden" name="tierId" value={tier.id} />
                  <button
                    type="submit"
                    className="text-xs text-muted underline hover:text-ink"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No bulk price for this one. Every quantity costs the normal price.
        </p>
      )}

      {removeState.error ? (
        <Notice tone="attention" title={removeState.error} />
      ) : null}

      {open ? (
        <form action={add} className="space-y-3 border-t border-line/60 pt-3">
          <input type="hidden" name="productId" value={productId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="From this quantity up"
              error={addState.fieldErrors?.minQuantity}
            >
              <Input name="minQuantity" type="number" min={2} required placeholder="e.g. 50" />
            </Field>
            <Field label="Each one costs" error={addState.fieldErrors?.unitPrice}>
              <Input name="unitPrice" inputMode="decimal" required placeholder="e.g. 2.50" />
            </Field>
          </div>
          {addState.error ? <Notice tone="attention" title={addState.error} /> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={adding}>
              {adding ? "Saving…" : "Add the rule"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
          Add a bulk price
        </Button>
      )}

      {addState.success ? <Notice tone="success" title={addState.success} /> : null}
    </div>
  );
}
