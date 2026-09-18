import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import type { AppRole } from "@/lib/types/app";

export function AppShell({
  role,
  username,
  fullName,
  children,
}: {
  role: AppRole;
  username: string;
  fullName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link href="/admin" className="text-sm font-semibold text-slate-900 dark:text-white">
            DABZ System
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/admin"
              className="text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/portal"
              className="text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              My account
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
              {fullName || username}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
