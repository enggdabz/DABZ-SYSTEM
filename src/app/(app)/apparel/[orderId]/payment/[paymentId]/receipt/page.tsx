import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PaymentReceiptSheet } from "@/components/PaymentReceiptSheet";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { getApparelPaymentReceipt } from "@/lib/data/receipts";

export const metadata = { title: "Payment receipt · Dabz System" };

/**
 * The slip for a down payment or a balance on a job order (spec 3.5).
 *
 * The permission is re-checked here even though a link only appears on screens
 * that already require it: a URL is a public endpoint whether or not anybody
 * linked to it, the same rule as `/reports/export`.
 */
export default async function ApparelPaymentReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string; paymentId: string }>;
}) {
  await connection();

  const { orderId, paymentId } = await params;
  await requirePermission("apparel_job_orders");

  const [receipt, settings] = await Promise.all([
    getApparelPaymentReceipt(orderId, paymentId),
    getSettings(),
  ]);

  // Not found rather than forbidden: if the policies did not return it, this
  // payment is not this person's to know about.
  if (!receipt) notFound();

  return (
    <PaymentReceiptSheet
      receipt={receipt}
      paper={settings.receiptPaper}
      backHref={`/apparel/${orderId}`}
      backLabel="Back to the job order"
    />
  );
}
