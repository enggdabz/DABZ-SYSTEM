"use client";

/**
 * The expense pop-up (spec 11, open decision 17.14).
 *
 * The whole design is built around one number in the specification: recording
 * an expense should take under ten seconds. Anything slower and it goes on a
 * scrap of paper "for later" - and the month ends up looking more profitable
 * than it was, because half its costs were never typed in.
 *
 * So it opens from the top bar on any screen, the quick picks already know the
 * category and the division, and the only thing that always has to be typed is
 * the amount.
 */
import { useActionState, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { DIVISION_IDS, divisionName } from "@/lib/divisions";
import {
  QUICK_EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  type ExpensePreset,
} from "@/lib/expenses";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { centavosToDecimalString } from "@/lib/money";

import { recordExpenseAction, type ExpenseState } from "@/app/(app)/expenses/actions";

const TAGS = [...DIVISION_IDS, "whole_shop"] as const;

export function QuickExpense({
  presets,
  approvalHint,
  suppliers = [],
}: {
  presets: ExpensePreset[];
  /** What happens above the staff limit. Null for Owner/Admin, who have none. */
  approvalHint: string | null;
  suppliers?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ExpenseState, FormData>(
    recordExpenseAction,
    {},
  );

  // Which quick pick is filling the form. Kept in state rather than written
  // into the inputs, so the person can still change any of it afterwards.
  const [picked, setPicked] = useState<ExpensePreset | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Closing clears the pick here rather than in an effect: the dialog is only
  // ever closed by one of these buttons, so there is nothing to synchronise.
  function close() {
    setOpen(false);
    setPicked(null);
  }

  function choose(preset: ExpensePreset) {
    setPicked(preset);
    // Straight to the one thing that always has to be typed.
    window.setTimeout(() => amountRef.current?.focus(), 0);
  }

  const activePresets = presets.filter((preset) => preset.active);

  const dialog = (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Record an expense"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-lg ring-1 ring-line/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Record an expense</h2>
            <p className="mt-1 text-sm text-muted">
              Money that left the shop. Tap a quick pick, type the amount, done.
            </p>
          </div>
          <Button type="button" variant="quiet" onClick={close}>
            Close
          </Button>
        </div>

        {state.success ? (
          <div className="mt-5 space-y-3">
            <Notice tone="success" title={state.success} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setPicked(null)}>
                Add another
              </Button>
              <Button type="button" variant="secondary" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={submit} className="mt-5 space-y-4">
            {activePresets.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Quick picks</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => choose(preset)}
                      aria-pressed={picked?.id === preset.id}
                      className={`rounded-control px-3 py-2 text-sm ring-1 transition-colors ${
                        picked?.id === preset.id
                          ? "bg-accent text-on-accent ring-accent"
                          : "bg-surface-sunken text-ink ring-line hover:ring-accent/50"
                      }`}
                    >
                      {preset.label}
                      {preset.defaultAmountCentavos !== null ? (
                        <span className="ml-1.5 opacity-70">
                          ₱{centavosToDecimalString(preset.defaultAmountCentavos)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Field label="Amount" error={state.fieldErrors?.amount}>
              <Input
                ref={amountRef}
                name="amount"
                inputMode="decimal"
                placeholder="e.g. 480"
                // Keyed on the pick so choosing one refills the box, while
                // anything typed afterwards is left alone.
                key={`amount-${picked?.id ?? "none"}`}
                defaultValue={
                  picked?.defaultAmountCentavos != null
                    ? centavosToDecimalString(picked.defaultAmountCentavos)
                    : ""
                }
                required
                autoFocus
              />
            </Field>

            <Field label="Note" hint="Optional. What it was, in your own words.">
              <Input name="note" placeholder="e.g. 20 reams bond paper" />
            </Field>

            {approvalHint ? <Notice tone="info" title={approvalHint} /> : null}
            {state.error ? <Notice tone="attention" title={state.error} /> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Record expense"}
              </Button>
              <Button type="button" variant="quiet" onClick={close}>
                Cancel
              </Button>
            </div>

            {/*
              Folded away, and BELOW the button on purpose.

              A quick pick already knows the category and the division, and
              cash out of the drawer is what nearly every expense is - so on a
              phone these three would push "Record expense" off the bottom of
              the screen for a choice that was already right. The summary line
              still shows what will be saved, so nothing is hidden, only
              tucked away.
            */}
            <details className="rounded-card bg-surface-sunken px-4 py-3 ring-1 ring-line/60">
              <summary className="cursor-pointer text-sm text-muted">
                {expenseCategoryLabel(picked?.category ?? "materials_supplies")}
                {" · "}
                {divisionName(picked?.tag ?? "whole_shop")}
                {" · cash drawer — change"}
              </summary>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="What for" error={state.fieldErrors?.category}>
                  <Select
                    name="category"
                    key={`category-${picked?.id ?? "none"}`}
                    defaultValue={picked?.category ?? "materials_supplies"}
                  >
                    {QUICK_EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {expenseCategoryLabel(category)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Which part of the shop" error={state.fieldErrors?.tag}>
                  <Select
                    name="tag"
                    key={`tag-${picked?.id ?? "none"}`}
                    defaultValue={picked?.tag ?? "whole_shop"}
                  >
                    {TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {divisionName(tag)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Paid with" error={state.fieldErrors?.source}>
                  <Select name="source" defaultValue="cash_drawer">
                    {MONEY_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {MONEY_SOURCE_LABELS[source]}
                      </option>
                    ))}
                  </Select>
                </Field>

                {suppliers.length > 0 ? (
                  <Field label="Supplier" hint="Optional.">
                    <Select name="supplierId" defaultValue="">
                      <option value="">Not recorded</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            </details>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-topbar-ink ring-1 ring-white/15 hover:bg-white/15"
      >
        <span aria-hidden="true">+</span>
        <span className="hidden sm:inline">Expense</span>
        <span className="sr-only sm:hidden">Record an expense</span>
      </button>

      {/*
        Into <body>, not here. This sits inside the top bar, and the bar has a
        backdrop blur - which makes it a containing block, so a `fixed` child
        would measure itself against the bar and hang off the top of the
        screen. See the same note in BillsDueSoon.
      */}
      {open ? createPortal(dialog, document.body) : null}
    </>
  );
}
