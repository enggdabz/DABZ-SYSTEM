"use client";

/**
 * The Counter's saved products, one row each (the owner's request, 2 Oct 2026).
 *
 *   ⋮⋮  [photo]  name / price   [ qty ]   line total   🗑
 *
 * Grouped under the owner's categories (0027), each with a red header, and
 * laid out in two columns wherever the list has the room for two readable
 * rows. "Where the list has the room" is a CONTAINER query, not a screen one:
 * on a tablet in landscape the payment panel takes half the screen, and the
 * list is narrower there than on a tablet held upright.
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
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { Modal } from "@/components/Modal";
import { Button, Field, Input, Notice, Select, TAP_AREA, HEADING_BOX } from "@/components/ui";
import {
  checkCategoryName,
  checkNewProduct,
  checkProductEdit,
  cleanQuantity,
  groupByCategory,
  rowPrice,
  stepQuantity,
  type CategoryGroup,
} from "@/lib/counter-list";
import { centavosToDecimalString, formatPesos } from "@/lib/money";
import { PHOTO_ACCEPT, photoFileProblem } from "@/lib/product-photo";

import type { AddCounterProductResult, UpdateCounterProductResult } from "./actions";
import type { PosCategory, PosProduct } from "./PosScreen";
import type { ListNotice } from "./useCounterProducts";

export function CounterProductList({
  items,
  categories,
  quantities,
  prices,
  canManage,
  onQuantity,
  onPrice,
  onReorder,
  onChangePhoto,
  onRemovePhoto,
  onDelete,
  onEdit,
  photoBusy,
  photoErrors,
  notice,
  onDismissNotice,
  afterLastRow,
}: {
  items: PosProduct[];
  /** The owner's categories, by name. Null: the database has none yet (0027). */
  categories: PosCategory[] | null;
  quantities: Record<string, string>;
  prices: Record<string, string>;
  /** Owner/Admin, with 0026 applied: drag, photos and the bin. */
  canManage: boolean;
  onQuantity: (id: string, value: string) => void;
  onPrice: (id: string, value: string) => void;
  /** `groupIds`: the category the row was dragged within. */
  onReorder: (activeId: string, overId: string, groupIds: string[]) => void;
  onChangePhoto: (id: string, file: File) => void;
  onRemovePhoto: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, form: FormData) => Promise<UpdateCounterProductResult>;
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
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [photoMenu, setPhotoMenu] = useState<PosProduct | null>(null);

  // Owners and admins see an empty category too - they need to know it is
  // there to put something in it. Staff see only what they can sell.
  const groups: CategoryGroup<PosProduct>[] = categories
    ? groupByCategory(items, categories, { includeEmpty: canManage })
    : [{ key: "none", categoryId: null, title: null, items }];

  // The order the rows are SHOWN in, which Enter follows.
  const shown = groups.flatMap((group) => group.items);

  /** Enter moves to the next row's box, in the order the rows are shown NOW. */
  function nextBox(event: KeyboardEvent<HTMLInputElement>, id: string) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const index = shown.findIndex((product) => product.id === id);
    const next = shown[index + 1];
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
    <div className="space-y-5">
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

      {groups.map((group, groupIndex) => {
        const ids = group.items.map((product) => product.id);
        const label = group.title ?? "Saved products";
        return (
          <section key={group.key} aria-label={label} className="@container">
            {group.title !== null ? (
              <h3 className={`${HEADING_BOX} mb-2 text-sm font-semibold tracking-tight`}>
                {group.title}
              </h3>
            ) : null}

            {group.items.length === 0 ? (
              <p className="rounded-control px-3 py-2 text-sm text-muted ring-1 ring-line/60">
                Nothing in this category yet. Tap a product&rsquo;s name to move it here.
              </p>
            ) : (
              /*
                One drag area per category: a row moves among its own
                category's rows and cannot be dropped into another. Its
                category is changed from the edit dialog, where the choice is
                deliberate rather than the side effect of a slipped finger.
              */
              <DndContext
                id={`${dndId}-${groupIndex}`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                  const { active, over } = event;
                  if (over && active.id !== over.id) {
                    onReorder(String(active.id), String(over.id), ids);
                  }
                }}
              >
                <SortableContext items={ids} strategy={rectSortingStrategy}>
                  <ul className="grid gap-2 @xl:grid-cols-2" aria-label={label}>
                    {group.items.map((product) => (
                      <SortableRow
                        key={product.id}
                        product={product}
                        isLast={product.id === shown[shown.length - 1]?.id}
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
                        onAskEdit={() => setEditing(product)}
                        onAskDelete={() => setConfirming(product)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </section>
        );
      })}

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

      {editing ? (
        <EditProductDialog
          key={editing.id}
          product={editing}
          categories={categories}
          otherNames={items.filter((entry) => entry.id !== editing.id).map((entry) => entry.name)}
          onClose={() => setEditing(null)}
          onSave={(form) => onEdit(editing.id, form)}
        />
      ) : null}

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
  onAskEdit,
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
  onAskEdit: () => void;
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
      className={`@container/row relative rounded-control ring-1 transition-shadow ${
        isDragging
          ? "z-10 bg-surface shadow-xl ring-2 ring-gold"
          : chosen
            ? "bg-gold/10 ring-gold/70"
            : "bg-surface ring-line/60"
      }`}
    >
      {/*
        Two shapes, chosen by how wide the ROW is (a container query), not the
        screen:

          narrow   ⋮⋮ [photo] name / price               🗑
                              [ − | qty | + ]     total

          wide     ⋮⋮ [photo] name / price   [ − | qty | + ]   total   🗑

        A phone row, a half-width column and the list beside the payment panel
        are all narrow; the quantity box with its two buttons would leave the
        name a few letters wide on one line, so it moves under the name there.
        In the wide shape the wrapper is `display: contents`, so the box and
        the total become cells of the same grid row.
      */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 py-2 pr-1 pl-1 @lg/row:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] @lg/row:gap-x-3 @lg/row:pr-2">
        {canManage ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move ${product.name}`}
            className={`row-span-2 flex h-11 w-7 cursor-grab touch-none items-center justify-center rounded-control text-muted hover:text-ink active:cursor-grabbing @lg/row:row-span-1 ${
              isDragging ? "text-ink" : ""
            }`}
          >
            <GripIcon />
          </button>
        ) : (
          <span className="row-span-2 w-1 @lg/row:row-span-1" aria-hidden="true" />
        )}

        <div className="row-span-2 self-start @lg/row:row-span-1 @lg/row:self-center">
          <ProductThumb
            product={product}
            canManage={canManage}
            busy={photoBusy}
            onPhoto={onPhoto}
            onPhotoMenu={onPhotoMenu}
          />
        </div>

        <div className="min-w-0">
          {canManage ? (
            <button
              type="button"
              onClick={onAskEdit}
              aria-label={`Edit ${product.name}`}
              className="-my-1 flex max-w-full items-start gap-1.5 py-1 text-left hover:text-gold"
            >
              <span className="line-clamp-2 text-sm font-medium leading-snug break-words">
                {product.name}
              </span>
              <span className="mt-0.5 shrink-0 text-muted" aria-hidden="true">
                <PencilIcon />
              </span>
            </button>
          ) : (
            <p className="line-clamp-2 text-sm font-medium leading-snug break-words">
              {product.name}
            </p>
          )}
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
        </div>

        <div className="col-span-2 col-start-3 row-start-2 flex items-center justify-between gap-3 @lg/row:contents">
          <div
            className={`flex h-11 shrink-0 items-stretch overflow-hidden rounded-control ring-1 focus-within:ring-2 focus-within:ring-ink/60 ${
              chosen ? "bg-surface ring-gold" : "bg-surface-sunken ring-line"
            }`}
          >
            <button
              type="button"
              onClick={() => onQuantity(product.id, stepQuantity(quantity, -1))}
              disabled={!chosen}
              aria-label={`One fewer ${product.name}`}
              className="flex w-9 items-center justify-center text-lg font-semibold text-muted hover:bg-ink/10 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <span aria-hidden="true">&minus;</span>
            </button>
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
              className="w-12 bg-transparent px-0.5 text-center text-base font-semibold tabular-nums placeholder:font-normal placeholder:text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onQuantity(product.id, stepQuantity(quantity, 1))}
              aria-label={`One more ${product.name}`}
              className="flex w-9 items-center justify-center text-lg font-semibold text-muted hover:bg-ink/10 hover:text-ink"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>

          <p
            className={`text-right text-sm tabular-nums @lg/row:w-24 ${
              price.kind === "priced"
                ? "font-semibold"
                : price.kind === "needs-price"
                  ? "text-attention"
                  : "text-muted"
            }`}
          >
            {price.kind === "needs-price" ? (
              <>
                <span aria-hidden="true">{"⚠"} </span>Price?
              </>
            ) : (
              lineTotal
            )}
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={onAskDelete}
            aria-label={`Delete ${product.name}`}
            title="Delete"
            className="col-start-4 row-start-1 flex h-11 w-8 items-center justify-center self-start rounded-control text-muted hover:text-attention @lg/row:col-start-6 @lg/row:self-center"
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
  categories,
  onClose,
  onAdd,
}: {
  open: boolean;
  existingNames: string[];
  /** Owner/Admin: a photo, and a new category on the way. */
  canAddPhoto: boolean;
  /** Null: the database has no categories yet (0027), so no box for one. */
  categories: PosCategory[] | null;
  onClose: () => void;
  onAdd: (form: FormData) => Promise<AddCounterProductResult>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
    price?: string;
    photo?: string;
    category?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPrice("");
    setCategory("");
    setNewCategory("");
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
    const categoryProblem = putCategory(form, categories, category, newCategory);
    if (categoryProblem) {
      setErrors({ category: categoryProblem });
      return;
    }

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

        <CategoryField
          categories={categories}
          canCreate={canAddPhoto}
          value={category}
          onChange={setCategory}
          newName={newCategory}
          onNewName={setNewCategory}
          error={errors.category}
        />

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

/**
 * Rename or reprice a product (owner's request, 2 Oct 2026). Owner/Admin
 * only, like every other product edit. A new price applies from the next
 * sale: every past sale keeps the name and price it was rung up with.
 */
function EditProductDialog({
  product,
  categories,
  otherNames,
  onClose,
  onSave,
}: {
  product: PosProduct;
  categories: PosCategory[] | null;
  otherNames: string[];
  onClose: () => void;
  onSave: (form: FormData) => Promise<UpdateCounterProductResult>;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(
    product.priceCentavos === null ? "" : centavosToDecimalString(product.priceCentavos),
  );
  // A category that has since been deleted reads as none.
  const [category, setCategory] = useState(
    product.categoryId && categories?.some((entry) => entry.id === product.categoryId)
      ? product.categoryId
      : "",
  );
  const [newCategory, setNewCategory] = useState("");
  const [errors, setErrors] = useState<{ name?: string; price?: string; category?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    const checked = checkProductEdit({ name, price }, otherNames);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      return;
    }
    setErrors({});

    const form = new FormData();
    form.set("name", checked.name);
    form.set("price", price);
    const categoryProblem = putCategory(form, categories, category, newCategory);
    if (categoryProblem) {
      setErrors({ category: categoryProblem });
      return;
    }

    setSaving(true);
    const result = await onSave(form);
    setSaving(false);

    if (result.fieldErrors) setErrors(result.fieldErrors);
    else if (result.error) setError(result.error);
    else onClose();
  }

  return (
    <Modal open title={`Edit ${product.name}`} onClose={onClose} busy={saving}>
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
        <Field
          label="Price each (₱)"
          hint="Leave it empty to type the price at the counter each time."
          error={errors.price}
        >
          <Input
            inputMode="decimal"
            value={price}
            placeholder="0.00"
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>
        <CategoryField
          categories={categories}
          canCreate
          value={category}
          onChange={setCategory}
          newName={newCategory}
          onNewName={setNewCategory}
          error={errors.category}
        />
        <p className="text-xs text-muted">
          Past sales keep the name and price they were sold at. The change
          applies from the next sale.
        </p>

        {error ? <Notice tone="attention" title={error} /> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PencilIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

/**
 * The category part of a product form. "" is none, an id is that category,
 * "new" makes one from the typed name. Returns what is wrong, or null - and
 * says nothing about the category at all when the database has no categories
 * yet, so the server leaves the product's category alone.
 */
function putCategory(
  form: FormData,
  categories: PosCategory[] | null,
  choice: string,
  newName: string,
): string | null {
  if (categories === null) return null;
  form.set("categoryId", choice);
  if (choice !== "new") return null;

  const checked = checkCategoryName(newName, categories.map((entry) => entry.name));
  if (!checked.ok) return checked.error;
  form.set("newCategory", checked.name);
  return null;
}

function CategoryField({
  categories,
  canCreate,
  value,
  onChange,
  newName,
  onNewName,
  error,
}: {
  categories: PosCategory[] | null;
  /** Owner/Admin only - the table's insert policy says the same. */
  canCreate: boolean;
  value: string;
  onChange: (value: string) => void;
  newName: string;
  onNewName: (value: string) => void;
  error?: string;
}) {
  // Nothing to choose from and no way to make one: no box at all.
  if (categories === null || (categories.length === 0 && !canCreate)) return null;

  return (
    <div className="space-y-3">
      <Field label="Category" error={value === "new" ? undefined : error}>
        <Select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
          {canCreate ? <option value="new">+ New category…</option> : null}
        </Select>
      </Field>
      {value === "new" ? (
        <Field label="New category name" error={error}>
          <Input
            value={newName}
            autoFocus
            placeholder="e.g. ID photo"
            onChange={(event) => onNewName(event.target.value)}
          />
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Making, renaming and deleting categories (Owner/Admin). Deleting one never
 * deletes a product: its products move to "Other".
 */
export function ManageCategoriesDialog({
  open,
  categories,
  countFor,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  categories: PosCategory[];
  /** How many products are in a category, for the delete warning. */
  countFor: (id: string) => number;
  onClose: () => void;
  onSave: (form: FormData) => Promise<{ error?: string }>;
  onDelete: (id: string) => Promise<{ error?: string }>;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<PosCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(work: () => Promise<{ error?: string }>): Promise<boolean> {
    setError(null);
    setSaving(true);
    const result = await work();
    setSaving(false);
    if (result.error) setError(result.error);
    return !result.error;
  }

  async function add() {
    const checked = checkCategoryName(newName, categories.map((entry) => entry.name));
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const form = new FormData();
    form.set("name", checked.name);
    if (await run(() => onSave(form))) setNewName("");
  }

  async function rename(category: PosCategory) {
    const typed = names[category.id] ?? category.name;
    const checked = checkCategoryName(
      typed,
      categories.filter((entry) => entry.id !== category.id).map((entry) => entry.name),
    );
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const form = new FormData();
    form.set("id", category.id);
    form.set("name", checked.name);
    if (await run(() => onSave(form))) {
      setNames((current) => {
        const next = { ...current };
        delete next[category.id];
        return next;
      });
    }
  }

  function close() {
    if (saving) return;
    setNames({});
    setNewName("");
    setDeleting(null);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} title="Categories" onClose={close} busy={saving}>
      {deleting ? (
        <div>
          <p className="font-medium">Delete {deleting.name}?</p>
          <p className="mt-1 text-sm text-muted">
            {countFor(deleting.id) === 0
              ? "No products are in it."
              : `Its ${countFor(deleting.id)} product${countFor(deleting.id) === 1 ? "" : "s"} will move to Other. No product is deleted.`}
          </p>
          {error ? <div className="mt-3"><Notice tone="attention" title={error} /></div> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => setDeleting(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={saving}
              onClick={async () => {
                const id = deleting.id;
                if (await run(() => onDelete(id))) setDeleting(null);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted">No categories yet. Add the first one below.</p>
          ) : (
            <ul className="space-y-2" aria-label="Categories">
              {categories.map((category) => {
                const typed = names[category.id] ?? category.name;
                const changed = typed.trim() !== category.name;
                return (
                  <li key={category.id} className="flex items-center gap-2">
                    <Input
                      value={typed}
                      aria-label={`Name of ${category.name}`}
                      onChange={(event) =>
                        setNames((current) => ({ ...current, [category.id]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void rename(category);
                        }
                      }}
                    />
                    {changed ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void rename(category)}
                      >
                        Save
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setDeleting(category);
                      }}
                      aria-label={`Delete the category ${category.name}`}
                      className="flex h-10 w-9 shrink-0 items-center justify-center rounded-control text-muted hover:text-attention"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="flex items-end gap-2 border-t border-line/60 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <div className="flex-1">
              <Field label="New category">
                <Input
                  value={newName}
                  placeholder="e.g. ID photo"
                  onChange={(event) => setNewName(event.target.value)}
                />
              </Field>
            </div>
            <Button type="submit" disabled={saving}>
              Add
            </Button>
          </form>

          {error ? <Notice tone="attention" title={error} /> : null}

          <div className="flex justify-end">
            <Button type="button" variant="quiet" onClick={close} disabled={saving}>
              Done
            </Button>
          </div>
        </div>
      )}
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
