"use client";

/**
 * The bell in the top bar: a person's own in-app messages.
 *
 * Deliberately simple (owner's request): a count, a list, a link on each
 * message. No email, no SMS, no push - those wait. Opening the panel marks
 * everything read, so the count is "since you last looked".
 *
 * The panel is portalled into <body> for the reason at the top of
 * `BillsDueSoon`: the top bar's backdrop blur would otherwise make `fixed`
 * measure against the bar. It only exists once opened, which cannot happen
 * during server rendering.
 */
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { markNotificationsReadAction } from "@/app/(app)/bell-actions";
import { TAP_AREA, HEADING_BOX } from "@/components/ui";
import { formatManilaDateTime } from "@/lib/datetime";

export interface BellNotification {
  id: string;
  message: string;
  href: string | null;
  createdAt: string;
  read: boolean;
}

export function NotificationBell({
  notifications,
}: {
  notifications: BellNotification[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const unread = notifications.filter((entry) => !entry.read).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const show = () => {
    setOpen(true);
    if (unread > 0) startTransition(() => markNotificationsReadAction());
  };

  const panel = open
    ? createPortal(
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close notifications"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="absolute inset-x-4 top-[4.5rem] max-h-[70vh] overflow-y-auto rounded-card bg-surface p-4 shadow-lg ring-1 ring-line/60 sm:left-auto sm:w-96"
          >
            <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>
              Notifications
            </h2>
            {notifications.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line/60">
                {notifications.map((entry) => (
                  <li key={entry.id} className="py-3 text-sm">
                    {entry.href ? (
                      <Link
                        href={entry.href}
                        onClick={() => setOpen(false)}
                        className={`block underline-offset-2 hover:underline ${TAP_AREA}`}
                      >
                        {entry.message}
                      </Link>
                    ) : (
                      <p>{entry.message}</p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {formatManilaDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={
          unread > 0 ? `Notifications, ${unread} new` : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-control p-2 text-topbar-ink/80 transition-colors hover:bg-white/10 hover:text-topbar-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5ZM10 19a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold leading-4 text-on-gold"
          >
            {unread}
          </span>
        ) : null}
      </button>
      {panel}
    </>
  );
}
