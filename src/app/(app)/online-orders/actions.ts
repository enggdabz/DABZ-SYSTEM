"use server";

/**
 * Moving an online order along (docs/spec.md 9.2, 9.3).
 *
 * Every one of these is a thin wrapper round a database function, and that is
 * the point. `online_orders` and its money have no write policy for anybody,
 * so the transition, the payment and the line in the history are written
 * together inside one transaction that checks the caller itself. What is left
 * here is turning a form into arguments and a refusal into a sentence.
 *
 * Which means the permission check below is the COURTESY, not the boundary. It
 * is here so a staff member without the apparel permission gets a clear answer
 * instead of a database error - but if it were deleted, nothing would open.
 */
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { parsePesos } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OrderActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

function refresh(orderNo?: string) {
  revalidatePath("/online-orders");
  revalidatePath("/online-orders/production");
  revalidatePath("/online-orders/calendar");
  revalidatePath("/online-orders/reports");
  if (orderNo) revalidatePath(`/online-orders/${orderNo}`);
}

/**
 * The database's own refusals are written for a person - "The smallest order
 * for Full sublimation jersey is 6 pieces. You have 4." - so they are passed
 * straight through. Only a failure with nothing readable in it gets a
 * replacement sentence.
 */
function readable(message: string | undefined, fallback: string): string {
  const trimmed = (message ?? "").trim();
  if (trimmed === "") return fallback;
  // PostgREST wraps some errors; anything that still looks like SQL is not
  // something to show somebody at a counter.
  if (/^[A-Z]{2}\d{3}\b/.test(trimmed) || trimmed.includes("violates")) return fallback;
  return trimmed;
}

export async function sendQuoteAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");

  let centavos: number;
  try {
    centavos = parsePesos(String(formData.get("amount") ?? ""));
    if (centavos < 0) throw new Error("negative");
  } catch {
    return { fieldErrors: { amount: "Enter an amount like 8000 or 8000.00." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_send_quote", {
    p_order_id: orderId,
    p_amount_centavos: centavos,
  });

  if (error) return { error: readable(error.message, "The quote could not be saved.") };

  refresh(orderNo);
  return { success: "Quote saved. The order is now Quoted." };
}

export async function setOrderStatusAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (status === "cancelled" && reason === "") {
    return { fieldErrors: { reason: "Say why it is being cancelled." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_set_status", {
    p_order_id: orderId,
    p_status: status,
    p_reason: reason === "" ? null : reason,
  });

  if (error) return { error: readable(error.message, "That could not be done.") };

  refresh(orderNo);
  return {
    success: {
      confirmed: "Order confirmed.",
      in_production: "Production started.",
      completed: "Order completed.",
      cancelled: "Order cancelled.",
    }[status] ?? "Done.",
  };
}

export async function setDateNeededAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");
  const date = String(formData.get("dateNeeded") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { fieldErrors: { dateNeeded: "Pick a date." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_set_date_needed", {
    p_order_id: orderId,
    p_date: date,
  });

  if (error) return { error: readable(error.message, "The date could not be moved.") };

  refresh(orderNo);
  return { success: "Date moved." };
}

export async function markStageAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");
  const stageKey = String(formData.get("stageKey") ?? "");
  const skipped = formData.get("skipped") === "true";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_mark_stage", {
    p_order_id: orderId,
    p_stage_key: stageKey,
    p_skipped: skipped,
  });

  if (error) return { error: readable(error.message, "That step could not be ticked.") };

  refresh(orderNo);
  return { success: skipped ? "Marked as not needed." : "Step marked OK." };
}

export async function undoStageAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_undo_stage", { p_order_id: orderId });

  if (error) return { error: readable(error.message, "There was nothing to undo.") };

  refresh(orderNo);
  return { success: "Last step undone." };
}

export async function recordPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");
  const method = String(formData.get("method") ?? "");

  let centavos: number;
  try {
    centavos = parsePesos(String(formData.get("amount") ?? ""));
    if (centavos <= 0) throw new Error("not above zero");
  } catch {
    return { fieldErrors: { amount: "Enter an amount above zero, like 2250." } };
  }

  const paidOn = String(formData.get("paidOn") ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_record_payment", {
    p_order_id: orderId,
    p_amount_centavos: centavos,
    p_method: method,
    p_paid_on: /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : null,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });

  if (error) return { error: readable(error.message, "The payment could not be recorded.") };

  refresh(orderNo);
  return { success: "Payment recorded." };
}

export async function voidPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  // Only Owner/Admin get past the function itself (docs/spec.md 4.4); this
  // only opens the screen.
  await requirePermission("apparel_job_orders");

  const paymentId = String(formData.get("paymentId") ?? "");
  const orderNo = String(formData.get("orderNo") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason === "") {
    return { fieldErrors: { reason: "Say why the payment is being voided." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("online_void_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });

  if (error) return { error: readable(error.message, "The payment could not be voided.") };

  refresh(orderNo);
  return { success: "Payment voided. It stays on the order, struck through." };
}

/**
 * An order that came in by Messenger or over the counter (decision D1).
 *
 * The same function the website uses, with a staff member signed in - which is
 * what makes it a `manual` order rather than a `website` one, and what lifts
 * the lead-time rule: the customer has already agreed a date, and refusing to
 * record what was agreed would only put it back in the chat thread.
 */
export async function addManualOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requirePermission("apparel_job_orders");

  const items = [
    {
      product_id: String(formData.get("productId") ?? ""),
      variant_label: String(formData.get("variantLabel") ?? "") || null,
      options: {} as Record<string, string>,
      qty: Number(formData.get("qty") ?? 0),
      sizes: {} as Record<string, number>,
      roster: [] as { player_name: string | null; player_number: string | null; size: string }[],
      design_id: null,
      team_colors: String(formData.get("teamColors") ?? "").trim() || null,
      notes: String(formData.get("itemNotes") ?? "").trim() || null,
      files: [] as never[],
    },
  ];

  if (items[0].product_id === "") {
    return { fieldErrors: { productId: "Choose what they ordered." } };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_online_order", {
    p_customer_name: String(formData.get("customerName") ?? "").trim(),
    p_mobile: String(formData.get("mobile") ?? "").replace(/[\s()-]/g, ""),
    p_facebook_name: String(formData.get("facebookName") ?? "").trim() || null,
    p_method: String(formData.get("method") ?? "pickup"),
    p_address: String(formData.get("address") ?? "").trim() || null,
    p_date_needed: String(formData.get("dateNeeded") ?? ""),
    p_notes: String(formData.get("notes") ?? "").trim() || null,
    p_items: items,
    p_ip_address: null,
  });

  if (error || !data) {
    return { error: readable(error?.message, "That order could not be added.") };
  }

  const created = data as { order_no: string };
  refresh(created.order_no);
  return { success: `Order ${created.order_no} added.` };
}
