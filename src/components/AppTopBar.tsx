import Link from "next/link";

import { ThemeToggle } from "./ThemeToggle";
import { SwitchUserButton } from "./SwitchUserButton";
import { Wordmark } from "./ui";
import type { SignedInUser } from "@/lib/auth/dal";
import { visibleSections } from "@/lib/auth/navigation";

/**
 * The black frosted top bar for signed-in screens (spec 3.1).
 *
 * Only shows the sections this person may open. Hiding a link is a courtesy,
 * not the security boundary - the database refuses the data either way.
 */
export function AppTopBar({ user }: { user: SignedInUser }) {
  const sections = visibleSections(user);

  return (
    <header className="sticky top-0 z-50 bg-topbar text-topbar-ink backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium">{user.fullName}</span>
              <span className="block text-white/50 capitalize">{user.role}</span>
            </span>
            <SwitchUserButton />
            <ThemeToggle />
          </div>
        </div>

        {/* Scrolls sideways on a phone rather than wrapping into two rows. */}
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.comingSoon ? "/" : section.href}
              aria-disabled={section.comingSoon}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
                section.comingSoon
                  ? "cursor-not-allowed text-white/30"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {section.label}
              {section.comingSoon ? (
                <span className="ml-1.5 text-[10px] text-white/30">
                  Phase {section.phase}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
