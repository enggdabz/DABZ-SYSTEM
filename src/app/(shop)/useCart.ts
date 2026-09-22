"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  CART_CHANGED_EVENT,
  parseCart,
  writeCart,
  CART_STORAGE_KEY,
  type Cart,
  type CartItem,
} from "@/lib/online/cart";

/**
 * The customer's order, as a React hook.
 *
 * Written with `useSyncExternalStore` rather than state-plus-effect, because
 * that is exactly what this is: `localStorage` is an external store, and the
 * cart may be changed by another component, another tab, or the customer
 * clearing their site data. Subscribing to it is the supported way to read
 * something outside React without a render loop.
 *
 * ON THE SERVER IT IS ALWAYS EMPTY, deliberately. The server has no way of
 * knowing what is in somebody's browser storage, so rendering a count there
 * would be a guess that the browser then corrects - a hydration mismatch, and
 * a number that visibly changes under the customer's eyes. `ready` is how a
 * component tells "empty" from "not read yet" and shows nothing until it
 * knows.
 */

const EMPTY: Cart = [];

/*
  `getSnapshot` is called on every render, and React compares what comes back
  by reference - so it has to hand back the SAME array until the stored text
  actually changes, or the page re-renders for ever.
*/
let cachedRaw: string | null = null;
let cachedCart: Cart = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    // Private browsing, blocked storage. An unreadable cart is an empty one.
    return null;
  }
}

function snapshot(): Cart {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedCart = parseCart(raw);
  }
  return cachedCart;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CART_CHANGED_EVENT, onChange);
  // Another tab of the same shop counts too.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const serverSnapshot = (): Cart => EMPTY;

export function useCart(): {
  cart: Cart;
  /** False until the browser has read storage. Not the same as "empty". */
  ready: boolean;
  setCart: (cart: Cart) => void;
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
} {
  const cart = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const setCart = useCallback((next: Cart) => {
    writeCart(next);
  }, []);

  return {
    cart,
    ready,
    setCart,
    addItem: useCallback((item: CartItem) => writeCart([...snapshot(), item]), []),
    removeItem: useCallback(
      (key: string) => writeCart(snapshot().filter((line) => line.key !== key)),
      [],
    ),
  };
}
