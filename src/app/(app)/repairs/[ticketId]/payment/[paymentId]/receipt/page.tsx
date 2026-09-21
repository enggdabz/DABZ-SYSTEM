import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PaymentReceiptSheet } from "@/components/PaymentReceiptSheet";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { getRepairPaymentReceipt } from "@/lib/data/receipts";

export const metadata = { title: "Payment receipt · Dabz System" };

/**
 * The slip for a down payment or a balance on a repair ticket (spec 3.5).
 *
 * The permission is re-checked here even though a link only appears on screens
 * that already require it: a URL is a public endpoint whether or not anybody
 * linked to it, the same rule as `/reports/export`.
 */
export default async function RepairPaymentReceiptPage({
  params,
}: {
  params: Promise<{ ticketId: string; paymentId: string }>;
}) {
  await connection();

  const { ticketId, paymentId } = await params;
  await requirePermission("dabztech_tickets");

  const [receipt, settings] = await Promise.all([
    getRepairPaymentReceipt(ticketId, paymentId),
    getSettings(),
  ]);

  if (!receipt) notFound();

  return (
    <PaymentReceiptSheet
      receipt={receipt}
      paper={settings.receiptPaper}
      backHref={`/repairs/${ticketId}`}
      backLabel="Back to the repair ticket"
    />
  );
}
