"use client";

/**
 * Everything the Counter's product list remembers, and every save it makes.
 *
 * Quantities and typed prices are kept by PRODUCT ID in their own records,
 * never inside the list of products. That one decision is what keeps a
 * quantity with its product when a row is dragged, when a photo changes, when
 * a product is added or removed, and when the server sends a fresh copy of the
 * list: none of those touch the records the quantities live in.
 *
 * Every change is shown at once and saved after. If the save fails, the change
 * is put back and the person is told - the screen never keeps showing
 * something the database does not hold.
 */
import { useCallback, useState } from "react";

import { moveId, moveWithinGroup, reconcileProducts } from "@/lib/counter-list";
import { squarePhoto } from "@/lib/photo-resize";
import { photoFileProblem } from "@/lib/product-photo";

import {
  addCounterProductAction,
  deleteCounterProductAction,
  deleteProductCategoryAction,
  removeCounterProductPhotoAction,
  reorderCounterProductsAction,
  saveProductCategoryAction,
  setCounterProductPhotoAction,
  updateCounterProductAction,
  type AddCounterProductResult,
  type UpdateCounterProductResult,
} from "./actions";
import type { PosCategory, PosProduct } from "./PosScreen";

export interface ListNotice {
  tone: "attention" | "info";
  text: string;
}

