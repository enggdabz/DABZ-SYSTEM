import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getSuppliers } from "@/lib/data/expenses";
import { getStockOverview } from "@/lib/data/stocks";
import { formatManilaDateTime } from "@/lib/datetime";
import { divisionName } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";

import { StockItemForm, StockMovementForms } from "./StockForms";

export const metadata = { title: "Stocks · Dabz System" };

export default async function StocksPage() {
  await connection();

  const user = await requirePermission("stock_in_out");
  const canManage = isOwnerOrAdmin(user);

  const [overview, suppliers] = await Promise.all([
    getStockOverview(),
    getSuppliers(),
  ]);

  const active = overview.lines.filter((line) => line.item.active);
  const stopped = overview.lines.filter((line) => !line.item.active);
  const missingReorder = active.filter((line) => line.item.reorderLevel === null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Stocks</h1>
        <p className="mt-2 text-muted">
          What is on the shelf. Every figure here is added up from the deliveries
          and withdrawals below it &mdash; nothing is stored separately, so the
          number can always be explained.
        </p>
      </div>

      {overview.lines.length === 0 ? (
        <Card title="No materials yet">
          <p className="text-sm text-muted">
            Add the things you buy and use up: bond paper, ink, tarpaulin rolls,
            vinyl, mugs, blank shirts. Nothing was added for you, because the
            unit you count it in and the level you reorder at are yours to
            decide &mdash; an invented reorder level would warn on the wrong day.
          </p>
          {canManage ? (
            <div className="mt-5">
              <StockItemForm suppliers={suppliers} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Ask the owner to add the materials list.
            </p>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card title="Needs attention">
              <p className="text-2xl font-semibold">
                {overview.needingAttention.length}
              </p>
              <p className="mt-1 text-sm text-muted">
                {overview.needingAttention.length === 0
                  ? "Everything is above its reorder level."
                  : "Out of stock, running low, or no level set."}
              </p>
            </Card>

            <Card title="Materials counted">
              <p className="text-2xl font-semibold">{active.length}</p>
              <p className="mt-1 text-sm text-muted">
                {stopped.length > 0
                  ? `${stopped.length} no longer counted.`
                  : "All still in use."}
              </p>
            </Card>

            <Card title="Value on the shelf">
              <p className="text-2xl font-semibold">
                {formatPesos(overview.value.valueCentavos)}
              </p>
              <p className="mt-1 text-sm text-muted">
                {overview.value.unpricedCount > 0 ? (
                  <>
                    <span aria-hidden="true">{"⚠"} </span>
                    {overview.value.unpricedCount} material
                    {overview.value.unpricedCount === 1 ? "" : "s"} left out, with
                    no price set.
                  </>
                ) : (
                  "Every material has a price."
                )}
              </p>
            </Card>
          </div>

          {missingReorder.length > 0 ? (
            <Notice
              tone="attention"
              title={`${missingReorder.length} material${
                missingReorder.length === 1 ? " has" : "s have"
              } no reorder level`}
            >
              Until you set one, the system cannot tell you when to buy more. It
              will not guess: {missingReorder.map((line) => line.item.name).join(", ")}.
            </Notice>
          ) : null}

          <Card
            title="On the shelf"
            description="Tap a material to record a delivery, take some out, or count it."
          >
            <ul className="space-y-6">
              {[...active, ...stopped].map((line) => (
                <li
                  key={line.item.id}
                  className="border-t border-line/60 pt-6 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {line.item.name}
                        {!line.item.active ? (
                          <span className="ml-2 align-middle">
                            <Tag>No longer counted</Tag>
                          </span>
                        ) : null}
                      </h3>
                      <p className="text-xs text-muted">
                        {divisionName(line.item.tag)}
                        {line.lastMovementAt
                          ? ` · last moved ${formatManilaDateTime(line.lastMovementAt)}`
                          : " · nothing recorded yet"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-semibold">
                        {formatQuantity(line.onHand, line.item.unit)}
                      </p>
                      {line.status.needsAttention ? (
                        <p className="text-xs text-attention">
                          <span aria-hidden="true">{"⚠"} </span>
                          {line.status.label}
                        </p>
                      ) : (
                        <p className="text-xs text-muted">{line.status.label}</p>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-muted">
                    {line.item.reorderLevel === null
                      ? "No reorder level set"
                      : `Reorder at ${formatQuantity(
                          line.item.reorderLevel,
                          line.item.unit,
                        )}`}
                    {" · "}
                    {line.item.unitCostCentavos === null
                      ? "no price set"
                      : `${formatPesos(line.item.unitCostCentavos)} per ${line.item.unit}`}
                    {line.valueCentavos !== null
                      ? ` · worth ${formatPesos(line.valueCentavos)}`
                      : ""}
                    {` · ${line.movementCount} movement${
                      line.movementCount === 1 ? "" : "s"
                    }`}
                  </p>

                  {line.item.active ? (
                    <div className="mt-4 space-y-3">
                      <StockMovementForms
                        item={line.item}
                        suppliers={suppliers}
                        canReceive
                      />
                      {canManage ? <StockItemForm item={line.item} suppliers={suppliers} /> : null}
                    </div>
                  ) : canManage ? (
                    <div className="mt-4">
                      <StockItemForm item={line.item} suppliers={suppliers} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {canManage ? (
              <div className="mt-8 border-t border-line/60 pt-6">
                <StockItemForm suppliers={suppliers} />
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
