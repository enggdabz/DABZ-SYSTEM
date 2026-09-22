"use client";

import Image from "next/image";
import { useActionState, useState } from "react";

import {
  Button,
  Disclosure,
  Field,
  Input,
  Notice,
  Select,
  TAP_AREA,
} from "@/components/ui";
import { centavosToDecimalString } from "@/lib/money";
import {
  canMovePhoto,
  PHOTO_MOVE_LABELS,
  type PhotoMove,
} from "@/lib/online/photos";
import type { Category, Product } from "@/lib/online/types";

import {
  deleteOnlineProductAction,
  removeOnlineProductPhotoAction,
  reorderOnlineProductPhotoAction,
  saveOnlineProductAction,
  toggleOnlineProductAction,
  type OnlineProductState,
} from "./actions";

/**
 * The product form (docs/spec.md 9.6).
 *
 * Two things in it are worth knowing.
 *
 * THE PRICE ROWS AND OPTION ROWS ARE STATE, not a fixed number of inputs. The
 * form sends the WHOLE list every time and the action replaces what is stored,
 * so a row the owner deleted here really is gone - a merge would leave it
 * invisible on the form and still orderable from the shop.
 *
 * TICKING "team product" TICKS "ask for sizes" AND DISABLES IT. A roster asks
 * the size per player, so the two cannot disagree; showing the switch on and
 * locked says why, where hiding it would just look like a bug.
 */

interface PriceRow {
  id: number;
  label: string;
  amount: string;
}

interface OptionRow {
  id: number;
  name: string;
  choices: string;
}

let nextRowId = 1;

