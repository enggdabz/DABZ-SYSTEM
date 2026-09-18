import { ThemeToggle } from "./ThemeToggle";

/**
 * The black top bar with a frosted-glass effect (spec 3.1).
 *
 * The Dabz logos are designed for black backgrounds, so this is where they
 * belong once the owner sends the image files. Until then it shows a plain
 * text wordmark (spec 3.3).
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-topbar text-topbar-ink backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Stand-in for the crest logo: a red mark plus the wordmark. */}
          <span
            aria-hidden="true"
            className="h-7 w-2 rounded-full bg-accent"
          />
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-tight">DABZ</span>
            <span className="text-[10px] font-medium tracking-[0.18em] text-white/60">
              PRINTSHOPPE
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 sm:inline">
            Phase 0 &middot; Setup
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
