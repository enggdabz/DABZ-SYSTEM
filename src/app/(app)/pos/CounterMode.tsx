"use client";

/**
 * The switch at the top of the Counter: "Regular sale" or "Project".
 *
 * Both halves stay MOUNTED and one is hidden. Swapping them out would throw
 * away a half-built cart the moment somebody peeked at the other mode, and a
 * cart is exactly the thing nobody wants to type twice.
 */
import { useState, type ReactNode } from "react";

type Mode = "regular" | "project";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "regular", label: "Regular sale", hint: "Items paid for now" },
  {
    id: "project",
    label: "Project",
    hint: "A job with a due date and a balance",
  },
];

export function CounterMode({
  regular,
  project,
}: {
  regular: ReactNode;
  project: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("regular");

  return (
    <div className="space-y-6">
      <div
        role="radiogroup"
        aria-label="Kind of sale"
        className="inline-flex w-full max-w-md rounded-control bg-surface-sunken p-1 ring-1 ring-line sm:w-auto"
      >
        {MODES.map((entry) => {
          const selected = mode === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(entry.id)}
              title={entry.hint}
              className={`min-h-9 flex-1 rounded-control px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
                selected
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div hidden={mode !== "regular"}>{regular}</div>
      <div hidden={mode !== "project"}>{project}</div>
    </div>
  );
}
