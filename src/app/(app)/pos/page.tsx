import { connection } from "next/server";

import { Notice } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getCustomers, getProducts } from "@/lib/data/pos";

import { PosScreen } from "./PosScreen";

export const metadata = { title: "POS · Dabz System" };

export default async function PosPage() {
  await connection();

  // Selling is its own permission (spec 4.3).
  const user = await requirePermission("add_sales");
  const settings = await getSettings();

  const [products, customers] = await Promise.all([getProducts(), getCustomers()]);

  const unpriced = products.filter((product) => product.priceCentavos === null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Counter</h1>
        <p className="mt-2 text-muted">
          Tap a button, confirm the quantity, then complete the sale. Nothing is
          added until you confirm it.
        </p>
      </div>

      {products.length === 0 ? (
        <Notice tone="info" title="No buttons yet, but the counter still works">
          <p>
            Nothing has been added to the product list, so there is nothing to
            tap. Use <strong>New product</strong> below to type an item, a
            quantity and a price straight onto the sale &mdash; and tick
            &ldquo;save this to the product list&rdquo; to turn it into a button
            for next time.
            {isOwnerOrAdmin(user)
              ? " The Products screen is where you add them in bulk."
              : ""}
          </p>
        </Notice>
      ) : null}

      {unpriced.length > 0 ? (
        <Notice
          tone="info"
          title={`${unpriced.length} ${unpriced.length === 1 ? "button asks" : "buttons ask"} for the price each time`}
        >
          <p>
            {unpriced.map((product) => product.name).join(", ")}{" "}
            {unpriced.length === 1 ? "has" : "have"} no set price yet, so the
            counter asks you for the amount. That is on purpose &mdash; nothing
            was guessed.
            {isOwnerOrAdmin(user)
              ? " Set the prices on the Products screen to turn them into fixed buttons."
              : ""}
          </p>
        </Notice>
      ) : null}

      <PosScreen
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          division: product.division,
          priceCentavos: product.priceCentavos,
          manualPrice: product.manualPrice,
          unit: product.unit,
          section: product.section,
          incomeCategory: product.incomeCategory,
          tiers: product.tiers,
        }))}
        customers={customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          contactNumber: customer.contactNumber,
        }))}
        canDiscount={
          isOwnerOrAdmin(user) || user.permissions.includes("give_discounts")
        }
        discountLimitPercent={settings.staffDiscountLimitPercent}
        discountLimitCentavos={settings.staffDiscountLimitCentavos}
      />
    </div>
  );
}
