import { connection } from "next/server";

import { Notice } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { can, isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getPayableJobs } from "@/lib/data/collections";
import { getCounterProducts, getCustomers } from "@/lib/data/pos";
import { getProjects } from "@/lib/data/projects";
import { productImageUrl } from "@/lib/online/storage";
import { payableProjects, type FindableProject } from "@/lib/project-find";

import { PosScreen } from "./PosScreen";
import { CounterMode } from "./CounterMode";
import { ProjectSaleForm } from "./ProjectSaleForm";
import { TakeOrderPayment } from "./TakeOrderPayment";

export const metadata = { title: "POS · Dabz System" };

export default async function PosPage() {
  await connection();

  // Selling is its own permission (spec 4.3).
  const user = await requirePermission("add_sales");
  const settings = await getSettings();

  /*
    Taking an Apparel or DabzTech payment needs THAT division's permission -
    `add_sales` on its own gives neither (Phase 10, spec 3.2). Somebody with
    only Add sales never sees the button, and the Server Action re-checks
    anyway, because a hidden button is not a rule.
  */
  const canTakeApparel = can(user, "apparel_job_orders");
  const canTakeRepairs = can(user, "dabztech_tickets");

  const [{ products, photosReady }, customers, payableJobs] = await Promise.all([
    getCounterProducts(),
    getCustomers(),
    getPayableJobs({
      apparel: canTakeApparel,
      dabztech: canTakeRepairs,
      unclaimedAfterDays: settings.unclaimedUnitDays,
    }),
  ]);

  /*
    "Find project" needs the projects that can still take a payment. It is read
    on its own and allowed to fail: this page is also the REGULAR sale, and a
    problem with projects - a database still waiting for its latest migration,
    say - must not stop somebody ringing up a photocopy. The Project tab says
    it could not load the list; starting a new project does not need it.
  */
  let openProjects: FindableProject[] = [];
  let projectsUnavailable = false;
  try {
    openProjects = payableProjects(await getProjects());
  } catch {
    projectsUnavailable = true;
  }

  const unpriced = products.filter((product) => product.priceCentavos === null);
  const ownerOrAdmin = isOwnerOrAdmin(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Counter</h1>
          <p className="mt-2 text-muted">
            Type how many of each product the customer wants, then press
            Complete sale. Nothing is saved until you do.
          </p>
        </div>

        {canTakeApparel || canTakeRepairs ? (
          <TakeOrderPayment
            jobs={payableJobs}
            downPaymentPercent={settings.apparelDownPaymentPercent}
          />
        ) : null}
      </div>

      <CounterMode
        regular={
          <div className="space-y-6">
            {products.length === 0 ? (
              <Notice
                tone="info"
                title="No saved products yet, but the counter still works"
              >
                <p>
                  Use <strong>+ New product</strong> below to add one with its
                  price. It appears in the list straight away, ready for a
                  quantity.
                  {ownerOrAdmin
                    ? " The Products screen is where you add them in bulk."
                    : ""}
                </p>
              </Notice>
            ) : null}

            {ownerOrAdmin && !photosReady ? (
              <Notice tone="attention" title="The database is behind: photos and dragging are off">
                <p>
                  Migration <strong>0026</strong> has not been applied yet, so
                  product photos and putting the products in order cannot be
                  saved. Selling works as normal. Run{" "}
                  <code>npm run db:push</code> and reload this page.
                </p>
              </Notice>
            ) : null}

            {unpriced.length > 0 ? (
              <Notice
                tone="info"
                title={`${unpriced.length} ${unpriced.length === 1 ? "product asks" : "products ask"} for the price each time`}
              >
                <p>
                  {unpriced.map((product) => product.name).join(", ")}{" "}
                  {unpriced.length === 1 ? "has" : "have"} no set price yet, so
                  the row has a box for the amount. That is on purpose
                  &mdash; nothing was guessed.
                  {ownerOrAdmin
                    ? " Set the prices on the Products screen to fix them."
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
                imageUrl: productImageUrl(product.imagePath),
              }))}
              customers={customers.map((customer) => ({
                id: customer.id,
                name: customer.name,
                contactNumber: customer.contactNumber,
              }))}
              canManageProducts={ownerOrAdmin && photosReady}
              canDiscount={
                ownerOrAdmin ||
                user.permissions.includes("give_discounts")
              }
              discountLimitPercent={settings.staffDiscountLimitPercent}
              discountLimitCentavos={settings.staffDiscountLimitCentavos}
            />
          </div>
        }
        project={
          <ProjectSaleForm
            customers={customers.map((customer) => ({
              id: customer.id,
              name: customer.name,
              contactNumber: customer.contactNumber,
            }))}
            downPaymentPercent={settings.apparelDownPaymentPercent}
            openProjects={openProjects}
            projectsUnavailable={projectsUnavailable}
          />
        }
      />
    </div>
  );
}
