"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { useFormPanel } from "@/components/use-form-panel";
import type { ApparelSize } from "@/lib/apparel";
import { centavosToDecimalString } from "@/lib/money";
import { UNIFORM_TYPES, UNIFORM_TYPE_LABELS, type UniformType } from "@/lib/uniforms";

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
  { value: "other_apparel", label: "Other apparel" },
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
    uniformType: UniformType | null;
  };
}) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    saveApparelProductAction,
    {},
  );
  const { open, answer, openPanel, closePanel } = useFormPanel(state);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={openPanel}>
        {product ? "Edit" : "Add an item"}
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}

      <Field label="Name" error={answer.fieldErrors?.name}>
        <Input name="name" defaultValue={product?.name ?? ""} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Price"
          hint="Leave empty until you decide. Orders still work — the price is asked for on the line."
          error={answer.fieldErrors?.basePrice}
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

      {/*
        Optional, and null is the honest default: guessing "Jersey" from the
        words "Sublimation jersey set" would have the encoding table
        pre-filling a price for something nobody said it was. Untagged simply
        means the price is typed on the row instead.
      */}
      <Field
        label="Pre-fills the price for"
        hint="Which of the six uniform types this is, on a project's encoding table. Leave it if it is none of them."
        error={answer.fieldErrors?.uniformType}
      >
        <Select name="uniformType" defaultValue={product?.uniformType ?? ""}>
          <option value="">Not one of the six</option>
          {UNIFORM_TYPES.map((type) => (
            <option key={type} value={type}>
              {UNIFORM_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>

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

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      {answer.success ? <Notice tone="success" title={answer.success} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="quiet" onClick={closePanel}>
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
