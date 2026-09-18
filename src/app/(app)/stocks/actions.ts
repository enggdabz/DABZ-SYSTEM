"use server";

/**
 * Stock items and movements (spec 14).
 *
 * Receiving stock goes through `record_stock_in` in the database, because it
 * can touch three things at once - the shelf, an expense, and a supplier
 * payable - and they have to land together or not at all.
 *
 * Taking stock out touches nothing but the shelf, so it is a plain insert that
 * Row Level Security checks in the usual way.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin, requirePermission } from "@/lib/auth/dal";
import { DIVISION_IDS } from "@/lib/divisions";
import { MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { formatQuantity, parseQuantity, type Thousandths } from "@/lib/quantity";
import { countAdjustment } from "@/lib/stocks";
import { getItemHistory, getStockItems } from "@/lib/data/stocks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface StockState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

const TAGS = [...DIVISION_IDS, "whole_shop"] as const;

/** Reads a quantity box, or returns the message to show beside it. */
function readQuantity(
  value: FormDataEntryValue | null,
): { ok: true; value: Thousandths } | { ok: false; message: string } {
  try {
    const parsed = parseQuantity(String(value ?? ""));
    if (parsed <= 0) return { ok: false, message: "Enter a quantity above zero." };
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      message: "Enter a quantity, like 20 or 2.5 (up to three decimals).",
    };
  }
}

export async function receiveStockAction(
  _previous: StockState,
  formData: FormData,
): Promise<StockState> {
  const user = await requirePermission("stock_in_out");

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "That item could not be found." };

  const quantity = readQuantity(formData.get("quantity"));
  if (!quantity.ok) return { fieldErrors: { quantity: quantity.message } };

  // The unit cost is optional. Left blank, the delivery is recorded on the
  // shelf and no money is claimed to have moved - which is honest, and is what
  // happens when nobody at the counter knows what it cost.
  const costText = String(formData.get("unitCost") ?? "").trim();
  let unitCostCentavos: number | null = null;
  if (costText) {
    try {
      unitCostCentavos = parsePesos(costText);
      if (unitCostCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { unitCost: "Leave empty, or enter a price like 240." } };
    }
  }

  const payNow = String(formData.get("payment") ?? "now") === "now";
  const source = String(formData.get("source") ?? "cash_drawer");
  if (!MONEY_SOURCES.includes(source as never)) {
    return { fieldErrors: { source: "Choose where the money came from." } };
  }

  const dueOn = String(formData.get("dueOn") ?? "").trim() || null;
  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("record_stock_in", {
    p_stock_item_id: itemId,
    p_quantity_thousandths: quantity.value,
    p_unit_cost_centavos: unitCostCentavos,
    p_supplier_id: supplierId,
    p_reason: reason,
    p_pay_now: payNow,
    p_source: source,
    p_due_on: dueOn,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  const items = await getStockItems();
  const item = items.find((entry) => entry.id === itemId);

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "stock_movement",
    entityId: itemId,
    summary: `Received ${formatQuantity(quantity.value, item?.unit)} of ${
      item?.name ?? "stock"
    }${unitCostCentavos ? ` at ${formatPesos(unitCostCentavos)} each` : ""}`,
    after: {
      quantity_thousandths: quantity.value,
      unit_cost_centavos: unitCostCentavos,
      paid_now: payNow,
    },
  });

  revalidatePath("/stocks");
  revalidatePath("/payables");
  revalidatePath("/expenses");
  revalidatePath("/");

  return {
    success: `Received ${formatQuantity(quantity.value, item?.unit)}.${
      unitCostCentavos && !payNow ? " Added to what you owe the supplier." : ""
    }`,
  };
}

export async function takeStockOutAction(
  _previous: StockState,
  formData: FormData,
): Promise<StockState> {
  const user = await requirePermission("stock_in_out");

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "That item could not be found." };

  const quantity = readQuantity(formData.get("quantity"));
  if (!quantity.ok) return { fieldErrors: { quantity: quantity.message } };

  const reason = String(formData.get("reason") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: itemId,
    kind: "out",
    // Stored as a negative movement, so the level is nothing but a sum.
    delta_thousandths: -quantity.value,
    reason,
    created_by: user.id,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  const items = await getStockItems();
  const item = items.find((entry) => entry.id === itemId);

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "stock_movement",
    entityId: itemId,
    summary: `Took out ${formatQuantity(quantity.value, item?.unit)} of ${
      item?.name ?? "stock"
    }`,
    after: { quantity_thousandths: -quantity.value, reason },
  });

  revalidatePath("/stocks");
  revalidatePath("/");

  return { success: `Took out ${formatQuantity(quantity.value, item?.unit)}.` };
}

