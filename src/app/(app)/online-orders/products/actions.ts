"use server";

/**
 * The online shop's catalogue (docs/spec.md 9.6).
 *
 * Owner/Admin only, re-checked here: a Server Action is a public endpoint, and
 * whoever can see the form is not the same question as whoever may save it.
 * That is also the house rule for every other price list in this system - the
 * counter's products, the apparel items and the repair services are all set by
 * the owner and read by everybody.
 *
 * DELETING IS SOFT, and that is the whole of why orders keep reading correctly
 * a year later. `deleted_at` takes the product off the shop and out of this
 * list; the order that pointed at it keeps its own snapshot of the name, the
 * category and the price it was sold at, and the link still resolves.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { parsePesos } from "@/lib/money";
import { uniqueSlug } from "@/lib/online/catalogue";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/online/storage";
import {
  checkUpload,
  cleanOriginalName,
  IMAGE_KINDS,
  storageKey,
  UPLOAD_LIMITS,
} from "@/lib/online/uploads";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OnlineProductState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** docs/spec.md 6.2: at most eight, enforced here rather than in the table. */
const MAX_IMAGES = 8;

function revalidateShop() {
  revalidatePath("/online-orders/products");
  revalidatePath("/online-orders/designs");
  revalidatePath("/shop");
  revalidatePath("/shop/designs");
}

interface PriceRow {
  label: string;
  centavos: number;
}

/**
 * The price list rows, as typed.
 *
 * A fixed-price product needs at least one, and each one needs a label: two
 * prices with no names beside them is a product a customer cannot choose from.
 */
function readPrices(formData: FormData): { rows: PriceRow[]; error: string | null } {
  const labels = formData.getAll("priceLabel").map((value) => String(value).trim());
  const amounts = formData.getAll("priceAmount").map((value) => String(value).trim());
  const rows: PriceRow[] = [];

  for (const [index, label] of labels.entries()) {
    const amount = amounts[index] ?? "";
    // A wholly empty row is somebody who did not use that line, not a mistake.
    if (label === "" && amount === "") continue;

    if (label === "") {
      return { rows, error: "Every price needs a name, like “Standard” or “A4 print”." };
    }

    try {
      const centavos = parsePesos(amount);
      if (centavos < 0) throw new Error("negative");
      rows.push({ label, centavos });
    } catch {
      return { rows, error: `Enter a price for “${label}”, like 450 or 450.00.` };
    }
  }

  return { rows, error: null };
}

interface OptionRow {
  name: string;
  choices: string[];
}

function readOptions(formData: FormData): { rows: OptionRow[]; error: string | null } {
  const names = formData.getAll("optionName").map((value) => String(value).trim());
  const choiceLists = formData.getAll("optionChoices").map((value) => String(value));
  const rows: OptionRow[] = [];

  for (const [index, name] of names.entries()) {
    const raw = choiceLists[index] ?? "";
    if (name === "" && raw.trim() === "") continue;

    const choices = raw
      .split(",")
      .map((choice) => choice.trim())
      .filter((choice) => choice !== "");

    if (name === "" || choices.length === 0) {
      return {
        rows,
        error: "An option needs a name and at least one choice, separated by commas.",
      };
    }

    rows.push({ name, choices });
  }

  return { rows, error: null };
}

