"use server";

/**
 * Answering an enquiry (Phase 9).
 *
 * The public form writes the enquiry; this is the other half - what the shop
 * does with it. Two things matter here:
 *
 *   * Only Owner/Admin may touch one. An enquiry carries a stranger's name and
 *     phone number, so it is not staff-wide reading, and the table's policies
 *     say so too - this check is the second layer, not the only one.
 *   * Every change is written to the audit log. Nobody is signed in when an
 *     enquiry arrives, so the arrival cannot be logged; answering it can, and
 *     that is the part where a person made a decision.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/lib/enquiries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EnquiryActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

const SUCCESS: Record<EnquiryStatus, string> = {
  new: "Put back on the list.",
  replied: "Marked replied.",
  closed: "Closed.",
};

export async function setEnquiryStatusAction(
  _previous: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const user = await requireOwnerOrAdmin();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  if (!enquiryId) return { error: "That message could not be found." };

  const status = String(formData.get("status") ?? "");
  if (!ENQUIRY_STATUSES.includes(status as EnquiryStatus)) {
    return { error: "That is not something a message can be set to." };
  }

  const note = String(formData.get("replyNote") ?? "").trim();
  if (note.length > 1000) {
    return { fieldErrors: { replyNote: "Please keep the note under 1000 characters." } };
  }

  const supabase = await createSupabaseServerClient();

  /*
    Putting one back on the list clears who handled it, so the list does not
    say "answered by Dabz" beside something nobody has answered. The note is
    kept - it is usually what explains why it came back.
  */
  const backOnTheList = status === "new";

  const { error } = await supabase
    .from("enquiries")
    .update({
      status,
      reply_note: note === "" ? null : note,
      handled_by: backOnTheList ? null : user.id,
      handled_at: backOnTheList ? null : new Date().toISOString(),
    })
    .eq("id", enquiryId);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "enquiry",
    entityId: enquiryId,
    summary: SUCCESS[status as EnquiryStatus],
    after: { status, reply_note: note || null },
  });

  revalidatePath("/enquiries");
  revalidatePath("/overview");

  return { success: SUCCESS[status as EnquiryStatus] };
}
