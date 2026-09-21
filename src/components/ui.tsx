/**
 * The small set of building blocks every screen is made from (spec 3.1).
 *
 * Keeping them here means a button looks the same everywhere, and a change to
 * the house style is one edit rather than fifty. All colours come from the
 * tokens in globals.css - no hex values in components.
 */
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";

export function Card({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60 ${className}`}
    >
      {title ? (
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      ) : null}
      {description ? (
        <p className="mt-1 text-sm text-muted">{description}</p>
      ) : null}
      <div className={title || description ? "mt-5" : ""}>{children}</div>
    </section>
  );
}

type ButtonVariant =
  | "primary"
  | "secondary"
  | "feature"
  | "quiet"
  | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  // Dabz red is the one accent, reserved for the main action on a screen.
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "bg-ink/5 text-ink ring-1 ring-line hover:bg-ink/10",
  /*
    A second action the screen wants noticed.

    A screen has one main action and it wears the filled red; a second red
    button would leave neither of them meaning anything. But grey is not
    always enough either - the owner could not find the way to the project
    calendar beside the red "New job order". So this borrows the accent as a
    tint and a frame rather than a fill: unmistakably an action, clearly not
    THE action.

    The LABEL stays `text-ink`, and that part is not a style choice. Written
    the obvious way - accent text on an accent tint, the shape of
    `Tag tone="accent"` - it measures 3.06:1 against the dark surface, under
    the 4.5:1 floor, and dark is the shop's default look. A button nobody can
    read is a worse answer to "make it more visible" than the underlined link
    it replaced. The frame does the attracting; the text does the telling.
  */
  feature: "bg-accent/10 text-ink ring-1 ring-accent/40 hover:bg-accent/20",
  quiet: "text-muted hover:text-ink",
  // Not red: red is the brand colour here, so a destructive action is marked
  // by its label and an outline instead (spec 3.2).
  danger: "bg-transparent text-attention ring-1 ring-attention/40 hover:bg-attention-bg",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The button shape, for the things that cannot be a `<button>`.
 *
 * A link that moves you to another screen is a link - it has an href, it opens
 * in a new tab on a middle click, a screen reader announces it as a link - but
 * it can still be shaped like a button. This hands out the same classes so a
 * `<Link>` styled as a button cannot drift from the real ones.
 */
export function buttonClasses(variant: ButtonVariant = "primary"): string {
  return `${BUTTON_BASE} ${BUTTON_STYLES[variant]}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={`${buttonClasses(variant)} ${className}`} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span className="mt-1.5 flex items-start gap-1.5 text-xs text-attention">
          <span aria-hidden="true">{"⚠"}</span>
          <span>{error}</span>
        </span>
      ) : null}
    </label>
  );
}

/*
  The focus ring is deliberately NOT Dabz red. A red outline around an empty
  box reads as "you got this wrong", and red is the brand colour here, so it
  would collide with the warning rules in spec 3.2. A strong neutral ring is
  unambiguous and still clearly visible in both themes.
*/
const INPUT_CLASS =
  "w-full rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${INPUT_CLASS} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${INPUT_CLASS} ${className}`} />;
}

/*
  Tappable text.

  Underlined text on its own is about 20px tall, and the design rules ask for
  at least 24px on anything a person taps - a rule that was quietly broken by
  every "Open the bills screen" link in the system until a browser measured
  them. The padding here IS the fix: it is the part a thumb lands on.

  Three things worth knowing before changing it.

  It deliberately does NOT use `inline-block`. Half of these links sit inside a
  sentence, and an inline-block link cannot break across two lines - a long one
  would push itself onto a line of its own. Vertical padding on an ordinary
  inline element does not change the line height, so the paragraph does not
  reflow, and the padding still receives the tap.

  `py-1.5` rather than `py-1` because an inline box is sized by the FONT, not
  by the `line-height` class: a `text-xs` link with `py-1` measures 23px, one
  pixel short. Six pixels each side clears 24px at every size the app uses.

  The negative margin cancels the horizontal padding, so a link inside a
  sentence still lines up with the words either side of it.

  It is hit area only - no colour, no underline. Those stay where the link is
  written, so adding this changes nothing about how a screen looks, only how
  easy it is to hit.

  All of that was measured in a browser rather than reasoned about. No unit
  test can see a pixel; `src/components/tap-targets.test.ts` only checks that
  nobody forgot to add it.
*/
export const TAP_AREA = "-mx-1 px-1 py-1.5";

