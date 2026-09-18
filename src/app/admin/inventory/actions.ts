"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { hasPermission, requireRole, requireUser } from "@/lib/auth";
import { MONEY_SOURCES, TAGS, type MoneySource, type Tag } from "@/lib/domain";
import { parsePesosToCentavos } from "@/lib/money";
import { parseQuantityToThousandths } from "@/lib/quantity";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

function trimmed(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}
function optional(formData: FormData, field: string): string | null {
  const value = trimmed(formData, field);
  return value === "" ? null : value;
}

export async function saveStockItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const name = trimmed(formData, "name");
  if (!name) return { error: "Enter a name.", notice: null };

  const tag = trimmed(formData, "tag") as Tag;
  if (!TAGS.includes(tag)) return { error: "Choose a valid tag.", notice: null };

  const unitCost = parsePesosToCentavos(trimmed(formData, "unit_cost") || "0");
  if (unitCost === null || unitCost < 0) {
    return { error: "Enter a valid unit cost.", notice: null };
  }
  const reorder = parseQuantityToThousandths(trimmed(formData, "reorder_level") || "0");
  if (reorder === null || reorder < 0) {
    return { error: "Enter a valid reorder level.", notice: null };
  }

  // stock_items.unit is NOT NULL, so a blank field falls back to pieces
  // rather than being sent as null.
  const unit = trimmed(formData, "unit") || "pc";

  const supabase = await createClient();
  const id = optional(formData, "id");
  const row = {
    name,
    unit,
    tag,
    unit_cost_centavos: unitCost,
    reorder_level_thousandths: reorder,
    note: optional(formData, "note"),
    active: formData.get("active") !== "off",
  };

  const { error } = id
    ? await supabase.from("stock_items").update(row).eq("id", id)
    : await supabase.from("stock_items").insert(row);

  if (error) return { error: "Could not save the item.", notice: null };

  revalidatePath("/admin/inventory");
  return { error: null, notice: id ? "Item updated." : "Item added." };
}

export async function receiveStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!(await hasPermission("stock_in_out"))) {
    return { error: "You do not have permission to receive stock.", notice: null };
  }

  const quantity = parseQuantityToThousandths(trimmed(formData, "quantity"));
  if (quantity === null || quantity <= 0) {
    return { error: "Enter a quantity above zero.", notice: null };
  }

  const unitCost = parsePesosToCentavos(trimmed(formData, "unit_cost") || "0");
  if (unitCost === null || unitCost < 0) {
    return { error: "Enter a valid unit cost.", notice: null };
  }

  const payNow = formData.get("pay_now") === "on";
  const source = trimmed(formData, "source") as MoneySource;
  if (payNow && !MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const supabase = await createClient();

  /*
   * As with complete_sale, `supabase gen types` marks these arguments
   * non-nullable although the SQL accepts NULL for the supplier, reason and
   * due date.
   */
  const args = {
    p_stock_item_id: trimmed(formData, "stock_item_id"),
    p_quantity_thousandths: quantity,
    p_unit_cost_centavos: unitCost,
    p_supplier_id: optional(formData, "supplier_id"),
    p_reason: optional(formData, "reason"),
    p_pay_now: payNow,
    p_source: payNow ? source : null,
    p_due_on: payNow ? null : optional(formData, "due_on"),
  };

  const { error } = await supabase.rpc(
    "record_stock_in",
    args as unknown as Database["public"]["Functions"]["record_stock_in"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/inventory");
  return {
    error: null,
    notice: payNow ? "Stock received and expense recorded." : "Stock received; payable raised.",
  };
}

/** A count or a correction, rather than a delivery. */
export async function adjustStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireUser();
  if (!(await hasPermission("stock_in_out"))) {
    return { error: "You do not have permission to adjust stock.", notice: null };
  }

  const delta = parseQuantityToThousandths(trimmed(formData, "delta"));
  if (delta === null || delta === 0) {
    return { error: "Enter a change other than zero.", notice: null };
  }

  const kind = trimmed(formData, "kind");
  if (!["out", "count", "adjustment"].includes(kind)) {
    return { error: "Unknown movement kind.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: trimmed(formData, "stock_item_id"),
    kind,
    delta_thousandths: delta,
    reason: optional(formData, "reason"),
    // The insert policy requires created_by to be the caller.
    created_by: current.user.id,
  });
  if (error) return { error: "Could not record the movement.", notice: null };

  revalidatePath("/admin/inventory");
  return { error: null, notice: "Movement recorded." };
}

export async function saveSupplier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);
  const name = trimmed(formData, "name");
  if (!name) return { error: "Enter a name.", notice: null };

  const supabase = await createClient();
  const id = optional(formData, "id");
  const row = {
    name,
    contact_number: optional(formData, "contact_number"),
    address: optional(formData, "address"),
    note: optional(formData, "note"),
    active: formData.get("active") !== "off",
  };

  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id)
    : await supabase.from("suppliers").insert(row);
  if (error) return { error: "Could not save the supplier.", notice: null };

  revalidatePath("/admin/inventory/suppliers");
  return { error: null, notice: id ? "Supplier updated." : "Supplier added." };
}

export async function paySupplierPayable(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);

  const source = trimmed(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_supplier_payable", {
    p_payable_id: trimmed(formData, "payable_id"),
    p_paid_on: trimmed(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    p_source: source,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath("/admin/inventory/suppliers");
  return { error: null, notice: "Payable settled." };
}

export async function saveCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const name = trimmed(formData, "name");
  if (!name) return { error: "Enter a name.", notice: null };

  const supabase = await createClient();
  const id = optional(formData, "id");
  const row = {
    name,
    contact_number: optional(formData, "contact_number"),
    address: optional(formData, "address"),
    facebook_name: optional(formData, "facebook_name"),
    email: optional(formData, "email"),
    note: optional(formData, "note"),
    active: formData.get("active") !== "off",
  };

  const { error } = id
    ? await supabase.from("customers").update(row).eq("id", id)
    : await supabase.from("customers").insert(row);
  if (error) return { error: "Could not save the customer.", notice: null };

  revalidatePath("/admin/inventory/customers");
  return { error: null, notice: id ? "Customer updated." : "Customer added." };
}
