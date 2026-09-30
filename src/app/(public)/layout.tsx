import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { TAP_AREA, Wordmark } from "@/components/ui";

/**
 * The frame around the page about the whole shop (Phase 9, moved to `/about`
 * on 22 September 2026 when the online catalogue took the homepage).
 *
 * Deliberately NOT the app's top bar. A customer has no sections to navigate,
 * no account and nothing to sign out of; giving them a staff menu with fifteen
 * greyed-out links would only look broken. What they get is the name, a way
 * into the page, the way back to the shop they arrived through, and - in the
 * footer, small - the way in for staff.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header
        data-app-chrome
        className="sticky top-0 z-50 bg-topbar text-topbar-ink backdrop-blur-xl"
      >
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {/*
              Back to the catalogue. The wordmark goes there too, but a
              wordmark is not a signpost: this page is one link off the front
              door now, and the way back has to say so in words.
            */}
            <Link
              href="/"
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              Order online
            </Link>
            <a
              href="#what-we-do"
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              What we do
            </a>
            <a
              href="#contact"
              className="whitespace-nowrap rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
            >
              Get in touch
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer
        data-app-chrome
        className="border-t border-line/60 px-4 py-8 text-sm text-muted sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <p>
            Dabz Printshoppe &middot; Dabz Apparel &middot; DabzTech Solutions
            <span className="block text-xs">
              San Carlos City, Pangasinan &middot; since 18 June 2017
            </span>
          </p>
          {/* Small and at the bottom: this door is for staff, not customers. */}
          <Link href="/login" className={`text-xs underline ${TAP_AREA}`}>
            Staff sign in
          </Link>
        </div>
      </footer>
    </>
  );
}
