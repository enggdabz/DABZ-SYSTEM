"use client";

/**
 * The Counter's saved products, one row each (the owner's request, 2 Oct 2026).
 *
 *   ⋮⋮  [photo]  name / price   [ qty ]   line total   🗑
 *
 * Staff type how many the customer wants straight into the row - there is no
 * tap-then-confirm step any more, because the box IS the confirmation: nothing
 * is sold until "Complete sale" is pressed.
 *
 * Dragging starts ONLY from the grip. The rest of the row scrolls the page like
 * any other part of it, and the quantity box is tapped like any other box. The
 * grip alone carries `touch-action: none`, which is what lets a finger on it
 * drag rather than scroll.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { Modal } from "@/components/Modal";
import { Button, Field, Input, Notice, TAP_AREA } from "@/components/ui";
import { checkNewProduct, cleanQuantity, rowPrice } from "@/lib/counter-list";
import { formatPesos } from "@/lib/money";
import { PHOTO_ACCEPT, photoFileProblem } from "@/lib/product-photo";

import type { AddCounterProductResult } from "./actions";
import type { PosProduct } from "./PosScreen";
import type { ListNotice } from "./useCounterProducts";

/** A row moves up and down, never sideways. */
const upAndDownOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export function CounterProductList({
  items,
  quantities,
  prices,
  canManage,
  onQuantity,
  onPrice,
  onReorder,
  onChangePhoto,
  onRemovePhoto,
  onDelete,
  photoBusy,
  photoErrors,
  notice,
  onDismissNotice,
  afterLastRow,
}: {
  items: PosProduct[];
  quantities: Record<string, string>;
  prices: Record<string, string>;
  /** Owner/Admin, with 0026 applied: drag, photos and the bin. */
  canManage: boolean;
  onQuantity: (id: string, value: string) => void;
  onPrice: (id: string, value: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onChangePhoto: (id: string, file: File) => void;
  onRemovePhoto: (id: string) => void;
  onDelete: (id: string) => void;
  photoBusy: Record<string, boolean>;
  photoErrors: Record<string, string>;
  notice: ListNotice | null;
  onDismissNotice: () => void;
  /** Where Enter in the last box sends the cursor. */
  afterLastRow?: RefObject<HTMLElement | null>;
}) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a tap on the grip is
    // not a drag that goes nowhere.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // dnd-kit numbers its accessibility ids itself, and the server's count and
  // the browser's disagree - a hydration mismatch on every load. A React id
  // is the same on both.
  const dndId = useId();
  const quantityBoxes = useRef(new Map<string, HTMLInputElement>());
  const [confirming, setConfirming] = useState<PosProduct | null>(null);
  const [photoMenu, setPhotoMenu] = useState<PosProduct | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  /** Enter moves to the next row's box, in the order the rows are shown NOW. */
  function nextBox(event: KeyboardEvent<HTMLInputElement>, id: string) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const index = items.findIndex((product) => product.id === id);
    const next = items[index + 1];
    if (next) {
      const box = quantityBoxes.current.get(next.id);
      box?.focus();
      box?.select();
    } else if (afterLastRow?.current) {
      afterLastRow.current.focus();
    } else {
      event.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-3">
      {notice ? (
        <div aria-live="polite">
          <Notice tone={notice.tone} title={notice.text}>
            <button
              type="button"
              onClick={onDismissNotice}
              className={`text-xs underline ${TAP_AREA}`}
            >
              Dismiss
            </button>
          </Notice>
        </div>
      ) : null}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[upAndDownOnly]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((product) => product.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2" aria-label="Saved products">
            {items.map((product, index) => (
              <SortableRow
                key={product.id}
                product={product}
                isLast={index === items.length - 1}
                quantity={quantities[product.id] ?? ""}
                typedPrice={prices[product.id] ?? ""}
                canManage={canManage}
                onQuantity={onQuantity}
                onPrice={onPrice}
                onEnter={nextBox}
                registerBox={(element) => {
                  if (element) quantityBoxes.current.set(product.id, element);
                  else quantityBoxes.current.delete(product.id);
                }}
                photoBusy={photoBusy[product.id] ?? false}
                photoError={photoErrors[product.id] ?? ""}
                onPhoto={(file) => onChangePhoto(product.id, file)}
                onPhotoMenu={() => setPhotoMenu(product)}
                onAskDelete={() => setConfirming(product)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <Modal
        open={confirming !== null}
        title={confirming ? `Delete ${confirming.name}?` : "Delete"}
        onClose={() => setConfirming(null)}
      >
        <p className="text-sm text-muted">This cannot be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (confirming) onDelete(confirming.id);
              setConfirming(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>

      <PhotoMenu
        product={photoMenu}
        onClose={() => setPhotoMenu(null)}
        onReplace={(file) => {
          if (photoMenu) onChangePhoto(photoMenu.id, file);
          setPhotoMenu(null);
        }}
        onRemove={() => {
          if (photoMenu) onRemovePhoto(photoMenu.id);
          setPhotoMenu(null);
        }}
      />
    </div>
  );
}

function SortableRow({
  product,
  isLast,
  quantity,
  typedPrice,
  canManage,
  onQuantity,
  onPrice,
  onEnter,
  registerBox,
  photoBusy,
  photoError,
  onPhoto,
  onPhotoMenu,
  onAskDelete,
}: {
  product: PosProduct;
  isLast: boolean;
  quantity: string;
  typedPrice: string;
  canManage: boolean;
  onQuantity: (id: string, value: string) => void;
  onPrice: (id: string, value: string) => void;
  onEnter: (event: KeyboardEvent<HTMLInputElement>, id: string) => void;
  registerBox: (element: HTMLInputElement | null) => void;
  photoBusy: boolean;
  photoError: string;
  onPhoto: (file: File) => void;
  onPhotoMenu: () => void;
  onAskDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id, disabled: !canManage });

  const price = rowPrice(product, quantity, typedPrice);
  const chosen = price.kind !== "empty";
  const unpriced = product.priceCentavos === null;

  const lineTotal =
    price.kind === "priced" ? formatPesos(price.lineTotalCentavos) : price.kind === "needs-price" ? "Price?" : "—";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative rounded-control ring-1 transition-shadow ${
        isDragging
          ? "z-10 bg-surface shadow-xl ring-2 ring-gold"
          : chosen
            ? "bg-gold/10 ring-gold/70"
            : "bg-surface ring-line/60"
      }`}
    >
      <div className="flex items-center gap-2 py-2 pr-1 pl-1 sm:gap-3 sm:pr-2">
        {canManage ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move ${product.name}`}
            className={`flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-muted hover:text-ink active:cursor-grabbing ${
              isDragging ? "text-ink" : ""
            }`}
          >
            <GripIcon />
          </button>
        ) : (
          <span className="w-1 shrink-0" aria-hidden="true" />
        )}

        <ProductThumb
          product={product}
          canManage={canManage}
          busy={photoBusy}
          onPhoto={onPhoto}
          onPhotoMenu={onPhotoMenu}
        />

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug break-words">
            {product.name}
          </p>
          {unpriced ? (
            <label className="mt-1 flex items-center gap-1 text-xs text-muted">
              <span>₱</span>
              <input
                inputMode="decimal"
                value={typedPrice}
                onChange={(event) => onPrice(product.id, event.target.value)}
                placeholder="Price"
                aria-label={`Price each for ${product.name}`}
                className="h-8 w-20 rounded-control bg-surface-sunken px-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
              />
            </label>
          ) : (
            <p className="text-xs text-muted">
              {price.kind === "priced" && price.bulk ? (
                <>
                  <span className="line-through">{formatPesos(product.priceCentavos!)}</span>{" "}
                  <span className="font-medium text-ink">
                    {formatPesos(price.unitPriceCentavos)} bulk
                  </span>
                </>
              ) : (
                formatPesos(product.priceCentavos!)
              )}
              {product.unit ? ` / ${product.unit}` : ""}
            </p>
          )}
          {/*
            The line total sits under the name wherever the row is narrow: on a
            phone, and from lg to xl, where the payment panel beside the list
            and the sidebar leave the list column only ~360px.
          */}
          <p
            className={`mt-0.5 text-xs font-semibold sm:hidden lg:block xl:hidden ${
              price.kind === "needs-price" ? "text-attention" : ""
            }`}
            aria-hidden="true"
          >
            {price.kind === "priced" ? `= ${lineTotal}` : price.kind === "needs-price" ? "⚠ Type the price" : ""}
          </p>
        </div>

        <input
          ref={registerBox}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint={isLast ? "done" : "next"}
          autoComplete="off"
          value={quantity}
          placeholder="0"
          onChange={(event) => onQuantity(product.id, cleanQuantity(event.target.value))}
          onKeyDown={(event) => onEnter(event, product.id)}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={`Quantity of ${product.name}`}
          className={`h-11 w-14 shrink-0 rounded-control px-1 text-center text-base font-semibold tabular-nums ring-1 placeholder:font-normal placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/60 sm:w-16 ${
            chosen ? "bg-surface ring-gold" : "bg-surface-sunken ring-line"
          }`}
        />

        <p
          className={`hidden w-24 shrink-0 text-right text-sm tabular-nums sm:block lg:hidden xl:block ${
            price.kind === "priced"
              ? "font-semibold"
              : price.kind === "needs-price"
                ? "text-attention"
                : "text-muted"
          }`}
          aria-live="off"
        >
          {price.kind === "needs-price" ? (
            <>
              <span aria-hidden="true">{"⚠"} </span>Price?
            </>
          ) : (
            lineTotal
          )}
        </p>

        {canManage ? (
          <button
            type="button"
            onClick={onAskDelete}
            aria-label={`Delete ${product.name}`}
            title="Delete"
            className="ml-1 flex h-11 w-8 shrink-0 items-center justify-center rounded-control text-muted hover:text-attention sm:ml-2"
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>

      {photoError ? (
        <p className="flex items-start gap-1.5 px-3 pb-2 text-xs text-attention" role="alert">
          <span aria-hidden="true">{"⚠"}</span>
          <span>{photoError}</span>
        </p>
      ) : null}
    </li>
  );
}

/**
 * The 48px square on each row.
 *
 * No photo: a "+" square that opens the picker. A photo: tapping it offers
 * Replace or Remove. Staff see the photo (or a plain square) and nothing to
 * tap - photos are Owner/Admin, like every other product edit.
 *
 * The picker has no `capture` attribute on purpose: with it, a phone opens
 * the camera ONLY; without it, the phone offers the camera AND the gallery.
 */
function ProductThumb({
  product,
  canManage,
  busy,
  onPhoto,
  onPhotoMenu,
}: {
  product: PosProduct;
  canManage: boolean;
  busy: boolean;
  onPhoto: (file: File) => void;
  onPhotoMenu: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);

  const picture = product.imageUrl ? (
    <Image
      src={product.imageUrl}
      alt=""
      width={96}
      height={96}
      className="size-full object-cover"
    />
  ) : (
    <span className="text-muted" aria-hidden="true">
      {canManage ? <PlusCameraIcon /> : null}
    </span>
  );

  const box = `relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-tile ring-1 ring-line/60`;

  if (!canManage) {
    return <span className={box}>{picture}</span>;
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => (product.imageUrl ? onPhotoMenu() : picker.current?.click())}
        aria-label={
          product.imageUrl ? `Change the photo of ${product.name}` : `Add a photo of ${product.name}`
        }
        className={`${box} ${product.imageUrl ? "" : "border border-dashed border-line ring-0"} hover:ring-ink/40`}
      >
        {picture}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55" role="status">
            <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            <span className="sr-only">Uploading the photo</span>
          </span>
        ) : null}
      </button>
      <input
        ref={picker}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPhoto(file);
        }}
      />
    </>
  );
}

