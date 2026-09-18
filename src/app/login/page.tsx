import { connection } from "next/server";

import { Notice, Wordmark } from "@/components/ui";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Dabz System" };

/** True when no owner account exists yet, so the shop needs first-time setup. */
async function needsFirstRunSetup(): Promise<boolean> {
  if (!isAdminClientConfigured()) return false;
  try {
    const admin = createSupabaseAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (error) return false;
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  await connection();

  const { next, reason } = await searchParams;
  const configured = isAdminClientConfigured();
  const firstRun = await needsFirstRunSetup();

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* The logos are made for black backgrounds, so the sign-in card wears
            one regardless of the light/dark setting (spec 3.3). */}
        <div className="flex justify-center rounded-card bg-black px-6 py-8 text-white ring-1 ring-white/10">
          <Wordmark />
        </div>

        <div className="mt-6 rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">
            Signing in is not timing in. Time in from the home screen once you
            are signed in.
          </p>

          <div className="mt-6 space-y-5">
            {!configured ? (
              <Notice tone="attention" title="Not connected to the database yet">
                <p>
                  Follow <code>docs/SETUP.md</code> to create the Supabase
                  project and add its three settings, including the service-role
                  key that sign-in needs.
                </p>
              </Notice>
            ) : firstRun ? (
              <Notice tone="info" title="No accounts exist yet">
                <p>
                  Open <a className="underline" href="/setup">the first-time setup page</a>{" "}
                  to create the owner account.
                </p>
              </Notice>
            ) : null}

            {reason === "inactive" ? (
              <Notice tone="attention" title="This account has been deactivated">
                <p>Ask the owner to switch it back on.</p>
              </Notice>
            ) : null}

            <LoginForm next={next} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Forgot your password? Only the owner can reset it. Nobody, including
          the owner, can see an existing password.
        </p>
      </div>
    </main>
  );
}
