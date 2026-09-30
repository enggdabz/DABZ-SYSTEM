import "server-only";

/**
 * A person's in-app notifications (the bell in the top bar).
 *
 * Own rows only, by policy - so there is no `.eq("user_id")` here, and adding
 * one would suggest the filtering happens in this file. Written only by the
 * SECURITY DEFINER functions in `0023`.
 */
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AppNotification {
  id: string;
  message: string;
  href: string | null;
  createdAt: string;
  read: boolean;
}

const COLUMNS = "id, message, href, created_at, read_at";

interface Row {
  id: string;
  message: string;
  href: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * The latest few. A failed read is an empty bell, never an error: the frame
 * around every screen must not fall over because a message could not be read.
 */
export const getMyNotifications = cache(async (): Promise<AppNotification[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) return [];
    return ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      message: row.message,
      href: row.href,
      createdAt: row.created_at,
      read: row.read_at !== null,
    }));
  } catch {
    return [];
  }
});