export async function saveOnlineProductAction(
  _previous: OnlineProductState,
  formData: FormData,
): Promise<OnlineProductState> {
  const actor = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const pricingMode = String(formData.get("pricingMode") ?? "fixed");
  const fieldErrors: Record<string, string> = {};

  if (name === "") fieldErrors.name = "Give the product a name.";
  if (pricingMode !== "fixed" && pricingMode !== "quote") {
    fieldErrors.pricingMode = "Choose a fixed price or price on quote.";
  }

  const minOrderQty = Number(formData.get("minOrderQty") ?? 1);
  if (!Number.isInteger(minOrderQty) || minOrderQty < 1) {
    fieldErrors.minOrderQty = "Enter a whole number of pieces, one or more.";
  }

  const leadTimeDays = Number(formData.get("leadTimeDays") ?? 7);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 1) {
    fieldErrors.leadTimeDays = "Enter a whole number of days, one or more.";
  }

  const prices = readPrices(formData);
  if (prices.error) fieldErrors.prices = prices.error;

  // A fixed-price product with no price is a button the shop cannot show a
  // figure on. A QUOTE product with prices is a contradiction, so its rows are
  // simply not kept.
  if (pricingMode === "fixed" && prices.rows.length === 0 && !prices.error) {
    fieldErrors.prices = "A fixed-price product needs at least one price.";
  }

  const options = readOptions(formData);
  if (options.error) fieldErrors.options = options.error;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  const usesRoster = formData.get("usesRoster") !== null;
  const values = {
    name,
    category_id: String(formData.get("categoryId") ?? "") || null,
    description: String(formData.get("description") ?? "").trim() || null,
    pricing_mode: pricingMode,
    min_order_qty: minOrderQty,
    lead_time_days: leadTimeDays,
    // A roster asks the size per player, so a team product always asks sizes -
    // leaving the switch off would mean a name list with nothing to cut.
    uses_sizes: usesRoster || formData.get("usesSizes") !== null,
    uses_roster: usesRoster,
    uses_design_gallery: formData.get("usesDesignGallery") !== null,
    is_visible: formData.get("isVisible") !== null,
  };

  let savedId = productId;

  if (productId === "") {
    const { data: existing } = await supabase
      .from("online_products")
      .select("slug");
    const taken = new Set((existing ?? []).map((row) => row.slug as string));

    const { data, error } = await supabase
      .from("online_products")
      .insert({ ...values, slug: uniqueSlug(name, taken), created_by: actor.id })
      .select("id, slug")
      .single();

    if (error || !data) {
      return { error: `The product could not be saved: ${error?.message ?? "unknown"}` };
    }

    savedId = data.id as string;
    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "create",
      entity: "online_product",
      entityId: savedId,
      summary: `Added ${name} to the online shop`,
      after: values,
    });
  } else {
    const { data: before } = await supabase
      .from("online_products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    const { error } = await supabase
      .from("online_products")
      .update(values)
      .eq("id", productId);

    if (error) {
      return { error: `The product could not be saved: ${error.message}` };
    }

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "update",
      entity: "online_product",
      entityId: productId,
      summary: `Changed ${name} on the online shop`,
      before: before ?? null,
      after: values,
    });
  }

  /*
    Prices and options are REPLACED rather than merged.

    The form shows them all at once, so what it sends is the complete list -
    and merging would leave a price the owner deleted sitting in the database,
    invisible on the form and still orderable from the shop.
  */
  await supabase.from("online_product_prices").delete().eq("product_id", savedId);
  if (pricingMode === "fixed" && prices.rows.length > 0) {
    await supabase.from("online_product_prices").insert(
      prices.rows.map((row, index) => ({
        product_id: savedId,
        label: row.label,
        price_centavos: row.centavos,
        sort_order: index,
        created_by: actor.id,
      })),
    );
  }

  await supabase.from("online_product_options").delete().eq("product_id", savedId);
  if (options.rows.length > 0) {
    await supabase.from("online_product_options").insert(
      options.rows.map((row, index) => ({
        product_id: savedId,
        name: row.name,
        choices: row.choices,
        sort_order: index,
        created_by: actor.id,
      })),
    );
  }

  const photoError = await savePhotos(formData, savedId, actor.id);
  if (photoError) {
    // The product IS saved. Saying so and then naming the picture that did not
    // go up is better than one message that reads as if nothing worked.
    revalidateShop();
    return { success: `${name} saved.`, error: photoError };
  }

  revalidateShop();
  return { success: `${name} saved. It is on the shop now.` };
}

/**
 * The photos, checked by their CONTENT and stored under a generated name.
 *
 * Returns a sentence when something went wrong, and null when all was well.
 * A photo that fails never fails the product: the owner keeps their typing.
 */
