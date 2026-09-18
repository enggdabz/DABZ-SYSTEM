import type { ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { AppTopBar } from "@/components/AppTopBar";
import { AutoLogout } from "@/components/AutoLogout";
import { getSettings, requireUser } from "@/lib/auth/dal";
import { visibleSections } from "@/lib/auth/navigation";
import { can, isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getExpensePresets } from "@/lib/data/expenses";
import { getBillsDueSoon } from "@/lib/data/reminder";
import { describeApprovalRule } from "@/lib/expenses";
import { formatPesos } from "@/lib/money";

/**
 * The frame around every signed-in screen.
 *
 * Next.js warns that a layout check alone is not enough, because a layout does
 * not re-run on every navigation within it. So each page below calls its own
 * requireUser() / requirePermission() as well - this layout is for the frame,
 * not for the guard.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();

  // Staff never see the bills at all (spec 4.3), so the reminder is not even
  // fetched for them - the database would refuse it anyway.
  const billsDueSoon = isOwnerOrAdmin(user) ? await getBillsDueSoon() : [];

  // The expense pop-up is in the top bar so a purchase can be recorded from
  // wherever the person is standing - under ten seconds is the whole point
  // (spec 11). Only fetched for those who may use it.
  const mayRecordExpenses = can(user, "record_expenses");
  const expensePresets = mayRecordExpenses ? await getExpensePresets() : null;

  return (
    /*
      The rail sits beside everything, so the top bar and the page scroll
      against it rather than under it.
    */
    <div className="flex min-h-dvh flex-1">
      <AppSidebar sections={visibleSections(user)} />

      <div className="flex min-w-0 flex-1 flex-col">
      <AppTopBar
        user={user}
        billsDueSoon={billsDueSoon}
        expensePresets={expensePresets}
        expenseApprovalHint={describeApprovalRule({
          isOwnerOrAdmin: isOwnerOrAdmin(user),
          staffExpenseApprovalLimitCentavos:
            settings.staffExpenseApprovalLimitCentavos,
          formatAmount: formatPesos,
        })}
      />
      <AutoLogout minutes={settings.autoLogoutMinutes} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer
        data-app-chrome
        className="border-t border-line/60 px-4 py-6 text-xs text-muted sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          Dabz Printshoppe &middot; Philippine peso ({"₱"}) &middot; Times
          shown in Asia/Manila &middot; Signed out automatically after{" "}
          {settings.autoLogoutMinutes} minutes of no activity
        </div>
      </footer>
      </div>
    </div>
  );
}
