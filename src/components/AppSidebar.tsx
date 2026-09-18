"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Wordmark } from "./ui";
import { NAV_GROUPS, type NavSection } from "@/lib/auth/navigation";

/**
 * The black rail of sections (spec 3.1).
 *
 * The sections used to be pills in the top bar. There are twenty-three of them
 * once an owner signs in, which needed two wrapped rows on a desktop and a
 * sideways scroll everywhere else — so the last few were reachable only by
 * hunting for them. Down the side they all fit at once, under the three
 * headings the list was already grouped by.
 *
 * Black in both themes, like the top bar, so the shop's screens keep the same
 * frame whichever look the owner picked.
 */

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SectionLinks({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col pb-6">
      {NAV_GROUPS.map((group) => {
        const inGroup = sections.filter((section) => section.group === group);
        if (inGroup.length === 0) return null;

        return (
          <div key={group} className="flex flex-col">
            <h2 className="px-6 pt-6 pb-2 text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
              {group}
            </h2>
            {inGroup.map((section) => {
              const current = isCurrent(pathname, section.href);
              return (
                <Link
                  key={section.href}
                  href={section.comingSoon ? "/overview" : section.href}
                  onClick={onNavigate}
                  aria-current={current ? "page" : undefined}
                  aria-disabled={section.comingSoon}
                  /* py-2.5 on a 14px line clears the 24px touch target. */
                  className={`border-l-2 px-6 py-2.5 text-sm transition-colors ${
                    current
                      ? "border-accent bg-white/5 font-medium text-sidebar-ink"
                      : section.comingSoon
                        ? "cursor-not-allowed border-transparent text-white/25"
                        : "border-transparent text-white/60 hover:border-accent/50 hover:text-sidebar-ink"
                  }`}
                >
                  {section.label}
                  {section.comingSoon ? (
                    <span className="ml-1.5 text-[10px] text-white/25">
                      Phase {section.phase}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** The permanent rail, from `lg` up. */
export function AppSidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <aside
      data-app-sidebar
      className="hidden w-60 shrink-0 border-r border-white/10 bg-sidebar lg:block"
    >
      <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto">
        <Link href="/overview" className="px-6 py-5 text-sidebar-ink">
          <Wordmark />
        </Link>
        <SectionLinks sections={sections} pathname={pathname} />
      </div>
    </aside>
  );
}

/**
 * The button and drawer for narrow screens, rendered inside the top bar.
 *
 * The drawer is portalled into <body>. The top bar has a backdrop blur, and a
 * blurred element becomes a containing block — a `fixed inset-0` child would
 * measure itself against the bar rather than the screen, which is the bug that
 * put the bill reminder off the top of the page.
 */
export function AppSidebarButton({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /*
    No `mounted` flag is needed: the drawer only exists once someone has tapped
    the button, which cannot happen during server rendering, so `document` is
    always there by the time this runs. Each link closes it on the way out, so
    it never survives a navigation either.
  */
  const drawer = open
      ? createPortal(
          <div className="fixed inset-0 z-[60] lg:hidden">
            <button
              type="button"
              aria-label="Close the menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/70"
            />
            <div className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-sidebar">
              <div className="px-6 py-5 text-sidebar-ink">
                <Wordmark />
              </div>
              <SectionLinks
                sections={sections}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}
        className="-ml-2 rounded-control p-2 text-topbar-ink/80 transition-colors hover:bg-white/10 hover:text-topbar-ink lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M3 6h16M3 11h16M3 16h16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {drawer}
    </>
  );
}
