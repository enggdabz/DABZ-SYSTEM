"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui";

export interface DueSoonBill {
  id: string;
  name: string;
  amountLabel: string;
  statusLabel: string;
  periodLabel: string;
  overdue: boolean;
}

const STORAGE_KEY = "dabz-bills-reminder-shown";

/**
 * The 5-day bill reminder (spec 12.1).
 *
 * Shows itself once a day when the owner or an admin opens the system, and can
 * be reopened from the button in the header any time. "Once a day" is
 * remembered per browser, which is the right grain: it should not nag on every
 * page, and it should still appear on the shared counter computer for whoever
 * opens it first.
 */
export function BillsDueSoon({ bills }: { bills: DueSoonBill[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (bills.length === 0) return;

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });

    /*
      Opening in an effect is on purpose, and is the one place in this codebase
      that does it. Whether the reminder has already been shown today lives in
      this browser's storage, which does not exist while the page is rendered
      on the server - so it cannot be known any earlier than this. Deriving it
      during render instead would make the server and the browser disagree
      about whether the dialog is open.
    */
    try {
      if (localStorage.getItem(STORAGE_KEY) !== today) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state, see above
        setOpen(true);
        localStorage.setItem(STORAGE_KEY, today);
      }
    } catch {
      // Private browsing blocks storage; show it rather than hide it, since a
      // missed bill costs more than a repeated reminder.
      setOpen(true);
    }
  }, [bills.length]);

  if (bills.length === 0) return null;

  const overdueCount = bills.filter((bill) => bill.overdue).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-attention-bg px-3 py-1.5 text-sm font-medium text-attention ring-1 ring-attention/30"
      >
        <span aria-hidden="true">{"⚠"}</span>
        <span className="hidden sm:inline">Bills due soon</span>
        <span>({bills.length})</span>
        {/* The words are dropped on a phone; the icon and count carry it. */}
        <span className="sr-only sm:hidden">bills due soon</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Bills due soon"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-lg ring-1 ring-line/60">
            <h2 className="text-xl font-semibold tracking-tight">
              {overdueCount > 0
                ? `${overdueCount} bill${overdueCount === 1 ? "" : "s"} already overdue`
                : "Bills due soon"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Overdue, or due within the next 5 days.
            </p>

            <ul className="mt-5 divide-y divide-line/60">
              {bills.map((bill) => (
                <li
                  key={`${bill.id}-${bill.periodLabel}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                >
                  <span>
                    <span className="font-medium">{bill.name}</span>
                    <span className="block text-xs text-muted">
                      {bill.periodLabel}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold">{bill.amountLabel}</span>
                    <span className="block text-xs text-attention">
                      <span aria-hidden="true">{"⚠"} </span>
                      {bill.statusLabel}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/bills");
                }}
              >
                Open the bills screen
              </Button>
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                Later
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
