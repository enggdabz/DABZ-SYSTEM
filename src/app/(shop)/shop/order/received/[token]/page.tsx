import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { getShopSettings } from "@/lib/data/online";
import { formatCivilDate, parseISODate } from "@/lib/period";
import {
  createSupabaseAdminClient,
  isAdminClientConfigured,
} from "@/lib/supabase/admin";

/**
 * "Order received" (docs/spec.md 8.4).
 *
 * Addressed by the unguessable receipt token, never by the order number.
 * DA-0042 is a four-digit number a customer might type wrong - or right, for
 * somebody else's order - and this page carries a name, a date and a phone
 * number's worth of trust.
 *
 * Read with the admin client, because the customer is nobody and the orders
 * table is shut to them. It returns ONLY what is printed below: no address, no
 * mobile, no money, no history.
 */
export const metadata = {
  title: "Order received · Dabz Apparel",
  robots: { index: false, follow: false },
};

export default async function OrderReceivedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();

  const { token } = await params;
  if (!isAdminClientConfigured()) notFound();

  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("online_orders")
    .select("id, order_no, customer_name, date_needed, method")
    .eq("receipt_token", token)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: totals }, settings] = await Promise.all([
    admin
      .from("online_order_totals")
      .select("pieces, has_quote_items")
      .eq("order_id", order.id)
      .maybeSingle(),
    getShopSettings(),
  ]);

  const dateNeeded = parseISODate(order.date_needed as string);
  const messenger = settings.messengerUsername ?? "";
  const pieces = Number(totals?.pieces ?? 0);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-14 sm:px-6">
      <div className="rounded-[28px] bg-surface p-6 text-center ring-1 ring-line/60 sm:p-10">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Order received
        </p>
        <p className="mt-3 text-[clamp(40px,10vw,72px)] font-semibold leading-none tracking-tight">
          {order.order_no}
        </p>
        <p className="mt-4 text-muted">
          Thank you, {order.customer_name}. Keep this order number.
        </p>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Needed by</dt>
            <dd className="font-medium">
              {dateNeeded ? formatCivilDate(dateNeeded) : (order.date_needed as string)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Pieces</dt>
            <dd className="font-medium">{pieces}</dd>
          </div>
          <div>
            <dt className="text-muted">Getting it</dt>
            <dd className="font-medium">
              {order.method === "delivery" ? "Delivery" : "Pick up"}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-muted">
        {totals?.has_quote_items
          ? "Next: we review your design and send your quote on Messenger, usually within the day."
          : "Next: we confirm your order and down payment on Messenger."}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {/*
          Hidden while the Messenger name is empty, which is how it ships. A
          button that opens m.me/ and lands nowhere is worse than no button
          (open decision D7).
        */}
        {messenger ? (
          <a
            href={`https://m.me/${encodeURIComponent(messenger)}?ref=${encodeURIComponent(order.order_no as string)}`}
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface"
          >
            Continue on Messenger
          </a>
        ) : null}

        <Link
          href="/shop/track"
          className="inline-flex items-center rounded-full px-6 py-3 text-sm font-medium ring-1 ring-ink"
        >
          Track this order
        </Link>

        <Link href="/#order-online" className={`text-sm text-accent underline ${TAP_AREA}`}>
          Back to the shop <span aria-hidden="true">{"›"}</span>
        </Link>
      </div>
    </div>
  );
}
