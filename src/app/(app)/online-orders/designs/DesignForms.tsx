"use client";

import { useActionState, useState } from "react";

import { Button, Disclosure, Field, Input, Notice, TAP_AREA } from "@/components/ui";
import type { Design, Product } from "@/lib/online/types";

import {
  deleteOnlineDesignAction,
  saveOnlineDesignAction,
  toggleOnlineDesignAction,
  type OnlineDesignState,
} from "./actions";

export function DesignForm({
  design,
  galleryProducts,
  nextCode,
}: {
  design?: Design;
  /** Only products with the gallery switch on can offer a design. */
  galleryProducts: Product[];
  nextCode: string;
}) {
  const [state, submit, pending] = useActionState<OnlineDesignState, FormData>(
    saveOnlineDesignAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="space-y-6">
      <input type="hidden" name="designId" value={design?.id ?? ""} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Design code"
          hint="What you and the customer call it on Messenger."
          error={errors.code}
        >
          <Input name="code" defaultValue={design?.code ?? nextCode} required />
        </Field>

        <Field label="Name" error={errors.name}>
          <Input
            name="name"
            defaultValue={design?.name ?? ""}
            placeholder="e.g. Thunder"
            required
          />
        </Field>
      </div>

      <Field label="Short description" hint="Optional.">
        <Input name="description" defaultValue={design?.description ?? ""} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Offered on</legend>
        {galleryProducts.length === 0 ? (
          <p className="text-sm text-muted">
            No product has the design gallery switched on yet. Tick{" "}
            <em>Let customers pick from the jersey design gallery</em> on a
            product and it will appear here.
          </p>
        ) : (
          galleryProducts.map((product) => (
            <label key={product.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="productIds"
                value={product.id}
                defaultChecked={design?.productIds.includes(product.id) ?? false}
                className="size-4 rounded border-line"
              />
              <span>{product.name}</span>
            </label>
          ))
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isVisible"
          defaultChecked={design?.isVisible ?? true}
          className="size-4 rounded border-line"
        />
        <span>Show it on the shop</span>
      </label>

      <Field
        label="Mockup picture"
        hint="JPG, PNG or WebP, up to 5MB. Replacing it changes what customers see everywhere."
      >
        <input
          type="file"
          name="mockup"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-control file:border-0 file:bg-ink/5 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
        />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : design ? "Save changes" : "Publish design"}
      </Button>
    </form>
  );
}

export function DesignVisibility({
  designId,
  isVisible,
}: {
  designId: string;
  isVisible: boolean;
}) {
  const [state, submit, pending] = useActionState<OnlineDesignState, FormData>(
    toggleOnlineDesignAction,
    {},
  );

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="designId" value={designId} />
      <input type="hidden" name="isVisible" value={isVisible ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={`text-sm underline ${TAP_AREA}`}
      >
        {isVisible ? "Hide from the shop" : "Show on the shop"}
      </button>
      {state.error ? (
        <span className="ml-2 text-xs text-attention">{state.error}</span>
      ) : null}
    </form>
  );
}

export function DeleteDesign({ designId, code }: { designId: string; code: string }) {
  const [asking, setAsking] = useState(false);
  const [state, submit, pending] = useActionState<OnlineDesignState, FormData>(
    deleteOnlineDesignAction,
    {},
  );

  if (state.success) return <span className="text-sm text-muted">{state.success}</span>;

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`text-sm text-attention underline ${TAP_AREA}`}
      >
        Delete
      </button>
    );
  }

  return (
    <form action={submit} className="inline-flex flex-wrap items-center gap-3">
      <input type="hidden" name="designId" value={designId} />
      <span className="text-sm">Delete {code} for good?</span>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Deleting…" : "Yes, delete"}
      </Button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={`text-sm underline ${TAP_AREA}`}
      >
        Keep
      </button>
      {state.error ? <span className="text-xs text-attention">{state.error}</span> : null}
    </form>
  );
}

export function AddDesign({
  galleryProducts,
  nextCode,
}: {
  galleryProducts: Product[];
  nextCode: string;
}) {
  return (
    <Disclosure label="Add a design">
      <DesignForm galleryProducts={galleryProducts} nextCode={nextCode} />
    </Disclosure>
  );
}
