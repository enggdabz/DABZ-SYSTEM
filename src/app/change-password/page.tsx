import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Notice, Wordmark } from "@/components/ui";
import { getSignedInUser } from "@/lib/auth/dal";

import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "Change password · Dabz System" };

export default async function ChangePasswordPage() {
  await connection();

  // Not requireUser(): that would redirect back here in a loop for exactly the
  // people this screen exists for.
  const user = await getSignedInUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?reason=inactive");

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center rounded-card bg-black px-6 py-8 text-white ring-1 ring-white/10">
          <Wordmark />
        </div>

        <div className="mt-6 rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.mustChangePassword ? "Choose your password" : "Change your password"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {user.fullName} ({user.username}).
          </p>

          <div className="mt-6 space-y-5">
            {user.mustChangePassword ? (
              <Notice tone="info" title="Your password is temporary">
                <p>
                  Pick your own password before using the system. Only you will
                  know it - the owner can reset it, but never see it.
                </p>
              </Notice>
            ) : null}

            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
