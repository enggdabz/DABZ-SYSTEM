"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { TAP_AREA } from "@/components/ui";
import { cartPreview, cartToOrderItems, clearCart } from "@/lib/online/cart";
import { civilDateToISO, type CivilDate } from "@/lib/period";

import { placeOrderAction, type PlaceOrderState } from "../../../actions";
import { useCart } from "@/lib/online/useCart";

/**
 * Your details, and the one button that turns a cart into an order
 * (docs/spec.md 8.3).
 *
 * The order's LINES are sent as a hidden field rather than as form inputs,
 * because they are not something the customer types here - they are what they
 * chose on the product pages, and the server re-reads every price in them
 * anyway. What the customer types is above it, and every field is checked
 * twice: once here, for a sentence they can act on, and once in the database,
 * which is the boundary.
 *
 * The cart is cleared only AFTER the server has answered with an order
 * number. A cart cleared on submit and an order that then failed would leave
 * a customer with neither.
 */
export function CheckoutForm({
  earliest,
  minDaysAhead,
}: {
  earliest: CivilDate;
  minDaysAhead: number;
}) {
  const router = useRouter();
  const { cart, ready } = useCart();
  const preview = cartPreview(cart);
  const [method, setMethod] = useState<"pickup" | "delivery">("pickup");

  const [state, submit, pending] = useActionState<PlaceOrderState, FormData>(
    placeOrderAction,
    {},
  );

  useEffect(() => {
    if (!state.receiptToken) return;
    clearCart();
    router.replace(`/shop/order/received/${state.receiptToken}`);
  }, [state.receiptToken, router]);

  const errors = state.fieldErrors ?? {};
  const earliestISO = civilDateToISO(earliest);

  if (ready && cart.length === 0 && !state.receiptToken) {
    return (
      <div className="space-y-4">
        <p className="rounded-card bg-surface p-6 text-muted ring-1 ring-line/60">
          There is nothing in your order yet.
        </p>
        <Link href="/shop" className={`text-accent underline ${TAP_AREA}`}>
          Choose something <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-6">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(cartToOrderItems(cart))}
      />

      {/*
        The honeypot. Hidden from people and from screen readers, and left out
        of the tab order, so nothing but a script that fills in every input
        will ever put anything in it.
      */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Your name, or your team's name" error={errors.customerName}>
        <input
          name="customerName"
          required
          maxLength={80}
          autoComplete="name"
          className={inputClass}
        />
      </Field>

      <Field label="Mobile number" error={errors.mobile}>
        <input
          name="mobile"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="09171234567"
          className={inputClass}
        />
      </Field>

      <Field
        label="Facebook name"
        hint="So we can find your chat."
        error={errors.facebookName}
      >
        <input name="facebookName" maxLength={80} className={inputClass} />
      </Field>

      <Field
        label="Date you need it by"
        hint={
          minDaysAhead === 0
            ? "Today or later."
            : `The soonest we can take is ${minDaysAhead} day${minDaysAhead === 1 ? "" : "s"} from today.`
        }
        error={errors.dateNeeded}
      >
        <input
          name="dateNeeded"
          type="date"
          required
          min={earliestISO}
          defaultValue={earliestISO}
          className={inputClass}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">How will you get it?</legend>
        <div className="flex flex-wrap gap-3">
          {(["pickup", "delivery"] as const).map((option) => (
            <label
              key={option}
              className={`cursor-pointer rounded-control px-4 py-2.5 text-sm ${
                method === option ? "outline outline-2 outline-ink" : "ring-1 ring-line"
              }`}
            >
              <input
                type="radio"
                name="method"
                value={option}
                checked={method === option}
                onChange={() => setMethod(option)}
                className="sr-only"
              />
              {option === "pickup" ? "I will pick it up" : "Please deliver it"}
            </label>
          ))}
        </div>
        {errors.method ? <Problem>{errors.method}</Problem> : null}
      </fieldset>

      {method === "delivery" ? (
        <Field
          label="Delivery address"
          hint="We settle the delivery fee with you on Messenger."
          error={errors.address}
        >
          <textarea
            name="address"
            rows={2}
            maxLength={200}
            className={inputClass}
          />
        </Field>
      ) : null}

      <Field label="Anything else we should know?" error={errors.notes}>
        <textarea name="notes" rows={3} maxLength={500} className={inputClass} />
      </Field>

      <div className="space-y-1 rounded-card bg-seg px-4 py-3 text-sm">
        <p>
          {preview.pieces} piece{preview.pieces === 1 ? "" : "s"} in this order
        </p>
        <p className="text-muted">
          No payment is taken here. We confirm the price and down payment with
          you first.
        </p>
      </div>

      {state.error ? <Problem>{state.error}</Problem> : null}

      <button
        type="submit"
        disabled={pending || cart.length === 0}
        className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface disabled:opacity-50"
      >
        {pending ? "Sending…" : "Place order"}
      </button>
    </form>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-control bg-surface-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      {children}
      {error ? <Problem>{error}</Problem> : null}
    </label>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1.5 flex items-start gap-1.5 text-sm text-accent">
      <span aria-hidden="true">{"⚠"}</span>
      <span>{children}</span>
    </span>
  );
}
