"use server";

/**
 * The jersey design gallery (docs/spec.md 9.7).
 *
 * A design is a mockup the shop already has drawn, that a customer can pick
 * instead of sending their own artwork. The CODE is the part that matters:
 * DJ-101 is what the customer says on Messenger and what is written on the job
 * order, so it is copied onto every order line that uses it and a design
 * deleted next year does not take it with it.
 *
 * Which is also why a code is never reused. `nextDesignCode` counts on from
 * the highest ever issued rather than filling a gap - a past order still says
 * DJ-102 on it, and handing that number to a different jersey would make that
 * order wrong.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { normaliseDesignCode } from "@/lib/online/catalogue";
import { DESIGN_IMAGES_BUCKET } from "@/lib/online/storage";
import {
  checkUpload,
  IMAGE_KINDS,
  storageKey,
  UPLOAD_LIMITS,
} from "@/lib/online/uploads";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OnlineDesignState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

function revalidateShop() {
  revalidatePath("/online-orders/designs");
  revalidatePath("/online-orders/products");
  revalidatePath("/shop");
  revalidatePath("/shop/designs");
}

export async function saveOnlineDesignAction(
  _previous: OnlineDesignState,
  formData: FormData,
): Promise<OnlineDesignState> {
  const actor = await requireOwnerOrAdmin();

  const designId = String(formData.get("designId") ?? "").trim();
  const code = normaliseDesignCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (code === "") fieldErrors.code = "Give the design a code, like DJ-101.";
  if (name === "") fieldErrors.name = "Give the design a name.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createSupabaseServerClient();

  const values = {
    code,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    is_visible: formData.get("isVisible") !== null,
  };

  let savedId = designId;

  if (designId === "") {
    const { data, error } = await supabase
      .from("online_designs")
      .insert({ ...values, created_by: actor.id })
      .select("id")
      .single();

    if (error || !data) {
      // A clash on the code is the one failure worth its own sentence: the
      // form pre-fills the next free one, so this means two people are adding
      // a design at the same moment.
      return {
        error: error?.code === "23505"
          ? `${code} is already used by another design. Try the next number.`
          : `The design could not be saved: ${error?.message ?? "unknown"}`,
      };
    }

    savedId = data.id as string;
    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "create",
      entity: "online_design",
      entityId: savedId,
      summary: `Added design ${code} ${name}`,
      after: values,
    });
  } else {
    const { data: before } = await supabase
      .from("online_designs")
      .select("*")
      .eq("id", designId)
      .maybeSingle();

    const { error } = await supabase
      .from("online_designs")
      .update(values)
      .eq("id", designId);

    if (error) return { error: `The design could not be saved: ${error.message}` };

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: "update",
      entity: "online_design",
      entityId: designId,
      summary: `Changed design ${code} ${name}`,
      before: before ?? null,
      after: values,
    });
  }

  // Which products offer it. Replaced wholesale, for the same reason the
  // prices are: the form shows the complete list, so it sends one.
  const productIds = formData.getAll("productIds").map((value) => String(value));
  await supabase.from("online_design_products").delete().eq("design_id", savedId);
  if (productIds.length > 0) {
    await supabase.from("online_design_products").insert(
      productIds.map((productId) => ({
        design_id: savedId,
        product_id: productId,
        created_by: actor.id,
      })),
    );
  }

  const mockup = formData.get("mockup");
  if (mockup instanceof File && mockup.size > 0) {
    const bytes = new Uint8Array(await mockup.arrayBuffer());
    const checked = checkUpload(bytes, {
      allowed: IMAGE_KINDS,
      maxBytes: UPLOAD_LIMITS.imageBytes,
      what: "A mockup",
    });

    if (!checked.ok) {
      revalidateShop();
      return { success: `${code} saved.`, error: checked.error };
    }

    const path = storageKey(savedId, checked.kind.extension);
    const { error } = await supabase.storage
      .from(DESIGN_IMAGES_BUCKET)
      .upload(path, bytes, { contentType: checked.kind.mime, upsert: false });

    if (error) {
      revalidateShop();
      return { success: `${code} saved.`, error: `The mockup could not be stored: ${error.message}` };
    }

    await supabase.from("online_designs").update({ image_path: path }).eq("id", savedId);
  }

  revalidateShop();
  return { success: `${code} ${name} saved.` };
}

export async function toggleOnlineDesignAction(
  _previous: OnlineDesignState,
  formData: FormData,
): Promise<OnlineDesignState> {
  const actor = await requireOwnerOrAdmin();
  const designId = String(formData.get("designId") ?? "");
  const isVisible = formData.get("isVisible") === "true";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_designs")
    .update({ is_visible: isVisible })
    .eq("id", designId)
    .select("code, name")
    .maybeSingle();

  if (error) return { error: `That could not be changed: ${error.message}` };
  if (!data) return { error: "That design has already gone." };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "online_design",
    entityId: designId,
    summary: `${isVisible ? "Showed" : "Hid"} design ${data.code}`,
  });

  revalidateShop();
  return {
    success: isVisible ? `${data.code} is back on the shop.` : `${data.code} is hidden.`,
  };
}

export async function deleteOnlineDesignAction(
  _previous: OnlineDesignState,
  formData: FormData,
): Promise<OnlineDesignState> {
  const actor = await requireOwnerOrAdmin();
  const designId = String(formData.get("designId") ?? "");

  const supabase = await createSupabaseServerClient();
  const [{ data: design }, { data: links }] = await Promise.all([
    supabase.from("online_designs").select("*").eq("id", designId).maybeSingle(),
    supabase
      .from("online_design_products")
      .select("design_id, product_id")
      .eq("design_id", designId),
  ]);

  if (!design) return { error: "That design has already gone." };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "delete",
    entity: "online_design",
    entityId: designId,
    summary: `Deleted design ${design.code} ${design.name}`,
    before: { design, productLinks: links ?? [] },
  });

  const { error } = await supabase
    .from("online_designs")
    .update({ deleted_at: new Date().toISOString(), is_visible: false })
    .eq("id", designId);

  if (error) return { error: `That could not be deleted: ${error.message}` };

  await supabase.from("online_design_products").delete().eq("design_id", designId);

  revalidateShop();
  return { success: "Design deleted. Past orders keep the design code." };
}
