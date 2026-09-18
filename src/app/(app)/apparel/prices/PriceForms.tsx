"use client";

import { useActionState, useState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import type { ApparelSize } from "@/lib/apparel";
import { centavosToDecimalString } from "@/lib/money";

import {
  saveApparelOptionAction,
  saveApparelProductAction,
  saveSizePriceAction,
  type ApparelState,
} from "../actions";

const INCOME_CATEGORIES = [
  { value: "sublimation_jerseys", label: "Sublimation jerseys" },
  { value: "shirts", label: "Shirts" },
  { value: "jackets", label: "Jackets" },
  { value: "long_sleeves", label: "Long sleeves" },
  { value: "dtf_prints", label: "DTF prints" },
];

export function ProductForm({
  product,
}: {
  product?: {
    id: string;
    name: string;
    basePriceCentavos: number | null;
    incomeCategory: string;
    active: boolean;
    note: string | null;
  };
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    saveApparelProductAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {product ? "Edit" : "Add an item"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}

      <Field label="Name" error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={product?.name ?? ""} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Price"
          hint="Leave empty until you decide. Orders still work — the price is asked for on the line."
          error={state.fieldErrors?.basePrice}
        >
          <Input
            name="basePrice"
            inputMode="decimal"
            placeholder="e.g. 650"
            defaultValue={
              product?.basePriceCentavos != null
                ? centavosToDecimalString(product.basePriceCentavos)
                : ""
            }
          />
        </Field>

        <Field label="Counts as" hint="Which set of books its payments land in.">
          <Select
            name="incomeCategory"
            defaultValue={product?.incomeCategory ?? "sublimation_jerseys"}
          >
            {INCOME_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Note">
        <Input name="note" defaultValue={product?.note ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
          className="size-4 rounded border-line"
        />
        <span>Offer this</span>
      </label>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** One size's surcharge, edited in place. */
export function SizePriceForm({
  size,
  extraCentavos,
}: {
  size: ApparelSize;
  extraCentavos: number | null;
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    saveSizePriceAction,
    {},
  );

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="size" value={size} />
      <span className="w-10 text-sm font-medium">{size}</span>
      <Input
        name="extra"
        inputMode="decimal"
        placeholder="not set"
        defaultValue={
          extraCentavos === null ? "" : centavosToDecimalString(extraCentavos)
        }
        className="w-28"
        aria-label={`Extra for ${size}`}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "..." : "Save"}
      </Button>
      {extraCentavos === null ? (
        <span className="text-xs text-attention">
          <span aria-hidden="true">{"⚠"} </span>not set
        </span>
      ) : null}
      {state.error ? (
        <span className="text-xs text-attention">{state.error}</span>
      ) : null}
      {state.success ? (
        <span className="text-xs text-success">{"✓"} saved</span>
      ) : null}
    </form>
  );
}

export function OptionForm({ kind }: { kind: "fabric" | "collar" }) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    saveApparelOptionAction,
    {},
  );

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <Field
        label={kind === "fabric" ? "Add a fabric" : "Add a collar"}
        error={state.fieldErrors?.label}
      >
        <Input
          name="label"
          placeholder={kind === "fabric" ? "e.g. Dri-fit" : "e.g. Round neck"}
          required
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </Button>
      {state.error ? (
        <span className="text-xs text-attention">{state.error}</span>
      ) : null}
      {state.success ? (
        <span className="text-xs text-success">{state.success}</span>
      ) : null}
    </form>
  );
}
