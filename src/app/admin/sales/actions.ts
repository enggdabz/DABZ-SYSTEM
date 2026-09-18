"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { apportion } from "@/lib/apportion";
import { getCurrentUser, hasPermission, requireRole, requireUser } from "@/lib/auth";
import {
  PAYMENT_METHODS,
  type Division,
  type PaymentMethod,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type CartLine = {
  product_id: string | null;
  name: string;
  division: Division;
  income_category: string;
  quantity: number;
  unit_price_centavos: number;
};

export async function completeSale(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireUser();

  // complete_sale checks this itself, but failing here gives a real message
  // instead of a raised Postgres exception.
  if (!(await hasPermission("add_sales"))) {
    return { error: "You do not have permission to add sales.", notice: null };
  }

  let lines: CartLine[];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]")) as CartLine[];
  } catch {
    return { error: "The cart could not be read.", notice: null };
  }
  if (lines.length === 0) {
    return { error: "A sale needs at least one item.", notice: null };
  }

  for (const line of lines) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity <= 0 ||
      !Number.isInteger(line.unit_price_centavos) ||
      line.unit_price_centavos < 0
    ) {
      return { error: "An item has an invalid quantity or price.", notice: null };
    }
  }

  // Totals are recomputed here. The browser's arithmetic is a convenience for
  // the person at the till, never the number that gets stored.
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unit_price_centavos * line.quantity,
    0,
  );

  const discountKind = String(formData.get("discount_kind") ?? "none");
  const discountInput = Number(formData.get("discount_value") ?? 0);
  let discount = 0;
  let discountPercent: number | null = null;

  if (discountKind === "amount") {
    discount = Math.max(0, Math.trunc(discountInput));
  } else if (discountKind === "percent") {
    const pct = Math.min(100, Math.max(0, discountInput));
    discountPercent = pct;
    discount = Math.floor((subtotal * pct) / 100);
  }
  if (discount > subtotal) discount = subtotal;

  if (discount > 0) {
    if (!(await hasPermission("give_discounts"))) {
      return { error: "You do not have permission to give discounts.", notice: null };
    }
    // Owners and admins are not bound by the staff ceiling.
    if (current.role === "staff") {
      const supabase = await createClient();
      const { data: settings } = await supabase
        .from("app_settings")
        .select("staff_discount_limit_percent, staff_discount_limit_centavos")
        .eq("id", 1)
        .maybeSingle();

      const limitPercent = Number(settings?.staff_discount_limit_percent ?? 0);
      const limitCentavos = Number(settings?.staff_discount_limit_centavos ?? 0);
      const asPercent = subtotal > 0 ? (discount * 100) / subtotal : 0;

      if (limitPercent > 0 && asPercent > limitPercent) {
        return {
          error: `Staff discounts are capped at ${limitPercent}%.`,
          notice: null,
        };
      }
      if (limitCentavos > 0 && discount > limitCentavos) {
        return { error: "That discount is above your limit.", notice: null };
      }
    }
  }

  const total = subtotal - discount;

  const paymentMethod = String(formData.get("payment_method") ?? "cash") as PaymentMethod;
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: "Unknown payment method.", notice: null };
  }

  // sales_change_is_cash_only: only a cash sale may carry these two.
  let moneyGiven: number | null = null;
  let change: number | null = null;
  if (paymentMethod === "cash") {
    const given = Number(formData.get("money_given") ?? 0);
    moneyGiven = Math.max(0, Math.trunc(given));
    if (moneyGiven < total) {
      return { error: "Cash received is less than the total.", notice: null };
    }
    change = moneyGiven - total;
  }

  // One ledger entry per division and income category, carrying its share of
  // the discount so the entries add up to what was actually taken.
  const groups = new Map<string, { division: string; category: string; weight: number }>();
  for (const line of lines) {
    const key = `${line.division}::${line.income_category}`;
    const existing = groups.get(key);
    const weight = line.unit_price_centavos * line.quantity;
    if (existing) existing.weight += weight;
    else
      groups.set(key, {
        division: line.division,
        category: line.income_category,
        weight,
      });
  }
  const grouped = [...groups.values()];
  const shares = apportion(total, grouped.map((g) => g.weight));
  const ledger = grouped
    .map((group, index) => ({
      amount_centavos: shares[index],
      division: group.division,
      category: group.category,
    }))
    .filter((entry) => entry.amount_centavos > 0);

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const saleDate = String(formData.get("sale_date") ?? "").trim();

  const supabase = await createClient();

  /*
   * `supabase gen types` marks every function argument non-nullable, even where
   * the SQL signature accepts NULL — p_customer_id, p_discount_percent,
   * p_reference_number and the two cash fields all do. The values below are
   * correct for the database; only the generated typing is too narrow.
   */
  const args = {
    p_sale_date: saleDate || new Date().toISOString().slice(0, 10),
    p_customer_id: customerId || null,
    p_subtotal_centavos: subtotal,
    p_discount_centavos: discount,
    p_discount_kind: discountKind,
    p_discount_percent: discountPercent,
    p_total_centavos: total,
    p_payment_method: paymentMethod,
    p_reference_number: String(formData.get("reference_number") ?? "").trim() || null,
    p_money_given_centavos: moneyGiven,
    p_change_centavos: change,
    p_lines: lines.map((line) => ({
      name: line.name,
      product_id: line.product_id,
      division: line.division,
      quantity: line.quantity,
      unit_price_centavos: line.unit_price_centavos,
      line_total_centavos: line.unit_price_centavos * line.quantity,
      income_category: line.income_category,
    })),
    p_ledger: ledger,
  };

  const { data, error } = await supabase.rpc(
    "complete_sale",
    args as unknown as Database["public"]["Functions"]["complete_sale"]["Args"],
  );

  if (error) return { error: error.message, notice: null };

  const saleNumber = Array.isArray(data) ? data[0]?.sale_number : null;
  revalidatePath("/admin/sales");
  redirect(`/admin/sales?completed=${encodeURIComponent(saleNumber ?? "")}`);
}

export async function voidSale(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);
  const saleId = String(formData.get("sale_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the sale is being voided.", notice: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", {
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/sales");
  return { error: null, notice: "Sale voided." };
}

/** Staff cannot void; they ask an owner or admin to. */
export async function requestVoid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "Not signed in.", notice: null };

  const saleId = String(formData.get("sale_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why this should be voided.", notice: null };

  const supabase = await createClient();
  const { error } = await supabase.from("void_requests").insert({
    sale_id: saleId,
    reason,
    status: "pending",
    requested_by: current.user.id,
  });
  if (error) return { error: "Could not send the request.", notice: null };

  revalidatePath("/admin/sales");
  return { error: null, notice: "Void request sent." };
}

export async function decideVoidRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole(["owner", "admin"]);
  const requestId = String(formData.get("request_id") ?? "");
  const approve = formData.get("approve") === "true";
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("void_requests")
    .select("id, sale_id, reason, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found.", notice: null };
  if (request.status !== "pending") {
    return { error: "That request has already been decided.", notice: null };
  }

  if (approve) {
    const { error } = await supabase.rpc("void_sale", {
      p_sale_id: request.sale_id,
      p_reason: request.reason,
    });
    if (error) return { error: error.message, notice: null };
  }

  await supabase
    .from("void_requests")
    .update({
      status: approve ? "approved" : "rejected",
      decided_by: actor.user.id,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("id", requestId);

  revalidatePath("/admin/sales");
  return { error: null, notice: approve ? "Sale voided." : "Request rejected." };
}
