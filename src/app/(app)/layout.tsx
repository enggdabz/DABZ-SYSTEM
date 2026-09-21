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
import { idleSignOutMinutes } from "@/lib/settings";

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

  /*
    Everything below needs to know WHO is asking, so it waits for the line
    above - but none of it needs the others, so it is all asked for at once.
    One after another, these were three more round trips to Supabase stacked
    on top of the sign-in check before a screen could start rendering.

    A `loading.tsx` cannot cover for this: a Suspense boundary sits INSIDE the
    layout, so a slow layout still blocks the navigation. That is why the frame
    has to be quick rather than merely have something to show.
  */
  const [settings, billsDueSoon, expensePresets] = await Promise.all([
    getSettings(),
    // Staff never see the bills at all (spec 4.3), so the reminder is not even
    // fetched for them - the database would refuse it anyway.
    isOwnerOrAdmin(user) ? getBillsDueSoon() : Promise.resolve([]),
    // The expense pop-up is in the top bar so a purchase can be recorded from
    // wherever the person is standing - under ten seconds is the whole point
    // (spec 11). Only fetched for those who may use it.
    can(user, "record_expenses") ? getExpensePresets() : Promise.resolve(null),
  ]);

  // Staff may be left signed in all day; owner and admin never are (spec 4.1,
  // revised - see docs/DECISIONS.md).
  const idleMinutes = idleSignOutMinutes(user.role, settings);

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
      {/*
        Not rendered at all for someone who stays signed in: no timer means
        nothing that could fire by mistake.
      */}
      {idleMinutes !== null && <AutoLogout minutes={idleMinutes} />}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer
        data-app-chrome
        className="border-t border-line/60 px-4 py-6 text-xs text-muted sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          Dabz Printshoppe &middot; Philippine peso ({"₱"}) &middot; Times
          shown in Asia/Manila &middot;{" "}
          {idleMinutes === null
            ? "You stay signed in until you sign out"
            : `Signed out automatically after ${idleMinutes} minutes of no activity`}
        </div>
      </footer>
      </div>
    </div>
  );
}
