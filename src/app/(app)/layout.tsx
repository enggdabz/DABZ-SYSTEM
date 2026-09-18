import type { ReactNode } from "react";

import { AppTopBar } from "@/components/AppTopBar";
import { AutoLogout } from "@/components/AutoLogout";
import { getSettings, requireUser } from "@/lib/auth/dal";

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

  return (
    <>
      <AppTopBar user={user} />
      <AutoLogout minutes={settings.autoLogoutMinutes} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-line/60 px-4 py-6 text-xs text-muted sm:px-6">
        <div className="mx-auto max-w-6xl">
          Dabz Printshoppe &middot; Philippine peso ({"₱"}) &middot; Times
          shown in Asia/Manila &middot; Signed out automatically after{" "}
          {settings.autoLogoutMinutes} minutes of no activity
        </div>
      </footer>
    </>
  );
}
