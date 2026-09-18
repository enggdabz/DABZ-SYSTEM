"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Brand } from "@/components/brand";
import type { Module } from "@/lib/modules";

type NavItem = Pick<Module, "key" | "href" | "short" | "ready">;

function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col">
      <p className="label-caps px-6 pb-3 pt-6 text-brand">Pages</p>

      <Link
        href="/admin"
        onClick={onNavigate}
        aria-current={pathname === "/admin" ? "page" : undefined}
        className={`label-caps border-l-2 px-6 py-3 transition ${
          pathname === "/admin"
            ? "border-brand bg-white/5 text-white"
            : "border-transparent text-zinc-400 hover:border-brand/50 hover:text-white"
        }`}
      >
        Dashboard
      </Link>

      {items.map((item) => {
        const active = pathname.startsWith(item.href);

        // An unbuilt module is rendered as text, not a link — it has no route
        // to navigate to yet.
        if (!item.ready) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              className="label-caps flex items-center justify-between border-l-2 border-transparent px-6 py-3 text-zinc-600"
            >
              {item.short}
              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[0.5625rem] font-medium tracking-normal text-zinc-400">
                Soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`label-caps border-l-2 px-6 py-3 transition ${
              active
                ? "border-brand bg-white/5 text-white"
                : "border-transparent text-zinc-400 hover:border-brand/50 hover:text-white"
            }`}
          >
            {item.short}
          </Link>
        );
      })}

      <p className="label-caps px-6 pb-3 pt-6 text-brand">Account</p>
      <Link
        href="/portal"
        onClick={onNavigate}
        aria-current={pathname === "/portal" ? "page" : undefined}
        className={`label-caps border-l-2 px-6 py-3 transition ${
          pathname === "/portal"
            ? "border-brand bg-white/5 text-white"
            : "border-transparent text-zinc-400 hover:border-brand/50 hover:text-white"
        }`}
      >
        My account
      </Link>
    </nav>
  );
}

/** Permanent rail, lg and up. */
export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-ink-line bg-ink lg:block">
      <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto">
        <div className="px-6 py-7">
          <Brand />
        </div>
        <NavLinks items={items} />
      </div>
    </aside>
  );
}

/** Trigger plus drawer for narrow screens. Rendered inside the top bar. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="-ml-1 rounded-lg p-2 text-fg-muted transition hover:bg-black/5 lg:hidden dark:hover:bg-white/10"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="relative flex h-full w-60 flex-col overflow-y-auto border-r border-ink-line bg-ink">
            <div className="px-6 py-7">
              <Brand />
            </div>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
