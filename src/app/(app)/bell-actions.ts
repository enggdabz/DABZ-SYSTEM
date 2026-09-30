"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Marks the signed-in person's own notifications as read. The database
 * function touches only the caller's rows, so there is no id to pass and none
 * to tamper with.
 */
export async function markNotificationsReadAction(): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_notifications_read");
  revalidatePath("/", "layout");
}