/**
 * A physical count (spec 14).
 *
 * The person types what is actually on the shelf. The difference is worked out
 * here and written as its own movement, so the history still explains the
 * number - a count that silently overwrote the level would hide the loss.
 */
export async function countStockAction(
  _previous: StockState,
  formData: FormData,
): Promise<StockState> {
  const user = await requirePermission("stock_in_out");

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "That item could not be found." };

  let counted: Thousandths;
  try {
    counted = parseQuantity(String(formData.get("counted") ?? ""));
    if (counted < 0) throw new Error("negative");
  } catch {
    return { fieldErrors: { counted: "Enter what you counted, like 14 or 13.5." } };
  }

  const history = await getItemHistory(itemId);
  const onHand = history.length ? history[history.length - 1].runningTotal : 0;
  const { delta, changed } = countAdjustment({ onHand, counted });

  const items = await getStockItems();
  const item = items.find((entry) => entry.id === itemId);

  if (!changed) {
    return {
      success: `Counted ${formatQuantity(counted, item?.unit)} — the same as the system had. Nothing to correct.`,
    };
  }

  const note = String(formData.get("note") ?? "").trim();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: itemId,
    kind: "count",
    delta_thousandths: delta,
    reason:
      note ||
      `Counted ${formatQuantity(counted, item?.unit)}, system had ${formatQuantity(
        onHand,
        item?.unit,
      )}`,
    created_by: user.id,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "stock_movement",
    entityId: itemId,
    summary: `Counted ${item?.name ?? "stock"}: ${formatQuantity(
      counted,
      item?.unit,
    )} on the shelf, ${formatQuantity(onHand, item?.unit)} expected`,
    before: { quantity_thousandths: onHand },
    after: { quantity_thousandths: counted, delta_thousandths: delta },
  });

  revalidatePath("/stocks");
  revalidatePath("/");

  return {
    success:
      delta < 0
        ? `Counted ${formatQuantity(counted, item?.unit)} — ${formatQuantity(
            Math.abs(delta),
            item?.unit,
          )} short of what the system had. The difference is recorded.`
        : `Counted ${formatQuantity(counted, item?.unit)} — ${formatQuantity(
            delta,
            item?.unit,
          )} more than the system had. The difference is recorded.`,
  };
}

export async function saveStockItemAction(
  _previous: StockState,
  formData: FormData,
): Promise<StockState> {
  const user = await requireOwnerOrAdmin();

  const id = String(formData.get("itemId") ?? "").trim() || null;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: "Give the material a name." } };

  const unit = String(formData.get("unit") ?? "").trim();
  if (!unit) {
    return { fieldErrors: { unit: "How do you count it? ream, litre, piece." } };
  }

  const tag = String(formData.get("tag") ?? "whole_shop");
  if (!TAGS.includes(tag as never)) {
    return { fieldErrors: { tag: "Choose which part of the shop." } };
  }

  // Both of these stay empty unless the owner fills them in. A reorder level
  // nobody chose would warn on the wrong day, and a made-up cost would
  // misvalue the shelf - and both would then be believed.
  const reorderText = String(formData.get("reorderLevel") ?? "").trim();
  let reorderLevel: number | null = null;
  if (reorderText) {
    try {
      reorderLevel = parseQuantity(reorderText);
      if (reorderLevel < 0) throw new Error("negative");
    } catch {
      return {
        fieldErrors: { reorderLevel: "Leave empty, or enter a level like 5." },
      };
    }
  }

  const costText = String(formData.get("unitCost") ?? "").trim();
  let unitCostCentavos: number | null = null;
  if (costText) {
    try {
      unitCostCentavos = parsePesos(costText);
      if (unitCostCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { unitCost: "Leave empty, or enter a price like 240." } };
    }
  }

  const row = {
    name,
    unit,
    tag,
    reorder_level_thousandths: reorderLevel,
    unit_cost_centavos: unitCostCentavos,
    supplier_id: String(formData.get("supplierId") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    active: formData.get("active") !== null,
  };

  const supabase = await createSupabaseServerClient();

  const { error } = id
    ? await supabase.from("stock_items").update(row).eq("id", id)
    : await supabase.from("stock_items").insert({ ...row, created_by: user.id });

  if (error) {
    return {
      error: error.message.includes("stock_items_name_idx")
        ? "There is already a material with that name."
        : `That could not be saved: ${error.message}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: id ? "update" : "create",
    entity: "stock_item",
    entityId: id,
    summary: `${id ? "Updated" : "Added"} the material "${name}"`,
    after: row,
  });

  revalidatePath("/stocks");
  revalidatePath("/checklist");
  revalidatePath("/");

  return { success: `"${name}" saved.` };
}

/** Today's date, for the received-on default on the form. */
export async function todayInManila(): Promise<string> {
  return civilDateToISO(manilaToday());
}
