import "server-only";

/**
 * Storing and removing a Counter product's photo, and removing the product
 * itself (the owner's request, 2 Oct 2026).
 *
 * Photos go into the online shop's `product-images` bucket (0020) under
 * `counter/<product id>/`, so nothing about storage is new: the same bucket,
 * the same Owner/Admin write policy, the same check of a file by its CONTENT
 * rather than its name. Everything here runs through the signed-in person's
 * own client, so Row Level Security decides as it does everywhere else.
 */
import { recordAudit } from "@/lib/audit";
import type { SignedInUser } from "@/lib/auth/dal";
import { deleteVanished, historyCheckUnavailable } from "@/lib/deletable";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/online/storage";
import { IMAGE_KINDS, UPLOAD_LIMITS, checkUpload, storageKey } from "@/lib/online/uploads";
import { isColumnMissingFromApi, isFunctionMissingFromApi } from "@/lib/postgrest";
import { COUNTER_PHOTO_PREFIX } from "@/lib/product-photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Puts a photo in the bucket and returns its path. Does NOT point the product
 * at it - the caller does that, and removes the file again if it cannot.
 */
export async function uploadProductPhoto(
  supabase: Supabase,
  productId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkUpload(bytes, {
    allowed: IMAGE_KINDS,
    maxBytes: UPLOAD_LIMITS.imageBytes,
    what: "A photo",
  });
  if (!checked.ok) return { ok: false, error: checked.error };

  const path = storageKey(`${COUNTER_PHOTO_PREFIX}/${productId}`, checked.kind.extension);
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, bytes, { contentType: checked.kind.mime, upsert: false });

  if (error) return { ok: false, error: `The photo could not be stored: ${error.message}` };
  return { ok: true, path };
}

/**
 * Takes a photo file out of the bucket. Best effort: a file left behind costs
 * a few kilobytes, and a product edit must not fail because of one. Only ever
 * touches the Counter's own folder.
 */
export async function removePhotoFile(supabase: Supabase, path: string | null): Promise<void> {
  if (!path || !path.startsWith(`${COUNTER_PHOTO_PREFIX}/`)) return;
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  if (error) console.error("[product photo] could not remove", path, error.message);
}

export type RemoveProductResult =
  | { ok: true; outcome: "deleted" | "archived"; name: string }
  | { ok: false; error: string };

/**
 * Removes a product from the counter.
 *
 * A product that has NEVER been sold is deleted, with its bulk price rules
 * (they cascade) and its photo file. A product that HAS been sold cannot be -
 * the delete policy from 0011 refuses it, because it is shop history - so,
 * when `whenSold` is "archive", it is hidden instead and keeps its photo, the
 * same as the Products screen's Hide. Old sales are untouched either way:
 * every sale line carries its own copy of the name and the price.
 *
 * Everything the delete takes is written to the audit log FIRST, because
 * afterwards there is nothing left to reconstruct it from.
 */
export async function removeProduct(
  actor: SignedInUser,
  productId: string,
  whenSold: "refuse" | "archive",
): Promise<RemoveProductResult | { ok: false; sold: true }> {
  const supabase = await createSupabaseServerClient();

  const first = await supabase
    .from("products")
    .select(
      "name, division, price_centavos, manual_price, unit, section, sort_order, income_category, active, image_path",
    )
    .eq("id", productId)
    .maybeSingle();

  // A database still waiting for 0026 has no photo column - and so no photo
  // to remove. That must not stop a product being deleted.
  let product: (typeof first.data & object) | null = first.data;
  if (first.error && isColumnMissingFromApi(first.error)) {
    const { data } = await supabase
      .from("products")
      .select(
        "name, division, price_centavos, manual_price, unit, section, sort_order, income_category, active",
      )
      .eq("id", productId)
      .maybeSingle();
    product = data ? { ...data, image_path: null } : null;
  }

  if (!product) return { ok: false, error: "That product no longer exists." };

  const { data: hasHistory, error: historyError } = await supabase.rpc(
    "product_has_history",
    { p_product_id: productId },
  );

  if (historyError) {
    return {
      ok: false,
      error: isFunctionMissingFromApi(historyError)
        ? historyCheckUnavailable("product_has_history")
        : `Could not check whether it has been sold: ${historyError.message}`,
    };
  }

  if (hasHistory === true) {
    if (whenSold === "refuse") return { ok: false, sold: true };

    const { data: hidden, error } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", productId)
      .select("id");

    if (error) return { ok: false, error: `Could not remove it: ${error.message}` };
    if (!hidden || hidden.length === 0) {
      return { ok: false, error: "Nothing was removed. Only the owner or an admin can remove a product." };
    }

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "deactivate",
      entity: "products",
      entityId: productId,
      summary: `Removed "${product.name}" from the counter. It has been sold before, so it was hidden rather than deleted`,
      before: { active: product.active },
      after: { active: false },
    });

    return { ok: true, outcome: "archived", name: product.name };
  }

  const { data: tiers } = await supabase
    .from("product_price_tiers")
    .select("min_quantity, unit_price_centavos")
    .eq("product_id", productId);

  const { data: removed, error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .select("id");

  if (error) return { ok: false, error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) return { ok: false, error: deleteVanished("product") };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "products",
    entityId: productId,
    summary: `Deleted the product "${product.name}"${
      tiers && tiers.length > 0
        ? ` and its ${tiers.length} bulk price rule${tiers.length === 1 ? "" : "s"}`
        : ""
    }${product.image_path ? " and its photo" : ""}`,
    before: { ...product, price_tiers: tiers ?? [] },
  });

  // Only after the row is gone: a delete that failed must keep its photo.
  await removePhotoFile(supabase, product.image_path);

  return { ok: true, outcome: "deleted", name: product.name };
}