/** Categories in the order the Counter shows them: by name, as the database sorts. */
function byName(categories: PosCategory[]): PosCategory[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function useCounterProducts(
  serverProducts: PosProduct[],
  /** Null when the database has no categories table yet (0027). */
  serverCategories: PosCategory[] | null = null,
) {
  const [items, setItems] = useState<PosProduct[]>(serverProducts);
  const [categories, setCategories] = useState<PosCategory[] | null>(serverCategories);
  const [seenCategories, setSeenCategories] = useState(serverCategories);
  const [seen, setSeen] = useState(serverProducts);
  const [busy, setBusy] = useState(0);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});

  const [photoBusy, setPhotoBusy] = useState<Record<string, boolean>>({});
  const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<ListNotice | null>(null);

  /*
    A fresh copy of the list from the server (after any save, or a refresh).
    Taken in during render rather than in an effect, so there is never a frame
    showing the old list beside the new props.
  */
  // Categories are a short list changed only through this screen's own
  // dialogs, so a fresh copy simply replaces the old one.
  if (serverCategories !== seenCategories) {
    setSeenCategories(serverCategories);
    setCategories(serverCategories);
  }

  if (serverProducts !== seen) {
    setSeen(serverProducts);
    setItems((current) => reconcileProducts(current, serverProducts, gone, busy > 0));
    const stillThere = new Set(serverProducts.map((product) => product.id));
    if ([...gone].some((id) => !stillThere.has(id))) {
      setGone((current) => new Set([...current].filter((id) => stillThere.has(id))));
    }
  }

  /** Runs a save, counting it as "on its way" until it answers. */
  const saving = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    setBusy((count) => count + 1);
    try {
      return await work();
    } finally {
      setBusy((count) => count - 1);
    }
  }, []);

  const setQuantity = useCallback((id: string, value: string) => {
    setQuantities((current) => ({ ...current, [id]: value }));
  }, []);

  const setPrice = useCallback((id: string, value: string) => {
    setPrices((current) => ({ ...current, [id]: value }));
  }, []);

  const clearQuantities = useCallback(() => {
    setQuantities({});
    setPrices({});
  }, []);

  /**
   * `groupIds` is the category the row was dragged within: only those rows
   * change places, and every other product keeps its spot in the saved order.
   */
  async function reorder(activeId: string, overId: string, groupIds?: readonly string[]) {
    const before = items;
    const allIds = before.map((product) => product.id);
    const ids = groupIds
      ? moveWithinGroup(allIds, groupIds, activeId, overId)
      : moveId(allIds, activeId, overId);
    const byId = new Map(before.map((product) => [product.id, product]));
    setItems(ids.map((id) => byId.get(id)!));
    setNotice(null);

    const result = await saving(() =>
      reorderCounterProductsAction(ids).catch(() => ({
        error: "The new order was not saved - the connection dropped.",
      })),
    );

    if (result.error) {
      // Put the rows back where they were - only if nothing else has moved
      // them since, so a second drag is not undone by the first one failing.
      setItems((current) =>
        current.map((product) => product.id).join() === ids.join() ? before : current,
      );
      setNotice({ tone: "attention", text: `${result.error} The row was put back.` });
    }
  }

  async function changePhoto(id: string, file: File) {
    const problem = photoFileProblem(file);
    if (problem) {
      setPhotoErrors((current) => ({ ...current, [id]: problem }));
      return;
    }

    setPhotoErrors((current) => ({ ...current, [id]: "" }));
    setPhotoBusy((current) => ({ ...current, [id]: true }));

    try {
      const result = await saving(async () => {
        let small: File;
        try {
          small = await squarePhoto(file);
        } catch {
          return { error: "That photo could not be read. Try another one." };
        }
        const form = new FormData();
        form.set("productId", id);
        form.set("photo", small);
        return setCounterProductPhotoAction(form).catch(() => ({
          error: "The photo was not saved - the connection dropped.",
        }));
      });

      if ("imageUrl" in result && result.imageUrl) {
        const imageUrl = result.imageUrl;
        setItems((current) =>
          current.map((product) => (product.id === id ? { ...product, imageUrl } : product)),
        );
      } else if (result.error) {
        setPhotoErrors((current) => ({
          ...current,
          [id]: `${result.error} The old photo was kept.`,
        }));
      }
    } finally {
      setPhotoBusy((current) => ({ ...current, [id]: false }));
    }
  }

  async function removePhoto(id: string) {
    setPhotoErrors((current) => ({ ...current, [id]: "" }));
    setPhotoBusy((current) => ({ ...current, [id]: true }));
    try {
      const result = await saving(() =>
        removeCounterProductPhotoAction(id).catch(() => ({
          error: "The photo was not removed - the connection dropped.",
        })),
      );
      if (result.error) {
        setPhotoErrors((current) => ({ ...current, [id]: result.error! }));
      } else {
        setItems((current) =>
          current.map((product) => (product.id === id ? { ...product, imageUrl: null } : product)),
        );
      }
    } finally {
      setPhotoBusy((current) => ({ ...current, [id]: false }));
    }
  }

  async function remove(id: string) {
    const product = items.find((entry) => entry.id === id);
    if (!product) return;

    const position = items.indexOf(product);
    const quantity = quantities[id];
    const price = prices[id];

    // Gone at once, as asked - and its quantity with it, so a removed product
    // can never ride along into the sale.
    setGone((current) => new Set([...current, id]));
    setItems((current) => current.filter((entry) => entry.id !== id));
    setQuantities((current) => withoutKey(current, id));
    setPrices((current) => withoutKey(current, id));
    setNotice(null);

    const result = await saving(() =>
      deleteCounterProductAction(id).catch(() => ({
        error: "Nothing was deleted - the connection dropped.",
        outcome: undefined,
      })),
    );

    if (result.error) {
      setGone((current) => new Set([...current].filter((entry) => entry !== id)));
      setItems((current) => {
        if (current.some((entry) => entry.id === id)) return current;
        const next = [...current];
        next.splice(Math.min(position, next.length), 0, product);
        return next;
      });
      if (quantity !== undefined) setQuantities((current) => ({ ...current, [id]: quantity }));
      if (price !== undefined) setPrices((current) => ({ ...current, [id]: price }));
      setNotice({ tone: "attention", text: `${product.name} was not deleted. ${result.error}` });
      return;
    }

    if (result.outcome === "archived") {
      setNotice({
        tone: "info",
        text: `${product.name} has been sold before, so it was hidden rather than erased. Old sales still show it exactly as they were, and it can be shown again from the Products screen.`,
      });
    }
  }

  async function add(form: FormData): Promise<AddCounterProductResult> {
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const problem = photoFileProblem(photo);
      if (problem) return { fieldErrors: { photo: problem } };
      try {
        form.set("photo", await squarePhoto(photo));
      } catch {
        return { fieldErrors: { photo: "That photo could not be read. Try another one." } };
      }
    } else {
      form.delete("photo");
    }

    const result = await saving(() =>
      addCounterProductAction(form).catch(() => ({
        error: "The product was not saved - the connection dropped.",
      })),
    );

    rememberCategory("createdCategory" in result ? result.createdCategory : undefined);
    const product = "product" in result ? result.product : undefined;
    if (product) {
      // At the bottom, as the server placed it - unless the fresh list from
      // the server got here first.
      setItems((current) =>
        current.some((entry) => entry.id === product.id) ? current : [...current, product],
      );
    }
    return result;
  }

  /**
   * A new name or price. Shown once the server has saved it - the dialog
   * waits for the answer, so the row never shows a price that is not real.
   * Any quantity already typed stays, and its line total follows the new price.
   */
  async function edit(id: string, form: FormData): Promise<UpdateCounterProductResult> {
    form.set("productId", id);
    const result = await saving(() =>
      updateCounterProductAction(form).catch(() => ({
        error: "Nothing was saved - the connection dropped.",
      })),
    );

    rememberCategory("createdCategory" in result ? result.createdCategory : undefined);
    const saved = "product" in result ? result.product : undefined;
    if (saved) {
      setItems((current) =>
        current.map((product) =>
          product.id === id
            ? {
                ...product,
                name: saved.name,
                priceCentavos: saved.priceCentavos,
                manualPrice: saved.manualPrice,
                categoryId: saved.categoryId === undefined ? product.categoryId : saved.categoryId,
              }
            : product,
        ),
      );
    }
    return result;
  }

  /** A category made on the way, from "+ New category" in a product form. */
  function rememberCategory(category: PosCategory | undefined) {
    if (!category) return;
    setCategories((current) =>
      current === null || current.some((entry) => entry.id === category.id)
        ? current
        : byName([...current, category]),
    );
  }

  /** Makes a category, or renames one. Shown once the server has saved it. */
  async function saveCategory(form: FormData): Promise<{ error?: string }> {
    const result = await saving(() =>
      saveProductCategoryAction(form).catch(() => ({
        error: "Nothing was saved - the connection dropped.",
        category: undefined,
      })),
    );
    const category = result.category;
    if (category) {
      setCategories((current) =>
        current === null
          ? current
          : byName([...current.filter((entry) => entry.id !== category.id), category]),
      );
    }
    return { error: result.error };
  }

  /** Deletes a category. Its products stay, with no category. */
  async function deleteCategory(id: string): Promise<{ error?: string }> {
    const result = await saving(() =>
      deleteProductCategoryAction(id).catch(() => ({
        error: "Nothing was deleted - the connection dropped.",
      })),
    );
    if (!result.error) {
      setCategories((current) => current?.filter((entry) => entry.id !== id) ?? current);
      setItems((current) =>
        current.map((product) =>
          product.categoryId === id ? { ...product, categoryId: null } : product,
        ),
      );
    }
    return result;
  }

  return {
    items,
    categories,
    saveCategory,
    deleteCategory,
    quantities,
    prices,
    setQuantity,
    setPrice,
    clearQuantities,
    reorder,
    changePhoto,
    removePhoto,
    remove,
    add,
    edit,
    photoBusy,
    photoErrors,
    notice,
    dismissNotice: () => setNotice(null),
  };
}

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}