/** Replace or remove an existing photo. */
function PhotoMenu({
  product,
  onClose,
  onReplace,
  onRemove,
}: {
  product: PosProduct | null;
  onClose: () => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <Modal
      open={product !== null}
      title={product ? `Photo of ${product.name}` : "Photo"}
      onClose={onClose}
    >
      {product?.imageUrl ? (
        <div className="mx-auto size-40 overflow-hidden rounded-card bg-tile ring-1 ring-line/60">
          <Image
            src={product.imageUrl}
            alt={product.name}
            width={320}
            height={320}
            className="size-full object-cover"
          />
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onRemove}>
          Remove photo
        </Button>
        <Button type="button" onClick={() => picker.current?.click()}>
          Replace photo
        </Button>
      </div>
      <input
        ref={picker}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onReplace(file);
        }}
      />
    </Modal>
  );
}

/**
 * "+ New product": a name, a price, and - for the owner or an admin - an
 * optional photo. Saved to the list straight away; it appears at the bottom.
 */
export function NewCounterProductDialog({
  open,
  existingNames,
  canAddPhoto,
  onClose,
  onAdd,
}: {
  open: boolean;
  existingNames: string[];
  canAddPhoto: boolean;
  onClose: () => void;
  onAdd: (form: FormData) => Promise<AddCounterProductResult>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; price?: string; photo?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPrice("");
    choosePhoto(null);
    setErrors({});
    setError(null);
  }

  function choosePhoto(file: File | null) {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
    setPhoto(file);
  }

  function close() {
    if (saving) return;
    reset();
    onClose();
  }

  async function save() {
    setError(null);
    const checked = checkNewProduct({ name, price }, existingNames);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      return;
    }
    setErrors({});

    const form = new FormData();
    form.set("name", checked.name);
    form.set("price", price);
    if (photo) form.set("photo", photo);

    setSaving(true);
    const result = await onAdd(form);
    setSaving(false);

    if (result.fieldErrors) {
      setErrors(result.fieldErrors);
      return;
    }
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.photoError) {
      // The product is in the list; only its photo did not make it. Say so,
      // rather than closing as if all was well.
      setError(`${checked.name} was added, but its photo was not saved: ${result.photoError}`);
      setName("");
      setPrice("");
      choosePhoto(null);
      return;
    }
    reset();
    onClose();
  }

  return (
    <Modal open={open} title="New product" onClose={close} busy={saving}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Product name" error={errors.name}>
          <Input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Price each (₱)" error={errors.price}>
          <Input
            inputMode="decimal"
            value={price}
            placeholder="0.00"
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>

        {canAddPhoto ? (
          <div>
            <p className="text-sm font-medium">
              Photo <span className="font-normal text-muted">(optional)</span>
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-tile ring-1 ring-line/60">
                {preview ? (
                  // A local preview of a file not yet uploaded: next/image
                  // cannot optimise a blob: URL, and there is nothing to gain.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-muted" aria-hidden="true">
                    <PlusCameraIcon />
                  </span>
                )}
              </span>
              <label className="cursor-pointer rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10">
                {photo ? "Choose another" : "Choose a photo"}
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    if (!file) return;
                    const problem = photoFileProblem(file);
                    setErrors((current) => ({ ...current, photo: problem ?? undefined }));
                    choosePhoto(problem ? null : file);
                  }}
                />
              </label>
              {photo ? (
                <button
                  type="button"
                  onClick={() => choosePhoto(null)}
                  className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
                >
                  Remove
                </button>
              ) : null}
            </div>
            {errors.photo ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-attention">
                <span aria-hidden="true">{"⚠"}</span>
                <span>{errors.photo}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">JPG, PNG or WebP, up to 5 MB.</p>
            )}
          </div>
        ) : null}

        {error ? <Notice tone="attention" title={error} /> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
      {[3, 10, 17].map((y) =>
        [4, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />),
      )}
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

function PlusCameraIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}
