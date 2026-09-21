import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Card, Disclosure, Notice, TAP_AREA } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import {
  getOnlineDesigns,
  getOnlineOrder,
  getOnlineProducts,
  getProductionStages,
} from "@/lib/data/online";
import { formatManilaDateTime } from "@/lib/datetime";
import { sizeSummary, sizesFromRoster } from "@/lib/online/items";
import { messageFor } from "@/lib/online/messages";
import { stageNote } from "@/lib/online/production";
import { isOverdue } from "@/lib/online/status";
import {
  designImageUrl,
  ORDER_FILES_BUCKET,
  productImageUrl,
  SIGNED_URL_SECONDS,
} from "@/lib/online/storage";
import { lineTotalLabel } from "@/lib/online/totals";
import { FULFIL_LABELS } from "@/lib/online/types";
import { formatCivilDate, manilaToday } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { OnlineTabs } from "../OnlineTabs";
import { StatusBadge } from "../StatusBadge";
import { onlineTabs } from "../tabs";
import { CopyMessage } from "./CopyMessage";
import { OrderMoves } from "./OrderMoves";
import { PaymentBox } from "./PaymentBox";
import { ProductionBox } from "./ProductionBox";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  return { title: `${orderNo} · Online orders · Dabz System` };
}

export default async function OnlineOrderPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  await connection();
  const user = await requirePermission("apparel_job_orders");

  const { orderNo } = await params;
  const [order, stages, settings, products, designs] = await Promise.all([
    getOnlineOrder(orderNo),
    getProductionStages(),
    getSettings(),
    getOnlineProducts(true),
    getOnlineDesigns(true),
  ]);

  if (!order) notFound();

  const today = manilaToday();
  const late = isOverdue(order, today);
  const note = stageNote(stages, order.productionPath, order.production);

  const productImages = new Map(
    products.map((product) => [
      product.id,
      productImageUrl(product.images[0]?.storagePath ?? null),
    ]),
  );
  const designImages = new Map(
    designs.map((design) => [design.id, designImageUrl(design.imagePath)]),
  );

  /*
    A customer's upload is PRIVATE. Staff get a link that expires in minutes
    rather than a permanent address, so a link pasted into a chat three weeks
    ago cannot still be opened by whoever was in that chat.
  */
  const supabase = await createSupabaseServerClient();
  const fileLinks = new Map<string, string>();
  for (const item of order.items) {
    for (const file of item.files) {
      const { data } = await supabase.storage
        .from(ORDER_FILES_BUCKET)
        .createSignedUrl(file.storagePath, SIGNED_URL_SECONDS);
      if (data?.signedUrl) fileLinks.set(file.id, data.signedUrl);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/online-orders" className={`text-sm text-accent underline ${TAP_AREA}`}>
          <span aria-hidden="true">{"‹"}</span> All online orders
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{order.orderNo}</h1>
          <StatusBadge status={order.status} overdue={late} />
        </div>

        <p className="mt-2 text-muted">
          {order.customerName} &middot; needed by {formatCivilDate(order.dateNeeded)}{" "}
          &middot; {order.pieces} piece{order.pieces === 1 ? "" : "s"}
          {note ? ` · ${note}` : ""}
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(isOwnerOrAdmin(user))} />

      {order.status === "cancelled" ? (
        <Notice tone="attention" title="This order was cancelled">
          {order.cancelReason ? <p>{order.cancelReason}</p> : null}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Items">
            <ul className="space-y-5">
              {order.items.map((item) => {
                const image =
                  (item.designId ? designImages.get(item.designId) : null) ??
                  (item.productId ? productImages.get(item.productId) : null) ??
                  null;
                const sizes =
                  item.roster.length > 0 ? sizesFromRoster(item.roster) : item.sizes;
                const summary = sizeSummary(sizes);

                return (
                  <li key={item.id} className="flex flex-wrap gap-4">
                    <div className="size-20 shrink-0 overflow-hidden rounded-control bg-tile">
                      {image ? (
                        <Image
                          src={image}
                          alt=""
                          width={160}
                          height={160}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-40 flex-1 space-y-1 text-sm">
                      <p className="font-semibold tracking-tight">{item.productName}</p>
                      {item.variantLabel ? (
                        <p className="text-muted">{item.variantLabel}</p>
                      ) : null}
                      {Object.entries(item.options).length > 0 ? (
                        <p className="text-muted">
                          {Object.entries(item.options)
                            .map(([name, value]) => `${name}: ${value}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {item.designCode ? (
                        <p className="text-muted">
                          Design {item.designCode}
                          {item.designName ? ` ${item.designName}` : ""}
                          {item.teamColors ? ` · wants ${item.teamColors}` : ""}
                        </p>
                      ) : null}
                      {summary ? <p className="text-muted">{summary}</p> : null}
                      {item.notes ? <p className="text-muted">{item.notes}</p> : null}

                      {item.files.map((file) => (
                        <p key={file.id}>
                          {fileLinks.has(file.id) ? (
                            <a
                              href={fileLinks.get(file.id)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className={`text-accent underline ${TAP_AREA}`}
                            >
                              {file.originalName}
                            </a>
                          ) : (
                            <span className="text-muted">{file.originalName}</span>
                          )}
                          <span className="text-xs text-muted"> (link expires in a few minutes)</span>
                        </p>
                      ))}

                      <p>
                        {item.qty} piece{item.qty === 1 ? "" : "s"} &middot;{" "}
                        <strong>{lineTotalLabel(item)}</strong>
                      </p>

                      {item.roster.length > 0 ? (
                        <Disclosure label={`The team (${item.roster.length})`}>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                                <th className="py-1 pr-2 font-medium">#</th>
                                <th className="py-1 pr-2 font-medium">Name</th>
                                <th className="py-1 pr-2 font-medium">No.</th>
                                <th className="py-1 font-medium">Size</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.roster.map((entry) => (
                                <tr key={entry.position} className="border-t border-line/60">
                                  <td className="py-1 pr-2 text-muted">{entry.position}</td>
                                  <td className="py-1 pr-2">{entry.playerName ?? "—"}</td>
                                  <td className="py-1 pr-2">{entry.playerNumber ?? "—"}</td>
                                  <td className="py-1">{entry.size}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Disclosure>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card
            title="Message for the customer"
            description="Version 1 sends nothing by itself — this is what to paste."
          >
            <CopyMessage
              message={messageFor({
                order,
                stages,
                downPaymentPercent: settings.apparelDownPaymentPercent,
              })}
            />
          </Card>

          <Card title="Status history">
            <ol className="space-y-2 text-sm">
              {order.history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                  <span>{entry.event}</span>
                  <span className="text-muted">
                    {formatManilaDateTime(entry.createdAt)} &middot; {entry.actorLabel}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Move this order">
            <OrderMoves order={order} />
          </Card>

          <Card title="Production">
            <ProductionBox order={order} stages={stages} />
          </Card>

          <Card title="Payment">
            <PaymentBox order={order} canVoid={isOwnerOrAdmin(user)} />
          </Card>

          <Card title="Customer">
            <dl className="space-y-1 text-sm">
              <Detail label="Name" value={order.customerName} />
              <Detail
                label="Mobile"
                value={
                  <a href={`tel:${order.mobile}`} className={`underline ${TAP_AREA}`}>
                    {order.mobile}
                  </a>
                }
              />
              {order.facebookName ? (
                <Detail label="Facebook" value={order.facebookName} />
              ) : null}
              <Detail label="Getting it" value={FULFIL_LABELS[order.method]} />
              {order.address ? <Detail label="Address" value={order.address} /> : null}
              {order.notes ? <Detail label="Their note" value={order.notes} /> : null}
              <Detail
                label="Ordered"
                value={formatManilaDateTime(order.createdAt)}
              />
              <Detail
                label="Came from"
                value={order.source === "website" ? "The online shop" : "Typed in"}
              />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
