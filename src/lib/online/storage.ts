/**
 * Where the online shop's pictures and files live (docs/spec.md 6.5).
 *
 * Three buckets, and the difference between them is the whole of the privacy
 * story:
 *
 *   product-images, design-images - PUBLIC. A product photo and a jersey
 *     mockup are the shop window; anybody may look at them, and the URL is
 *     built here rather than signed.
 *
 *   order-files - PRIVATE. Whatever a customer uploaded is their artwork and
 *     sometimes their own logo. Staff reach it through a link that expires in
 *     minutes, and there is no public URL for it at all - which is why this
 *     file will not build you one.
 */
import { readSupabaseEnv } from "@/lib/supabase/env";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const DESIGN_IMAGES_BUCKET = "design-images";
export const ORDER_FILES_BUCKET = "order-files";

/** How long a staff member's link to a customer's file lasts, in seconds. */
export const SIGNED_URL_SECONDS = 300;

/**
 * The address of a picture in one of the two PUBLIC buckets.
 *
 * Null when Supabase is not configured, so a screen renders without a picture
 * rather than with a broken one.
 */
export function publicImageUrl(bucket: string, path: string | null): string | null {
  if (!path) return null;
  if (bucket === ORDER_FILES_BUCKET) {
    // Not an oversight. A customer's upload is private, and a function that
    // would hand out a permanent URL for it is the way that stops being true.
    throw new Error("order-files is private: use a signed URL, not a public one.");
  }

  const env = readSupabaseEnv();
  if (!env.ok) return null;

  return `${env.env.url}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

export function productImageUrl(path: string | null): string | null {
  return publicImageUrl(PRODUCT_IMAGES_BUCKET, path);
}

export function designImageUrl(path: string | null): string | null {
  return publicImageUrl(DESIGN_IMAGES_BUCKET, path);
}
