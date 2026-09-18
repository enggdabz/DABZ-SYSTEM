import type { Metadata } from "next";

import { Pos, type PosProduct } from "@/app/admin/sales/new/pos";
import { Alert, PageHeader } from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import type { Division } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New sale" };

export default async function NewSalePage() {
  await requireUser();

  const [canSell, canDiscount] = await Promise.all([
    hasPermission("add_sales"),
    hasPermission("give_discounts"),
  ]);

  if (!canSell) {
    return (
      <div>
        <PageHeader eyebrow="Sales" title="New sale" />
        <Alert>You do not have permission to add sales.</Alert>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: products }, { data: tiers }, { data: customers }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, division, price_centavos, manual_price, unit, income_category")
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("product_price_tiers")
      .select("product_id, min_quantity, unit_price_centavos"),
    supabase.from("customers").select("id, name").eq("active", true).order("name"),
  ]);

  const tiersByProduct = new Map<string, { min_quantity: number; unit_price_centavos: number }[]>();
  for (const tier of tiers ?? []) {
    const list = tiersByProduct.get(tier.product_id) ?? [];
    list.push({
      min_quantity: tier.min_quantity,
      unit_price_centavos: tier.unit_price_centavos,
    });
    tiersByProduct.set(tier.product_id, list);
  }

  const posProducts: PosProduct[] = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    division: p.division as Division,
    // Null for a manual-price product: the price is typed at the till.
    price_centavos: p.price_centavos ?? 0,
    manual_price: p.manual_price ?? false,
    unit: p.unit,
    income_category: p.income_category,
    tiers: tiersByProduct.get(p.id) ?? [],
  }));

  return (
    <div>
      <PageHeader eyebrow="Sales" title="New sale" description="Ring up a sale." />
      {posProducts.length === 0 ? (
        <Alert>
          There are no active products yet. Add some before ringing up a sale.
        </Alert>
      ) : (
        <Pos products={posProducts} customers={customers ?? []} canDiscount={canDiscount} />
      )}
    </div>
  );
}