export function ProductForm({
  product,
  categories,
  onDone,
}: {
  product?: Product;
  categories: Category[];
  onDone?: () => void;
}) {
  const [state, submit, pending] = useActionState<OnlineProductState, FormData>(
    async (previous, formData) => {
      const result = await saveOnlineProductAction(previous, formData);
      if (result.success && !result.error) onDone?.();
      return result;
    },
    {},
  );
  const errors = state.fieldErrors ?? {};

  const [pricingMode, setPricingMode] = useState(product?.pricingMode ?? "fixed");
  const [usesRoster, setUsesRoster] = useState(product?.usesRoster ?? false);

  const [prices, setPrices] = useState<PriceRow[]>(
    product && product.prices.length > 0
      ? product.prices.map((price) => ({
          id: nextRowId++,
          label: price.label,
          amount: centavosToDecimalString(price.priceCentavos),
        }))
      : [{ id: nextRowId++, label: "", amount: "" }],
  );

  const [options, setOptions] = useState<OptionRow[]>(
    product && product.options.length > 0
      ? product.options.map((option) => ({
          id: nextRowId++,
          name: option.name,
          choices: option.choices.join(", "),
        }))
      : [],
  );

  return (
    <form action={submit} className="space-y-6">
      <input type="hidden" name="productId" value={product?.id ?? ""} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          <Input
            name="name"
            defaultValue={product?.name ?? ""}
            placeholder="e.g. Full sublimation jersey"
            required
          />
        </Field>

        <Field label="Category">
          <Select name="categoryId" defaultValue={product?.categoryId ?? ""}>
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Description"
        hint="What a customer reads on the product page. Optional."
      >
        <textarea
          name="description"
          defaultValue={product?.description ?? ""}
          rows={3}
          className="w-full rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Pricing</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pricingMode"
              value="fixed"
              checked={pricingMode === "fixed"}
              onChange={() => setPricingMode("fixed")}
            />
            <span>Fixed price</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pricingMode"
              value="quote"
              checked={pricingMode === "quote"}
              onChange={() => setPricingMode("quote")}
            />
            <span>Price on quote</span>
          </label>
        </div>
        {errors.pricingMode ? (
          <p className="text-xs text-attention">
            <span aria-hidden="true">{"⚠"}</span> {errors.pricingMode}
          </p>
        ) : null}
        <p className="text-sm text-muted">
          {pricingMode === "fixed"
            ? "The shop shows the price and adds the order up by itself."
            : "The shop asks the customer for their design and quantity, and you send the price on Messenger before anything is printed."}
        </p>
      </fieldset>

      {pricingMode === "fixed" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Prices</legend>
          <p className="text-xs text-muted">
            One row per choice a customer can make &mdash; &ldquo;Standard&rdquo;,
            &ldquo;With long sleeves&rdquo;, &ldquo;A4 print&rdquo;. The lowest
            is the one the shop sorts by.
          </p>

          {prices.map((row) => (
            <div key={row.id} className="flex flex-wrap items-end gap-3">
              <div className="min-w-40 flex-1">
                <Input
                  name="priceLabel"
                  aria-label="Price name"
                  placeholder="Standard"
                  value={row.label}
                  onChange={(event) =>
                    setPrices((rows) =>
                      rows.map((r) =>
                        r.id === row.id ? { ...r, label: event.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              <div className="w-32">
                <Input
                  name="priceAmount"
                  aria-label="Price"
                  inputMode="decimal"
                  placeholder="450"
                  value={row.amount}
                  onChange={(event) =>
                    setPrices((rows) =>
                      rows.map((r) =>
                        r.id === row.id ? { ...r, amount: event.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              {prices.length > 1 ? (
                <button
                  type="button"
                  className={`text-sm text-attention underline ${TAP_AREA}`}
                  onClick={() =>
                    setPrices((rows) => rows.filter((r) => r.id !== row.id))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}

          {errors.prices ? (
            <p className="text-xs text-attention">
              <span aria-hidden="true">{"⚠"}</span> {errors.prices}
            </p>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setPrices((rows) => [...rows, { id: nextRowId++, label: "", amount: "" }])
            }
          >
            Add a price
          </Button>
        </fieldset>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Options</legend>
        <p className="text-xs text-muted">
          A question the customer answers on the product page. Put the choices
          after it, separated by commas &mdash; the first one is picked for them.
        </p>

        {options.map((row) => (
          <div key={row.id} className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Input
                name="optionName"
                aria-label="Option name"
                placeholder="Collar"
                value={row.name}
                onChange={(event) =>
                  setOptions((rows) =>
                    rows.map((r) =>
                      r.id === row.id ? { ...r, name: event.target.value } : r,
                    ),
                  )
                }
              />
            </div>
            <div className="min-w-40 flex-1">
              <Input
                name="optionChoices"
                aria-label="Choices, separated by commas"
                placeholder="Round, V-neck"
                value={row.choices}
                onChange={(event) =>
                  setOptions((rows) =>
                    rows.map((r) =>
                      r.id === row.id ? { ...r, choices: event.target.value } : r,
                    ),
                  )
                }
              />
            </div>
            <button
              type="button"
              className={`text-sm text-attention underline ${TAP_AREA}`}
              onClick={() => setOptions((rows) => rows.filter((r) => r.id !== row.id))}
            >
              Remove
            </button>
          </div>
        ))}

        {errors.options ? (
          <p className="text-xs text-attention">
            <span aria-hidden="true">{"⚠"}</span> {errors.options}
          </p>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setOptions((rows) => [...rows, { id: nextRowId++, name: "", choices: "" }])
          }
        >
          Add an option
        </Button>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Smallest order (pieces)"
          hint="The shop will not let a customer order fewer."
          error={errors.minOrderQty}
        >
          <Input
            name="minOrderQty"
            type="number"
            min={1}
            defaultValue={product?.minOrderQty ?? 1}
            required
          />
        </Field>

        <Field
          label="Usually ready in (days)"
          hint="Shown on the product page as a guide, not a promise."
          error={errors.leadTimeDays}
        >
          <Input
            name="leadTimeDays"
            type="number"
            min={1}
            defaultValue={product?.leadTimeDays ?? 7}
            required
          />
        </Field>
      </div>

      <fieldset className="space-y-2 text-sm">
        <legend className="text-sm font-medium">What the shop asks for</legend>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="usesRoster"
            defaultChecked={product?.usesRoster ?? false}
            onChange={(event) => setUsesRoster(event.target.checked)}
            className="size-4 rounded border-line"
          />
          <span>Team product: ask for names and numbers, one row per player</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="usesSizes"
            defaultChecked={product?.usesSizes ?? true}
            disabled={usesRoster}
            className="size-4 rounded border-line"
          />
          <span className={usesRoster ? "text-muted" : undefined}>
            Ask for sizes (XS to 3XL)
            {usesRoster ? " — a team product asks the size per player" : ""}
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="usesDesignGallery"
            defaultChecked={product?.usesDesignGallery ?? false}
            className="size-4 rounded border-line"
          />
          <span>Let customers pick from the jersey design gallery</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isVisible"
            defaultChecked={product?.isVisible ?? true}
            className="size-4 rounded border-line"
          />
          <span>Show it on the shop</span>
        </label>
      </fieldset>

      <Field
        label="Photos"
        hint="JPG, PNG or WebP, up to 5MB each, eight in all. The first one is the picture on the card, and you can change which that is once they are up."
      >
        <input
          type="file"
          name="photos"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-control file:border-0 file:bg-ink/5 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
        />
      </Field>

      {state.error ? <Notice tone="attention" title={state.error} /> : null}
      {state.success ? <Notice tone="success" title={state.success} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : product ? "Save changes" : "Publish product"}
      </Button>
    </form>
  );
}

/**
 * The photos already on a product: which one is the card picture, how to
 * change that, and how to take one off.
 *
 * The order is not decoration - `images[0]` is the picture on the shop card,
 * on this list and in the Messenger message - so it needs a way to be changed
 * that is not "delete the three in front of it and upload them again".
 *
 * Each move is its own little form rather than a drag. A drag needs a pointer,
 * a steady hand and a screen wider than a phone, and the owner does this at
 * the counter; three buttons work with one thumb and with a keyboard, and they
 * say in words what they will do.
 */
export function ProductPhotos({
  photos,
}: {
  photos: { id: string; url: string | null; alt: string | null }[];
}) {
  const [removed, remove] = useActionState<OnlineProductState, FormData>(
    removeOnlineProductPhotoAction,
    {},
  );
  const [moved, move] = useActionState<OnlineProductState, FormData>(
    reorderOnlineProductPhotoAction,
    {},
  );

  if (photos.length === 0) return null;

  const ids = photos.map((photo) => photo.id);
  // Both actions report into the same place. Two notices, one above the other,
  // would leave "Photo removed." sitting under "Photo moved." with no way to
  // tell which one just happened.
  const answer = moved.error || moved.success ? moved : removed;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, index) => (
          <div key={photo.id} className="w-32 space-y-1">
            <div className="aspect-square overflow-hidden rounded-control bg-tile">
              {photo.url ? (
                <Image
                  src={photo.url}
                  alt={photo.alt ?? ""}
                  width={200}
                  height={200}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>

            {index === 0 ? (
              <p className="text-xs font-medium">Main photo</p>
            ) : null}

            <div className="flex items-center gap-1">
              <MovePhoto
                submit={move}
                imageId={photo.id}
                move="up"
                enabled={canMovePhoto(ids, photo.id, "up")}
                glyph="←"
              />
              <MovePhoto
                submit={move}
                imageId={photo.id}
                move="down"
                enabled={canMovePhoto(ids, photo.id, "down")}
                glyph="→"
              />
            </div>

            {/*
              On every photo that is not the main one, including the second -
              where the left arrow beside it happens to do the same thing. The
              rule "any other photo can become the main one" is easier to see
              than an exception at position two, and it keeps every tile in the
              strip the same height.
            */}
            {index > 0 ? (
              <form action={move}>
                <input type="hidden" name="imageId" value={photo.id} />
                <input type="hidden" name="move" value="first" />
                <button type="submit" className={`text-xs underline ${TAP_AREA}`}>
                  Make it the main photo
                </button>
              </form>
            ) : null}

            <form action={remove}>
              <input type="hidden" name="imageId" value={photo.id} />
              <button
                type="submit"
                className={`text-xs text-attention underline ${TAP_AREA}`}
              >
                Remove
              </button>
            </form>
          </div>
        ))}
      </div>

      {answer.error ? <Notice tone="attention" title={answer.error} /> : null}
      {answer.success ? <Notice tone="success" title={answer.success} /> : null}
    </div>
  );
}

/**
 * One arrow.
 *
 * Drawn even where it cannot act, and disabled: an arrow that disappears on
 * the first photo makes the row of buttons under each picture a different
 * width, and the whole strip jumps sideways every time something moves.
 * `size-9` is 36px, comfortably past the 24px this system asks of anything
 * tapped at the counter.
 */
function MovePhoto({
  submit,
  imageId,
  move,
  enabled,
  glyph,
}: {
  submit: (formData: FormData) => void;
  imageId: string;
  move: PhotoMove;
  enabled: boolean;
  glyph: string;
}) {
  return (
    <form action={submit}>
      <input type="hidden" name="imageId" value={imageId} />
      <input type="hidden" name="move" value={move} />
      <button
        type="submit"
        disabled={!enabled}
        aria-label={PHOTO_MOVE_LABELS[move]}
        title={PHOTO_MOVE_LABELS[move]}
        className="flex size-9 items-center justify-center rounded-control ring-1 ring-line/60 text-sm transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden="true">{glyph}</span>
      </button>
    </form>
  );
}

/** The Shown / Hidden switch on a row. */
export function ProductVisibility({
  productId,
  isVisible,
}: {
  productId: string;
  isVisible: boolean;
}) {
  const [state, submit, pending] = useActionState<OnlineProductState, FormData>(
    toggleOnlineProductAction,
    {},
  );

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="productId" value={productId} />
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

/**
 * Delete, asked on the row itself.
 *
 * Two taps, and the second one is the only solid red in the module: red is the
 * brand colour here, so it is kept for the moment somebody says yes to
 * something they cannot undo.
 */
export function DeleteProduct({ productId, name }: { productId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [state, submit, pending] = useActionState<OnlineProductState, FormData>(
    deleteOnlineProductAction,
    {},
  );

  if (state.success) {
    return <span className="text-sm text-muted">{state.success}</span>;
  }

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
      <input type="hidden" name="productId" value={productId} />
      <span className="text-sm">Delete {name} for good?</span>
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
      {state.error ? (
        <span className="text-xs text-attention">{state.error}</span>
      ) : null}
    </form>
  );
}

/** The "Add a product" panel, folded away until it is wanted. */
export function AddProduct({ categories }: { categories: Category[] }) {
  return (
    <Disclosure label="Add a product">
      <ProductForm categories={categories} />
    </Disclosure>
  );
}
