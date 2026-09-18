import { connection } from "next/server";

import { Notice, Wordmark } from "@/components/ui";
import { isAdminClientConfigured } from "@/lib/supabase/admin";

import { countProfiles } from "./actions";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "First-time setup · Dabz System" };

export default async function SetupPage() {
  await connection();

  const configured = isAdminClientConfigured();
  const existing = configured ? await countProfiles() : null;
  const alreadySetUp = existing !== null && existing > 0;

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center rounded-card bg-black px-6 py-8 text-white ring-1 ring-white/10">
          <Wordmark />
        </div>

        <div className="mt-6 rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">First-time setup</h1>
          <p className="mt-1 text-sm text-muted">
            This creates the owner account. It only works once - after that, new
            accounts are created from the Staff screen.
          </p>

          <div className="mt-6 space-y-5">
            {!configured ? (
              <Notice tone="attention" title="Not connected to the database yet">
                <p>
                  Follow <code>docs/SETUP.md</code> first. Setup needs the
                  Supabase URL, the public key, and the service-role key.
                </p>
              </Notice>
            ) : alreadySetUp ? (
              <Notice tone="info" title="Setup is already done">
                <p>
                  This shop has {existing} account{existing === 1 ? "" : "s"}.{" "}
                  <a className="underline" href="/login">
                    Sign in instead.
                  </a>
                </p>
              </Notice>
            ) : (
              <SetupForm />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
