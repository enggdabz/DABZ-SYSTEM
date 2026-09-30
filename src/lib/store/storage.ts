import { readSupabaseEnv } from "@/lib/supabase/env";

/**
 * Where the store's pictures live: one PUBLIC bucket, because a product photo
 * and a banner are the shop window. The address is built here rather than
 * signed, and is null when Supabase is not configured so a screen renders
 * without a picture instead of with a broken one.
 *
 * Nothing a customer uploads goes in this bucket - those get their own,
 * private one when uploads are built.
 */
export const STORE_IMAGES_BUCKET = "store-images";

export function storeImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const env = readSupabaseEnv();
  if (!env.ok) return null;
  return `${env.env.url}/storage/v1/object/public/${STORE_IMAGES_BUCKET}/${encodeURI(path)}`;
}
