import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { ORDER_STATUS_LABELS } from "@/lib/apparel";
import { requirePermission } from "@/lib/auth/dal";
import { getApparelOrder } from "@/lib/data/apparel";
import { getProductionSteps, productionFor } from "@/lib/data/production";
import { formatManilaDateTime } from "@/lib/datetime";
import {
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_LABELS,
  itemStatusLabel,
  projectStatusLabel,
  projectStatusNote,
  statusDisagreement,
  type ItemProduction,
} from "@/lib/production";
import { formatCivilDate, parseISODate } from "@/lib/period";

import { ItemBenchesForm } from "../ProductionForms";

export const metadata = { title: "Production · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/** The line under an item's name: where it is, and anything odd about it. */
function ItemNote({ item }: { item: ItemProduction }) {
  return (
    <>
      <p className="text-xs text-muted">
        {item.quantity} piece{item.quantity === 1 ? "" : "s"}
        {item.lastMarkedAt
          ? ` · last marked ${formatManilaDateTime(item.lastMarkedAt)}`
          : " · nothing marked yet"}
      </p>

      {/*
        A skipped bench is stated, never quietly filled in. "At Design, but
        Print is ticked" is the sentence somebody needs in order to go and
        find out which of the two is actually true.
      */}
      {item.missing.length > 0 ? (
        <p className="mt-1 text-xs text-attention">
          <span aria-hidden="true">{"⚠"} </span>
          {item.missing.map((stage) => PRODUCTION_STAGE_LABELS[stage]).join(", ")}{" "}
          {item.missing.length === 1 ? "is" : "are"} not marked, but{" "}
          {item.furthest ? PRODUCTION_STAGE_LABELS[item.furthest] : ""} is. This
          item counts as being at {itemStatusLabel(item).toLowerCase()} until
          they are.
        </p>
      ) : null}
    </>
  );
}

export default async function ProductionProjectPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await connection();

  await requirePermission("apparel_job_orders");

  const { orderId } = await params;

  const [detail, marks] = await Promise.all([
    getApparelOrder(orderId),
    getProductionSteps(),
  ]);

  if (!detail) notFound();

  const { order } = detail;
  const production = productionFor(detail, marks.steps);
  const cancelled = order.status === "cancelled";

  const disagreement = statusDisagreement({
    project: production,
    orderStatus: order.status,
    orderStatusLabel: ORDER_STATUS_LABELS[order.status],
  });

  const tone = production.complete
    ? "success"
    : production.noItems || production.stage === null
      ? "neutral"
      : "accent";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/production"
          className={`text-sm text-muted underline ${TAP_AREA}`}
        >
          &larr; Production report
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {order.teamName ?? order.orderNumber}
            </h1>
            <p className="mt-1 text-muted">
              {order.orderNumber} &middot; {ORDER_STATUS_LABELS[order.status]}
              {order.customerName ? ` · ${order.customerName}` : ""}
              {` · promised ${showDate(order.promisedOn)}`}
            </p>
          </div>
          <Link
            href={`/apparel/${order.id}`}
            className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
          >
            Open the job order
          </Link>
        </div>
      </div>

      {marks.failed ? (
        <Notice
          tone="attention"
          title="The benches could not be read, so nothing below says where this project is"
        >
          {marks.tableMissing ? (
            <p>
              This database does not have the production table yet &mdash; it is
              behind on its migrations. Nothing has been lost, and no mark on
              this screen should be believed until it can be read. Open the{" "}
              <Link href="/system" className={`underline ${TAP_AREA}`}>
                System check
              </Link>
              .
            </p>
          ) : (
            <p>
              The question did not get an answer. Every mark already made is
              still there; this screen simply cannot see them right now.
            </p>
          )}
        </Notice>
      ) : null}

      {cancelled ? (
        <Notice tone="attention" title="This project was cancelled">
          {order.cancelReason ?? "No reason was recorded."} Its benches are kept
          as they were and can no longer be changed.
        </Notice>
      ) : null}

      {/* ---- The final status, summed from the items --------------------- */}
      <Card
        title="Final status of this project"
        description="A project is only as far along as its least advanced item, because the customer collects all of it at once. It is worked out here every time, never stored."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Tag tone={tone}>{projectStatusLabel(production)}</Tag>
          {production.noItems ? null : (
            <span className="text-sm text-muted">
              {production.itemsComplete} of {production.items.length} item
              {production.items.length === 1 ? "" : "s"} through every bench
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-ink/80">{projectStatusNote(production)}</p>

        {production.noItems ? null : (
          <div className="mt-4">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
              role="img"
              aria-label={`${production.marksDone} of ${production.marksTotal} benches marked`}
            >
              <div
                className={`h-full rounded-full ${
                  production.complete ? "bg-success" : "bg-accent"
                }`}
                style={{ width: `${production.percentMarked}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              {production.marksDone} of {production.marksTotal} benches marked
              {production.lastMarkedAt
                ? ` · last marked ${formatManilaDateTime(production.lastMarkedAt)}`
                : ""}
            </p>
          </div>
        )}

        {/*
          Two people said two different things and neither is overruled here.
          The counter moves an order to "Ready for pickup"; the shop floor
          ticks the benches. Showing the disagreement is the only honest
          answer - quietly picking one would make the other a lie.
        */}
        {disagreement ? (
          <div className="mt-5">
            <Notice tone="attention" title="The order and the benches disagree">
              <p>{disagreement}</p>
              <p className="mt-1">
                Neither has been changed.{" "}
                <Link
                  href={`/apparel/${order.id}`}
                  className={`underline underline-offset-2 ${TAP_AREA}`}
                >
                  Move the order
                </Link>{" "}
                or mark the benches below, whichever is the one that is behind.
              </p>
            </Notice>
          </div>
        ) : null}
      </Card>

      {/* ---- The items --------------------------------------------------- */}
      {production.noItems ? (
        <Card title="Nothing is being made on this project yet">
          <Notice tone="info" title="No items on the job order">
            <p>
              The benches belong to the items &mdash; the jerseys, shirts or
              jackets being made. Add them to the job order and they will appear
              here, each with its own {PRODUCTION_STAGES.length} benches.
            </p>
            <p className="mt-2">
              <Link
                href={`/apparel/${order.id}`}
                className={`underline underline-offset-2 ${TAP_AREA}`}
              >
                Open the job order
              </Link>
            </p>
          </Notice>
        </Card>
      ) : (
        <Card
          title={`What is being made (${production.items.length})`}
          description="Tick a bench when the work at it is done. Ticking one says nothing about the benches before it - those are marked by whoever does them."
        >
          <ul className="space-y-8">
            {production.items.map((item) => (
              <li
                key={item.lineId}
                className="border-t border-line/60 pt-8 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{item.name}</h3>
                    <ItemNote item={item} />
                  </div>
                  <Tag
                    tone={
                      item.complete
                        ? "success"
                        : item.reached === null
                          ? "neutral"
                          : "accent"
                    }
                  >
                    {itemStatusLabel(item)}
                  </Tag>
                </div>

                <ItemBenchesForm
                  orderId={order.id}
                  lineId={item.lineId}
                  itemName={item.name}
                  marked={item.marked}
                  disabled={cancelled || marks.failed}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