type NoticeTone = "success" | "attention" | "info";

/**
 * A message strip. Warnings always carry an icon and a word as well as a
 * colour (spec 3.2), so they can never be mistaken for a red brand button.
 */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
}) {
  const style = {
    success: { icon: "✓", className: "text-success ring-success/30" },
    attention: { icon: "⚠", className: "text-attention ring-attention/40 bg-attention-bg" },
    info: { icon: "ℹ", className: "text-muted ring-line" },
  }[tone];

  return (
    <div className={`rounded-card px-4 py-3 text-sm ring-1 ${style.className}`}>
      <p className="flex items-center gap-2 font-medium">
        <span aria-hidden="true">{style.icon}</span>
        <span>{title}</span>
      </p>
      {children ? <div className="mt-1 text-ink/80">{children}</div> : null}
    </div>
  );
}

/**
 * A panel that opens, whose handle is a real button rather than a line of
 * small grey text.
 *
 * Every screen that edits something keeps the form folded away - eleven open
 * four-field forms bury the figures the screen exists to show. But the handle
 * was written as a `text-sm` summary, which measures about 20px and reads as a
 * caption, and the owner reasonably reported that there was no way to edit a
 * bill: the way in did not look like anything. So the handle is now shaped and
 * sized like the other buttons on the card.
 *
 * `list-none` plus the WebKit rule removes the browser's own triangle, which
 * would otherwise sit inside the button; the caret is drawn instead so it can
 * turn as the panel opens.
 */
export function Disclosure({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-control bg-ink/5 px-4 py-2 text-sm font-medium text-ink ring-1 ring-line transition-colors hover:bg-ink/10 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-muted transition-transform group-open:rotate-90"
        >
          {"▸"}
        </span>
        {label}
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}

/** A small label, e.g. a role or a status. */
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "attention";
}) {
  const className = {
    neutral: "bg-ink/5 text-muted ring-line",
    accent: "bg-accent/10 text-accent ring-accent/20",
    success: "bg-success/10 text-success ring-success/20",
    attention: "bg-attention-bg text-attention ring-attention/30",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * The Dabz crest plus wordmark, for the top bar and the login screen.
 *
 * The crest rather than the full lockup: public/logo/README.md puts the
 * lockup's legible floor at 56px and the crest's at 48px, and the chrome this
 * sits in is 64px tall including its padding. The wordmark stays live text so
 * it renders crisply at this size instead of as a downscaled raster, and so
 * the subtitle can vary.
 *
 * Every caller places this on a dark ground (bg-topbar, bg-sidebar, or a
 * bg-black card), which the artwork requires: the tagline is near-white and
 * scores 1.15:1 on white.
 */
export function Wordmark({ subtitle = "PRINTSHOPPE" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      {/*
        Decorative: the name is already beside it as text, so the crest is
        hidden from screen readers rather than repeating it. Height only,
        never both dimensions, or the artwork stretches.
      */}
      <Image
        src="/logo/logo-mark.png"
        alt=""
        aria-hidden="true"
        width={512}
        height={512}
        loading="eager"
        className="h-12 w-auto"
      />
      <span className="flex flex-col leading-none">
        <span className="text-base font-semibold tracking-tight">DABZ</span>
        <span className="text-[10px] font-medium tracking-[0.18em] opacity-60">
          {subtitle}
        </span>
      </span>
    </div>
  );
}
