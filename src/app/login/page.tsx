import type { Metadata } from "next";

import { SignInForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  inactive: "That account is not active. Ask the owner or an admin to re-enable it.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const message = errorKey ? (MESSAGES[errorKey] ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        DABZ System
      </h1>
      <p className="mt-2 mb-8 text-sm text-slate-600 dark:text-slate-400">
        Sign in to continue.
      </p>

      {message ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          {message}
        </p>
      ) : null}

      <SignInForm next={next} />
    </main>
  );
}
