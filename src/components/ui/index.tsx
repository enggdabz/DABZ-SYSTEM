import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* ------------------------------------------------------------------ layout */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="label-caps text-brand">{eyebrow}</p> : null}
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <h3 className="label-caps text-fg-subtle">{title}</h3>
      {actions}
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-card p-5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
      <p className="label-caps text-fg-subtle">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-fg-muted">{message}</p>
      {hint ? <p className="mt-1 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- table */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
}: {
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`label-caps border-b border-line px-5 py-3 font-semibold text-fg-subtle ${
        numeric ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  muted = false,
}: {
  children: ReactNode;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-5 py-3 ${numeric ? "text-right tabular-nums" : ""} ${
        muted ? "text-fg-muted" : "text-fg"
      }`}
    >
      {children}
    </td>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

/* ------------------------------------------------------------------ badges */

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-canvas text-fg-muted",
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-brand-soft text-brand-strong dark:bg-red-950 dark:text-red-300",
  brand: "bg-brand text-white",
};

/** Status is never colour alone — the label always carries the meaning. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- actions */

const BUTTON_BASE =
  "label-caps inline-flex items-center justify-center rounded-lg px-4 py-2.5 transition disabled:opacity-60";

const BUTTON_VARIANT = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-line text-fg-muted hover:border-brand hover:text-brand",
  danger: "border border-brand text-brand hover:bg-brand hover:text-white",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_VARIANT }) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON_VARIANT }) {
  return (
    <Link {...props} className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`} />
  );
}

/* ------------------------------------------------------------------- forms */

export const fieldClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label-caps text-fg-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-fg-subtle">{hint}</span> : null}
    </label>
  );
}

export function Alert({
  children,
  tone = "bad",
}: {
  children: ReactNode;
  tone?: "bad" | "good";
}) {
  return (
    <p
      role="alert"
      className={`rounded-lg border-l-2 px-3 py-2 text-sm ${
        tone === "bad"
          ? "border-brand bg-brand-soft text-brand-strong"
          : "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      {children}
    </p>
  );
}
