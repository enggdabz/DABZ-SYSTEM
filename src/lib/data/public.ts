import "server-only";

/**
 * What the public page shows (Phase 9).
 *
 * Read with the ADMIN client, not the ordinary one - and that is worth being
 * clear about, because it is the one place outside sign-in that does so.
 *
 * A visitor is nobody: Row Level Security would hand them an empty list, and a
 * shop page with no services on it is worse than no page. So this module asks
 * for exactly three things - the products, the apparel items and the repair
 * services, all of them price lists a customer would see on a wall anyway -
 * and returns nothing else. It reads and never writes.
 */
import { cache } from "react";

import type { DivisionId } from "@/lib/divisions";
import { UNIT_KIND_LABELS, type UnitKind } from "@/lib/repairs";
import { createSupabaseAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

export interface PublicService {
  name: string;
  /** Null where the owner has not set one - the page then says "ask us". */
  priceCentavos: number | null;
  unit: string | null;
  note: string | null;
}

export interface PublicDivision {
  id: DivisionId;
  services: PublicService[];
}

/**
 * The three price lists, as a customer would read them.
 *
 * Anything the owner has not priced is still listed - a shop that does
 * lamination should say so even before it has decided what to charge - and the
 * page asks the customer to enquire instead of inventing a number.
 */
export const getPublicServices = cache(async (): Promise<PublicDivision[]> => {
  if (!isAdminClientConfigured()) {
    return [
      { id: "printshoppe", services: [] },
      { id: "apparel", services: [] },
      { id: "dabztech", services: [] },
    ];
  }

  const admin = createSupabaseAdminClient();

  const [products, apparel, repairs] = await Promise.all([
    admin
      .from("products")
      .select("name, price_centavos, unit, division, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
    admin
      .from("apparel_products")
      .select("name, base_price_centavos, active, sort_order, note")
      .eq("active", true)
      .order("sort_order"),
    admin
      .from("repair_services")
      .select("name, price_centavos, unit_kind, active, sort_order, is_checking_fee")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const printshoppe: PublicService[] = (products.data ?? [])
    .filter((row) => row.division === "printshoppe")
    .map((row) => ({
      name: row.name,
      priceCentavos:
        row.price_centavos === null ? null : Number(row.price_centavos),
      unit: row.unit ?? null,
      note: null,
    }));

  const apparelServices: PublicService[] = (apparel.data ?? []).map((row) => ({
    name: row.name,
    priceCentavos:
      row.base_price_centavos === null ? null : Number(row.base_price_centavos),
    unit: null,
    note: row.note ?? null,
  }));

  /*
    The unit is part of the NAME here, not a separate column.

    The same service can be priced per machine (open decision 17.11), so
    "Cleaning & repaste" appears twice at two prices. On an internal screen the
    unit sits in its own column; on a page a customer reads once, two identical
    lines at different prices look like a mistake. So the machine goes in the
    name and the question answers itself.
  */
  const repairServices: PublicService[] = (repairs.data ?? []).map((row) => {
    const unitLabel =
      row.unit_kind === null || row.unit_kind === undefined
        ? null
        : (UNIT_KIND_LABELS[row.unit_kind as UnitKind] ?? null);

    return {
      name: unitLabel ? `${row.name} (${unitLabel.toLowerCase()})` : row.name,
      priceCentavos: row.price_centavos === null ? null : Number(row.price_centavos),
      unit: null,
      // Customers ask this before anything else, so it is said on the line.
      note: row.is_checking_fee ? "Charged even if you decide not to repair" : null,
    };
  });

  return [
    { id: "printshoppe", services: printshoppe },
    { id: "apparel", services: apparelServices },
    { id: "dabztech", services: repairServices },
  ];
});

/**
 * The shop's own settings, for a visitor who is not signed in.
 *
 * `getSettings()` in the DAL uses the signed-in client, which hands a stranger
 * nothing, so the public page needs its own reader. It returns only the row a
 * customer is meant to see printed on a page anyway.
 */
export const getPublicSettings = cache(async () => {
  if (!isAdminClientConfigured()) return null;

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("app_settings").select("*").eq("id", 1).maybeSingle();

  return data ?? null;
});
