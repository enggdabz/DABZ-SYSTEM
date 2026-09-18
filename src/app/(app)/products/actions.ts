"use server";

/**
 * Products and their bulk prices (spec 7.1, 7.2, 7.4).
 *
 * Owner/Admin only: staff can save a new product from the counter, but only
 * the owner renames, reprices or removes one.
 */
import { revalidatePath } from "next/cache";

import { recordAudit, diffFields } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { DIVISION_IDS } from "@/lib/divisions";
import { formatPesos, parsePesos } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProductActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

export async function saveProductAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const actor = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (name === "") fieldErrors.name = "Give the product a name.";

  const division = String(formData.get("division") ?? "printshoppe");
  if (!(DIVISION_IDS as readonly string[]).includes(division)) {
    fieldErrors.division = "Choose a division.";
  }

  // A blank price is a real answer: it means "ask me at the counter".
  const rawPrice = String(formData.get("price") ?? "").trim();
  let priceCentavos: number | null = null;
  if (rawPrice !== "") {
    try {
      priceCentavos = parsePesos(rawPrice);
      if (priceCentavos < 0) throw new Error("negative");
    } catch {
      fieldErrors.price = "Enter a price like 25 or 25.50, or leave it blank.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const values = {
    name,
    division,
    price_centavos: priceCentavos,
    manual_price: priceCentavos === null,
    unit: String(formData.get("unit") ?? "").trim() || null,
    section: String(formData.get("section") ?? "other"),
    income_category: String(formData.get("incomeCategory") ?? "other_print_jobs"),
  };

  const supabase = await createSupabaseServerClient();

  if (productId === "") {
    const { error } = await supabase
      .from("products")
      .insert({ ...values, created_by: actor.id });
    if (error) return { error: `Could not add it: ${error.message}` };

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "create",
      entity: "products",
      summary: `Added the product "${name}"${
        priceCentavos === null ? " with no fixed price" : ` at ${formatPesos(priceCentavos)}`
      }`,
      after: values,
    });

    revalidatePath("/products");
    revalidatePath("/pos");
    return { success: `Added ${name}.` };
  }

  const { data: before } = await supabase
    .from("products")
    .select("name, division, price_centavos, unit, section")
    .eq("id", productId)
    .maybeSingle();

  const { error } = await supabase.from("products").update(values).eq("id", productId);
  if (error) return { error: `Could not save it: ${error.message}` };

  const changed = before
    ? diffFields(before as Record<string, unknown>, {
        ...(before as object),
        ...values,
      } as Record<string, unknown>)
    : { before: {}, after: values, changedKeys: ["all"] };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "products",
    entityId: productId,
    summary: changed.changedKeys.includes("price_centavos")
      ? `Changed the price of "${name}" to ${
          priceCentavos === null ? "ask each time" : formatPesos(priceCentavos)
        }`
      : `Updated the product "${name}"`,
    before: changed.before,
    after: changed.after,
  });

  revalidatePath("/products");
  revalidatePath("/pos");
  return { success: `Saved ${name}.` };
}

export async function setProductActiveAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const actor = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const supabase = await createSupabaseServerClient();
  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return { error: "That product no longer exists." };

  // Hidden, not deleted: old receipts still refer to it by name.
  const { error } = await supabase
    .from("products")
    .update({ active })
    .eq("id", productId);

  if (error) return { error: error.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: active ? "activate" : "deactivate",
    entity: "products",
    entityId: productId,
    summary: `${active ? "Showed" : "Hid"} the product "${product.name}"`,
  });

  revalidatePath("/products");
  revalidatePath("/pos");

  return {
    success: active
      ? `${product.name} is back on the counter.`
      : `${product.name} is off the counter. Old receipts still show it.`,
  };
}

/** Adds a bulk price rule (spec 7.4). */
export async function addPriceTierAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const actor = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "");
  const minQuantity = Number(formData.get("minQuantity") ?? 0);

  if (!Number.isInteger(minQuantity) || minQuantity < 2) {
    return { fieldErrors: { minQuantity: "Enter a quantity of 2 or more." } };
  }

  let unitPriceCentavos: number;
  try {
    unitPriceCentavos = parsePesos(String(formData.get("unitPrice") ?? ""));
    if (unitPriceCentavos < 0) throw new Error("negative");
  } catch {
    return { fieldErrors: { unitPrice: "Enter a price like 2.50." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("product_price_tiers").insert({
    product_id: productId,
    min_quantity: minQuantity,
    unit_price_centavos: unitPriceCentavos,
    created_by: actor.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `There is already a rule starting at ${minQuantity}.` };
    }
    return { error: `Could not add the rule: ${error.message}` };
  }

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "product_price_tiers",
    entityId: productId,
    summary: `Bulk price: from ${minQuantity} up, ${formatPesos(unitPriceCentavos)} each`,
  });

  revalidatePath("/products");
  revalidatePath("/pos");

  return { success: `From ${minQuantity} up, each one costs ${formatPesos(unitPriceCentavos)}.` };
}

export async function removePriceTierAction(
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const actor = await requireOwnerOrAdmin();

  const tierId = String(formData.get("tierId") ?? "");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("product_price_tiers")
    .delete()
    .eq("id", tierId);

  if (error) return { error: error.message };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "product_price_tiers",
    entityId: tierId,
    summary: "Removed a bulk price rule",
  });

  revalidatePath("/products");
  revalidatePath("/pos");

  return { success: "Rule removed." };
}
