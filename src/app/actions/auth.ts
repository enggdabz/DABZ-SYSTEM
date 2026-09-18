"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { AuthState } from "@/lib/auth-state";
import { usernameEmailDomain } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Mirrors the profiles_username_check constraint in the database. */
const USERNAME_PATTERN = /^[a-z0-9]([a-z0-9._-]{1,28})[a-z0-9]$/;

/** Only same-origin paths may be used as a post-login destination. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!username || !password) {
    return { error: "Enter your username and password." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { error: "That username is not valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    // Supabase Auth keys accounts by email, while this system identifies staff
    // by username, so the two are bridged by a fixed internal domain.
    email: `${username}@${usernameEmailDomain()}`,
    password,
  });

  // Deliberately vague: distinguishing "no such user" from "wrong password"
  // would let anyone enumerate staff usernames.
  if (error) return { error: "Incorrect username or password." };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
