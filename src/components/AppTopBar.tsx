import Link from "next/link";

import { AppSidebarButton } from "./AppSidebar";
import { BillsDueSoon, type DueSoonBill } from "./BillsDueSoon";
import { QuickExpense } from "./QuickExpense";
import { ThemeToggle } from "./ThemeToggle";
import { SwitchUserButton } from "./SwitchUserButton";
import { Wordmark } from "./ui";
import type { SignedInUser } from "@/lib/auth/dal";
import type { ExpensePreset } from "@/lib/expenses";
import { visibleSections } from "@/lib/auth/navigation";

/**
 * The black frosted top bar for signed-in screens (spec 3.1).
 *
 * The sections themselves live in the sidebar now; what stays up here is what
 * has to be reachable from any screen - recording an expense in under ten
 * seconds, the bills falling due, and switching user at a shared counter.
 *
 * Only shows the sections this person may open. Hiding a link is a courtesy,
 * not the security boundary - the database refuses the data either way.
 */
export function AppTopBar({
  user,
  billsDueSoon = [],
  expensePresets,
  expenseApprovalHint,
}: {
  user: SignedInUser;
  /** Empty for staff, who never see the bills (spec 4.3). */
  billsDueSoon?: DueSoonBill[];
  /**
   * The quick picks for the expense pop-up, or null when this person may not
   * record expenses. Recording one has to be possible from wherever they are
   * standing, which is why it lives up here rather than on a screen of its own.
   */
  expensePresets?: ExpensePreset[] | null;
  expenseApprovalHint?: string | null;
}) {
  const sections = visibleSections(user);

  return (
    <header
      data-app-chrome
      className="sticky top-0 z-50 bg-topbar text-topbar-ink backdrop-blur-xl"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <AppSidebarButton sections={sections} />
            {/*
              The wordmark is in the sidebar from `lg` up, so showing it here
              too would print it twice on the same screen.
            */}
            <Link href="/overview" className="shrink-0 lg:hidden">
              <Wordmark />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {expensePresets ? (
              <QuickExpense
                presets={expensePresets}
                approvalHint={expenseApprovalHint ?? null}
              />
            ) : null}
            {billsDueSoon.length > 0 ? <BillsDueSoon bills={billsDueSoon} /> : null}
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium">{user.fullName}</span>
              <span className="block text-white/50 capitalize">{user.role}</span>
            </span>
            <SwitchUserButton />
            <ThemeToggle />
          </div>
        </div>

      </div>
    </header>
  );
}