async function savePhotos(
  formData: FormData,
  productId: string,
  actorId: string,
): Promise<string | null> {
  const files = formData
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) return null;

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("online_product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  const already = count ?? 0;
  if (already + files.length > MAX_IMAGES) {
    return `A product can have ${MAX_IMAGES} photos. This one already has ${already}.`;
  }

  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkUpload(bytes, {
      allowed: IMAGE_KINDS,
      maxBytes: UPLOAD_LIMITS.imageBytes,
      what: "A photo",
    });

    if (!checked.ok) return checked.error;

    const path = storageKey(productId, checked.kind.extension);
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, bytes, { contentType: checked.kind.mime, upsert: false });

    if (error) return `A photo could not be stored: ${error.message}`;

    await supabase.from("online_product_images").insert({
      product_id: productId,
      storage_path: path,
      alt: cleanOriginalName(file.name),
      sort_order: already + index,
      created_by: actorId,
    });
  }

  return null;
}

export async function removeOnlineProductPhotoAction(
  _previous: OnlineProductState,
  formData: FormData,
): Promise<OnlineProductState> {
  const actor = await requireOwnerOrAdmin();
  const imageId = String(formData.get("imageId") ?? "");

  const supabase = await createSupabaseServerClient();
  const { data: image } = await supabase
    .from("online_product_images")
    .select("id, product_id, storage_path")
    .eq("id", imageId)
    .maybeSingle();

  if (!image) return { error: "That photo has already gone." };

  await supabase.from("online_product_images").delete().eq("id", imageId);
  // The file goes too. A picture nothing points at is a picture nobody can
  // ever find again, and it would still be served to anyone holding the URL.
  await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove([image.storage_path as string]);

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "online_product_image",
    entityId: imageId,
    summary: "Removed a photo from an online shop product",
    before: image,
  });

  revalidateShop();
  return { success: "Photo removed." };
}

export async function toggleOnlineProductAction(
  _previous: OnlineProductState,
  formData: FormData,
): Promise<OnlineProductState> {
  const actor = await requireOwnerOrAdmin();
  const productId = String(formData.get("productId") ?? "");
  const isVisible = formData.get("isVisible") === "true";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_products")
    .update({ is_visible: isVisible })
    .eq("id", productId)
    .select("name")
    .maybeSingle();

  if (error) return { error: `That could not be changed: ${error.message}` };
  if (!data) return { error: "That product has already gone." };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "online_product",
    entityId: productId,
    summary: `${isVisible ? "Showed" : "Hid"} ${data.name} on the online shop`,
  });

  revalidateShop();
  return {
    success: isVisible
      ? `${data.name} is back on the shop.`
      : `${data.name} is hidden. Orders already placed are untouched.`,
  };
}

/**
 * Deleting a product: soft, and the whole row is logged first.
 *
 * Whatever this unlinks - the design gallery links, and nothing else - is
 * written into the audit log beside it, because afterwards there is nothing
 * left to reconstruct it from. The same rule as deleting a bill or a loan.
 */
export async function deleteOnlineProductAction(
  _previous: OnlineProductState,
  formData: FormData,
): Promise<OnlineProductState> {
  const actor = await requireOwnerOrAdmin();
  const productId = String(formData.get("productId") ?? "");

  const supabase = await createSupabaseServerClient();

  const [{ data: product }, { data: links }, { data: prices }] = await Promise.all([
    supabase.from("online_products").select("*").eq("id", productId).maybeSingle(),
    supabase
      .from("online_design_products")
      .select("design_id, product_id")
      .eq("product_id", productId),
    supabase
      .from("online_product_prices")
      .select("label, price_centavos")
      .eq("product_id", productId),
  ]);

  if (!product) return { error: "That product has already gone." };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "online_product",
    entityId: productId,
    summary: `Deleted ${product.name} from the online shop`,
    before: { product, designLinks: links ?? [], prices: prices ?? [] },
  });

  const { error } = await supabase
    .from("online_products")
    .update({ deleted_at: new Date().toISOString(), is_visible: false })
    .eq("id", productId);

  if (error) return { error: `That could not be deleted: ${error.message}` };

  // docs/spec.md 9.6: the gallery links go with it, so a design does not go on
  // offering itself for something nobody can buy.
  await supabase.from("online_design_products").delete().eq("product_id", productId);

  revalidateShop();
  return { success: "Product deleted. Past orders keep their details." };
}
