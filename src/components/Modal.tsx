"use client";

/**
 * A dialog that covers the screen.
 *
 * Portalled into <body>, for the reason written in AGENTS.md and at the top of
 * `BillsDueSoon`: the top bar has a backdrop blur, a blur makes an element a
 * containing block, and a `fixed inset-0` dialog left inside it would measure
 * itself against the BAR. This one is not rendered at all until it is opened,
 * which can only happen in the browser, so `document` is always there.
 *
 * Escape closes it, and so does the dimmed area - except while `busy`, so a
 * request in flight is never abandoned by a stray tap.
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HEADING_BOX } from "@/components/ui";

export function Modal({
  open,
  title,
  onClose,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => {
          if (!busy) onClose();
        }}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-lg ring-1 ring-line/60">
        <h2 className={`${HEADING_BOX} text-xl font-semibold tracking-tight`}>{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
