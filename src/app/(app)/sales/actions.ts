"use server";

/**
 * Voiding a sale (spec 4.4).
 *
 * Staff may add a sale but never undo one. They ask; an Owner or Admin decides.
 * The sale itself is never deleted - the customer may be holding the receipt -
 * so it is marked voided, and its takings are voided with it.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin, requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SalesActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

export async function requestVoidAction(
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const user = await requirePermission("add_sales");

  const saleId = String(formData.get("saleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason === "") {
    return { fieldErrors: { reason: "Say what went wrong, so the owner can decide." } };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("void_requests")
    .select("id, status")
    .eq("sale_id", saleId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return { error: "You have already asked for this sale to be voided." };
  }

  const { error } = await supabase.from("void_requests").insert({
    sale_id: saleId,
    reason,
    requested_by: user.id,
  });

  if (error) return { error: `Could not send the request: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "void_requests",
    entityId: saleId,
    summary: `Asked for a sale to be voided: ${reason}`,
  });

  revalidatePath("/sales");

  return {
    success: "Sent. The owner or an admin will decide, and the sale stands until then.",
  };
}

export async function decideVoidAction(
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const actor = await requireOwnerOrAdmin();

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Choose approve or reject." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: request } = await supabase
    .from("void_requests")
    .select("sale_id, reason, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "pending") return { error: "That request is already decided." };

  if (decision === "approved") {
    // Voids the sale and its ledger entries in one transaction, so the day's
    // takings cannot keep counting money that was handed back.
    const { error } = await supabase.rpc("void_sale", {
      p_sale_id: request.sale_id,
      p_reason: request.reason,
    });
    if (error) return { error: `Could not void the sale: ${error.message}` };
  }

  const { error } = await supabase
    .from("void_requests")
    .update({
      status: decision,
      decided_by: actor.id,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("id", requestId);

  if (error) return { error: `Could not save the decision: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: decision === "approved" ? "void" : "update",
    entity: "void_requests",
    entityId: requestId,
    summary:
      decision === "approved"
        ? `Approved a void: ${request.reason}`
        : `Rejected a void request: ${request.reason}`,
    after: { status: decision, note },
  });

  revalidatePath("/sales");
  revalidatePath("/ledger");
  revalidatePath("/overview");

  return {
    success:
      decision === "approved"
        ? "The sale is voided, and its takings no longer count."
        : "Request rejected. The sale stands.",
  };
}
