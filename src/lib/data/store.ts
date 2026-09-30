import "server-only";

/**
 * Reading the online store (docs/store/progress.md).
 *
 * WHICH CLIENT: the ORDINARY one, the same as the Phase 14 shop. A visitor is
 * nobody, and the catalogue tables have real `anon` policies that hand back a
 * visible, undeleted product and nothing else - so hiding a product takes it
 * off the store at once without a query remembering to filter, and this file
 * needs no special powers at all. The service-role key is not used here.
 *
 * Every read returns an empty result rather than throwing, so a screen opened
 * before the database is wired up (or before migration 0025 is applied) says
 * "nothing here yet" instead of showing a stack trace.
 *
 * THERE IS NO PRICE TO LEAK. A quote-only product has no price in the
 * database, and the two price tables are closed to a stranger for it; this
 * file only carries what it was handed.
 */
import { cache } from "react";

import { getShopSettings } from "@/lib/data/online";
import { parseChartRows } from "@/lib/store/size-chart";
import type {
  Availability,
  SizeChart,
  StoreBanner,
  StoreCategory,
  StoreProduct,
} from "@/lib/store/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function client() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

/** The store's off switch. Open unless somebody switched it off. */
export const isStoreOpen = cache(async (): Promise<boolean> => {
  const supabase = await client();
  if (!supabase) return true;

  const { data, error } = await supabase
    .from("store_settings")
    .select("store_enabled")
    .maybeSingle();

  // A missing row or table is not the owner switching the store off.
  if (error || !data) return true;
  return data.store_enabled !== false;
});

/**
 * The Page name behind the "Chat now" button, or null until the owner has said
 * it (Settings -> Your public page -> Messenger name; already on the To fill in
 * screen). Reuses the reader the Phase 14 shop and the public page share, so
 * there is one answer to "what is our Messenger name" in the whole system.
 */
export async function getStoreMessengerUsername(): Promise<string | null> {
  return (await getShopSettings()).messengerUsername;
}

export const getStoreCategories = cache(async (): Promise<StoreCategory[]> => {
  const supabase = await client();
  if (!supabase) return [];

  const { data } = await supabase
    .from("store_categories")
    .select("id, name, slug, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
});

export const getStoreBanners = cache(async (): Promise<StoreBanner[]> => {
  const supabase = await client();
  if (!supabase) return [];

  // The policy already keeps out a banner that is off or out of date.
  const { data } = await supabase
    .from("store_banners")
    .select("id, image_path, title, subtitle, link_url, sort_order")
    .order("sort_order");

  return (data ?? []).map((row) => ({
    id: row.id,
    imagePath: row.image_path,
    title: row.title,
    subtitle: row.subtitle,
    linkUrl: row.link_url,
  }));
});

const PRODUCT_COLUMNS =
  "id, category_id, name, slug, description, pricing_mode, base_price_centavos, min_order_qty, size_chart_id, created_at";

/**
 * Every product a visitor may see, whole: photos, tiers, surcharges, variants
 * and the stock bucket of each variant.
 *
 * One read per table rather than an embedded select, matching the rest of the
 * data layer (and `npm run check:schema`, which reads plain column lists). A
 * store of this size is a few dozen products; if it grows past a few hundred
 * this is the place to page.
 */
export const getStoreProducts = cache(async (): Promise<StoreProduct[]> => {
  const supabase = await client();
  if (!supabase) return [];

  const { data: rows, error } = await supabase
    .from("store_products")
    .select(PRODUCT_COLUMNS)
    .eq("is_visible", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [categories, photos, tiers, surcharges, variants, availability, charts] =
    await Promise.all([
      supabase.from("store_categories").select("id, name, slug"),
      supabase
        .from("store_product_photos")
        .select("product_id, storage_path, alt, sort_order")
        .in("product_id", ids)
        .order("sort_order"),
      supabase
        .from("store_bulk_tiers")
        .select("product_id, min_qty, unit_price_centavos")
        .in("product_id", ids)
        .order("min_qty"),
      supabase
        .from("store_size_prices")
        .select("product_id, size, surcharge_centavos")
        .in("product_id", ids),
      supabase
        .from("store_variants")
        .select("id, product_id, size, color, color_hex, sort_order")
        .in("product_id", ids)
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("store_variant_availability").select("variant_id, availability"),
      supabase.from("store_size_charts").select("id, name, image_path, columns, rows, note"),
    ]);

  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const chartById = new Map<string, SizeChart>(
    (charts.data ?? []).map((c) => [
      c.id,
      {
        name: c.name,
        imagePath: c.image_path,
        columns: c.columns ?? [],
        rows: parseChartRows(c.rows),
        note: c.note,
      },
    ]),
  );
  const stockByVariant = new Map<string, Availability>(
    (availability.data ?? []).map((a) => [a.variant_id, a.availability as Availability]),
  );

  const group = <T extends { product_id: string }>(list: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const item of list ?? []) {
      map.set(item.product_id, [...(map.get(item.product_id) ?? []), item]);
    }
    return map;
  };
  const photosBy = group(photos.data);
  const tiersBy = group(tiers.data);
  const surchargesBy = group(surcharges.data);
  const variantsBy = group(variants.data);

  return rows.map((row): StoreProduct => {
    const category = row.category_id ? categoryById.get(row.category_id) : undefined;
    const quote = row.pricing_mode === "quote";

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      categoryName: category?.name ?? null,
      categorySlug: category?.slug ?? null,
      pricingMode: quote ? "quote" : "fixed",
      basePriceCentavos: quote ? null : row.base_price_centavos,
      minOrderQty: row.min_order_qty,
      createdAt: row.created_at,
      photos: (photosBy.get(row.id) ?? []).map((p) => ({
        path: p.storage_path,
        alt: p.alt,
      })),
      tiers: quote
        ? []
        : (tiersBy.get(row.id) ?? []).map((t) => ({
            minQty: t.min_qty,
            unitPriceCentavos: t.unit_price_centavos,
          })),
      sizeSurcharges: quote
        ? {}
        : Object.fromEntries(
            (surchargesBy.get(row.id) ?? []).map((s) => [s.size, s.surcharge_centavos]),
          ),
      variants: (variantsBy.get(row.id) ?? []).map((v) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        colorHex: v.color_hex,
        availability: stockByVariant.get(v.id) ?? null,
      })),
      sizeChart: row.size_chart_id ? (chartById.get(row.size_chart_id) ?? null) : null,
    };
  });
});

export async function getStoreProductBySlug(slug: string): Promise<StoreProduct | null> {
  const products = await getStoreProducts();
  return products.find((product) => product.slug === slug) ?? null;
}

/** Products by id, in the order asked - for the recently viewed strip. */
export async function getStoreProductsByIds(ids: readonly string[]): Promise<StoreProduct[]> {
  const products = await getStoreProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => p !== undefined);
}

/** Names for the search box's suggestions. Visible products only, by policy. */
export async function getSuggestionNames(term: string): Promise<string[]> {
  const supabase = await client();
  if (!supabase) return [];

  const { data } = await supabase
    .from("store_products")
    .select("name")
    .ilike("name", `%${term}%`)
    .eq("is_visible", true)
    .is("deleted_at", null)
    .limit(30);

  return (data ?? []).map((row) => row.name);
}
