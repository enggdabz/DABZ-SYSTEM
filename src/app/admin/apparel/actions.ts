"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { apportion } from "@/lib/apportion";
import { hasPermission, requireRole, requireUser } from "@/lib/auth";
import { insertWithDocumentNumber } from "@/lib/document-number";
import {
  APPAREL_SIZES, APPAREL_STATUSES, MONEY_SOURCES,
  type ApparelStatus, type MoneySource,
} from "@/lib/domain";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => text(f, k) || null;

async function guard() {
  await requireUser();
  if (!(await hasPermission("apparel_job_orders"))) {
    return "You do not have permission to work on apparel orders.";
  }
  return null;
}

export async function createOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const teamName = text(formData, "team_name");
  if (!teamName) return { error: "Enter a team or order name.", notice: null };

  const orderedOn = text(formData, "ordered_on") || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data, error } = await insertWithDocumentNumber<{ id: string }>(supabase, {
    table: "apparel_orders",
    numberColumn: "order_number",
    prefix: "A",
    on: orderedOn,
    dateColumn: "ordered_on",
    row: {
      ordered_on: orderedOn,
      customer_id: opt(formData, "customer_id"),
      team_name: teamName,
      status: "quoted",
      promised_on: opt(formData, "promised_on"),
      layout_note: opt(formData, "layout_note"),
      note: opt(formData, "note"),
    },
  });

  if (error || !data) return { error: error ?? "Could not create the order.", notice: null };

  revalidatePath("/admin/apparel");
  redirect(`/admin/apparel/${data.id}`);
}

export async function setOrderStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const status = text(formData, "status") as ApparelStatus;
  if (!APPAREL_STATUSES.includes(status)) {
    return { error: "Unknown status.", notice: null };
  }

  const orderId = text(formData, "order_id");
  const patch: Database["public"]["Tables"]["apparel_orders"]["Update"] = { status };
  if (status === "released") patch.released_at = new Date().toISOString();
  if (status === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
    patch.cancel_reason = opt(formData, "cancel_reason");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("apparel_orders").update(patch).eq("id", orderId);
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/apparel/${orderId}`);
  return { error: null, notice: "Order updated." };
}

export async function addOrderLine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const orderId = text(formData, "order_id");
  const price = parsePesosToCentavos(text(formData, "unit_price") || "0");
  const quantity = Number(text(formData, "quantity") || "1");

  if (price === null || price < 0) return { error: "Enter a valid price.", notice: null };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be at least one.", notice: null };
  }

  const supabase = await createClient();
  const productId = opt(formData, "apparel_product_id");

  let name = text(formData, "name");
  let category = "sublimation_jerseys";
  if (productId) {
    const { data: product } = await supabase
      .from("apparel_products")
      .select("name, income_category")
      .eq("id", productId)
      .maybeSingle();
    if (product) {
      name = name || product.name;
      category = product.income_category ?? category;
    }
  }
  if (!name) return { error: "Choose a product or name the line.", notice: null };

  const { error } = await supabase.from("apparel_order_lines").insert({
    order_id: orderId,
    name,
    apparel_product_id: productId,
    fabric: opt(formData, "fabric"),
    collar: opt(formData, "collar"),
    unit_price_centavos: price,
    quantity,
    income_category: category,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/apparel/${orderId}`);
  return { error: null, notice: "Line added." };
}

/** One player's name, number and size on a line. */
export async function addOrderName(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const size = text(formData, "size");
  if (!APPAREL_SIZES.includes(size as never)) {
    return { error: "Choose a size.", notice: null };
  }

  const supabase = await createClient();

  // The surcharge comes from the price list, not from whoever is typing.
  const { data: sizePrice } = await supabase
    .from("apparel_size_prices")
    .select("extra_centavos")
    .eq("size", size)
    .maybeSingle();

  const { error } = await supabase.from("apparel_order_names").insert({
    line_id: text(formData, "line_id"),
    player_name: opt(formData, "player_name"),
    player_number: opt(formData, "player_number"),
    size,
    size_extra_centavos: sizePrice?.extra_centavos ?? 0,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/apparel/${text(formData, "order_id")}`);
  return { error: null, notice: "Name added." };
}

export async function takeApparelPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const orderId = text(formData, "order_id");
  const amount = parsePesosToCentavos(text(formData, "amount"));
  if (amount === null || amount <= 0) {
    return { error: "Enter an amount above zero.", notice: null };
  }

  const source = text(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const kind = text(formData, "kind") || "balance";
  if (kind !== "down_payment" && kind !== "balance") {
    return { error: "Unknown payment kind.", notice: null };
  }

  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("apparel_order_lines")
    .select("unit_price_centavos, quantity, income_category")
    .eq("order_id", orderId);

  // record_apparel_payment rejects a split that does not add up to the payment.
  const weights = new Map<string, number>();
  for (const line of lines ?? []) {
    const category = line.income_category ?? "sublimation_jerseys";
    weights.set(
      category,
      (weights.get(category) ?? 0) + line.unit_price_centavos * line.quantity,
    );
  }

  const categories = [...weights.keys()];
  const ledger =
    categories.length === 0
      ? [{ amount_centavos: amount, category: "sublimation_jerseys" }]
      : apportion(amount, categories.map((c) => weights.get(c) ?? 0))
          .map((share, index) => ({ amount_centavos: share, category: categories[index] }))
          .filter((entry) => entry.amount_centavos > 0);

  const args = {
    p_order_id: orderId,
    p_amount_centavos: amount,
    p_paid_on: text(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    p_source: source,
    p_kind: kind,
    p_reference_number: opt(formData, "reference_number"),
    p_note: opt(formData, "note"),
    p_ledger: ledger,
  };

  const { error } = await supabase.rpc(
    "record_apparel_payment",
    args as unknown as Database["public"]["Functions"]["record_apparel_payment"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/apparel/${orderId}`);
  return { error: null, notice: "Payment recorded." };
}

export async function voidApparelPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);
  const reason = text(formData, "reason");
  if (!reason) return { error: "Say why the payment is being voided.", notice: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_apparel_payment", {
    p_payment_id: text(formData, "payment_id"),
    p_reason: reason,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/apparel/${text(formData, "order_id")}`);
  return { error: null, notice: "Payment voided." };
}
