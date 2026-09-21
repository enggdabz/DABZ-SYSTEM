"use server";

/**
 * Turning notifications on and off for one phone (Phase 11).
 *
 * The browser does the subscribing - only it can be granted permission, and
 * only it holds the keys the payload is encrypted with. These actions just
 * keep the result, and refuse anybody who should not have it.
 *
 * A Server Action is a public endpoint, so both of these re-check the asker
 * even though the button is only rendered for an Owner or Admin. Row Level
 * Security on `push_subscriptions` then refuses a row belonging to anybody
 * else, which is the layer that actually decides.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface NotificationState {
  error?: string;
  success?: string;
}

/** The longest a browser's endpoint or key can sensibly be. */
const MAX_FIELD = 2000;

function readField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function subscribeAction(
  _previous: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  const user = await requireOwnerOrAdmin();

  const endpoint = readField(formData, "endpoint");
  const p256dh = readField(formData, "p256dh");
  const auth = readField(formData, "auth");

  if (!endpoint || !p256dh || !auth) {
    return {
      error:
        "This phone did not hand over everything needed. Try turning it on again.",
    };
  }

  // A browser's endpoint is a URL at the push service. Anything else is either
  // a bug or somebody poking the endpoint by hand.
  if (!endpoint.startsWith("https://")) {
    return { error: "That does not look like a notification address." };
  }

  if (
    endpoint.length > MAX_FIELD ||
    p256dh.length > MAX_FIELD ||
    auth.length > MAX_FIELD
  ) {
    return { error: "This phone sent something longer than expected." };
  }

  const supabase = await createSupabaseServerClient();

  /*
    Upsert on the endpoint, because a browser hands back the SAME endpoint
    when it re-subscribes. Inserting would collide with the unique constraint
    and read to the owner as "it did not work" when in fact it already had.
    It also un-does a switch-off: a phone that was deactivated after a run of
    failures comes back active, with its tally cleared.

    Built as a named row rather than inline for a duller reason:
    `npm run check:schema` reads the object literal after `.upsert(`, and with
    a second argument following it the scan runs on and mistakes the NEXT
    object in the file - the audit entry below - for more columns.
  */
  const row = {
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: readField(formData, "userAgent").slice(0, 300) || null,
    active: true,
    failure_count: 0,
    last_error: null,
    created_by: user.id,
  };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" });

  if (error) {
    return { error: `Notifications could not be turned on: ${error.message}` };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "push_subscription",
    summary: "Turned notifications on for a phone",
  });

  revalidatePath("/settings");

  return {
    success:
      "Notifications are on for this phone. The first summary arrives when the shop opens.",
  };
}

export async function unsubscribeAction(
  _previous: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  const user = await requireOwnerOrAdmin();

  const id = readField(formData, "id");
  if (!id) return { error: "Which phone?" };

  const supabase = await createSupabaseServerClient();

  /*
    DELETED, not deactivated - the one place in this system where that is the
    right answer. A push subscription is a standing permission rather than a
    money record, and a withdrawn permission should leave nothing behind that
    anything could still send to. The delete policy allows only your own.
  */
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: `That could not be turned off: ${error.message}` };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "delete",
    entity: "push_subscription",
    entityId: id,
    summary: "Turned notifications off for a phone",
  });

  revalidatePath("/settings");

  return { success: "Notifications are off for that phone." };
}
