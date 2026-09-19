/**
 * What every signed-in screen shows while it is being fetched.
 *
 * This single file sits beside `(app)/layout.tsx`, so it wraps EVERY screen
 * under it in one Suspense boundary. That buys two separate things:
 *
 * 1. The screen stops looking broken. Every screen here is dynamic - it calls
 *    `connection()` and reads live figures - so a click always costs a trip to
 *    the server. Without a boundary the browser simply sat on the OLD screen
 *    until the new one was completely ready, which reads as a dead tap rather
 *    than as loading. The rail and the top bar stay put and stay usable; only
 *    the panel below swaps to this outline.
 *
 * 2. Next.js starts prefetching the sections. Without Cache Components a
 *    dynamic route is not prefetched AT ALL unless it has a loading boundary -
 *    with one, the shell down to this file is fetched as each link comes into
 *    view, so the tap itself has nothing left to wait for but the figures.
 *
 * It is deliberately generic. Every screen in the system is a heading over a
 * stack of cards, so one honest outline of that shape beats twenty-three
 * bespoke ones that drift out of step with the screens they imitate.
 *
 * The pulse is handled by `prefers-reduced-motion` in globals.css, which
 * already flattens every animation in the system for anyone who asks for that.
 */

/** One grey bar standing in for a line of text. */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-4 rounded-control bg-ink/10 ${className}`} />;
}

/** The outline of a card: a heading bar over a few lines. */
function CardOutline({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60">
      <Bar className="h-5 w-1/3" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, line) => (
          <Bar
            key={line}
            /* Uneven widths: a stack of identical bars reads as a table. */
            className={line % 3 === 2 ? "w-1/2" : line % 3 === 1 ? "w-5/6" : "w-full"}
          />
        ))}
      </div>
    </div>
  );
}

export default function AppLoading() {
  return (
    <>
      {/*
        The bars below are decoration, so they are hidden from a screen reader
        and this one line is announced instead. Without it the screen would go
        silent between the tap and the figures arriving.
      */}
      <p role="status" className="sr-only">
        Loading this screen
      </p>

      <div className="animate-pulse space-y-8" aria-hidden="true">
        {/* The heading every screen opens with. */}
        <div className="space-y-3">
          <Bar className="h-8 w-2/3 sm:w-1/3" />
          <Bar className="w-1/2 sm:w-1/4" />
        </div>

        {/*
          Two side by side from `lg` up, because that is where the screens
          themselves switch to a two-column grid - an outline that reflows
          differently from the screen it precedes causes a jump on arrival.
        */}
        <div className="grid gap-5 lg:grid-cols-2">
          <CardOutline />
          <CardOutline lines={2} />
        </div>

        <CardOutline lines={4} />
      </div>
    </>
  );
}
