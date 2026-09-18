import type { Metadata } from "next";

import { Brand } from "@/components/brand";
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
    // The brand mark carries white text, so it sits on the near-black field
    // above the card rather than on the white panel itself.
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 py-12">
      <div className="mb-8">
        <Brand />
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Staff accounts only.
        </p>

        {message ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {message}
          </p>
        ) : null}

        <SignInForm next={next} />
      </div>

      <p className="mt-8 text-xs text-zinc-500">DABZ Printshoppe</p>
    </div>
  );
}
