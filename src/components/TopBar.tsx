import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./ui";

/**
 * The black top bar with a frosted-glass effect (spec 3.1).
 *
 * The Dabz logos are designed for black backgrounds, so this is where they
 * belong (spec 3.3). The brand lockup itself lives in `Wordmark` so this bar
 * and the app chrome cannot drift apart.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-topbar text-topbar-ink backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />

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
