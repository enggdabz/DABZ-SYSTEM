import "server-only";

/**
 * Data for the 5-day bill reminder (spec 12.1).
 * Kept apart from the screens so the header and the Overview agree.
 */
import { billsNeedingAttention } from "@/lib/bills";
import type { DueSoonBill } from "@/components/BillsDueSoon";
import { getBillPayments, getBills, paidKeysFrom } from "@/lib/data/money";
import { formatPesos } from "@/lib/money";
import { currentPeriod, formatPeriod, manilaToday } from "@/lib/period";

export async function getBillsDueSoon(): Promise<DueSoonBill[]> {
  const today = manilaToday();
  const period = currentPeriod();

  const [bills, payments] = await Promise.all([
    getBills(),
    getBillPayments(period),
  ]);

  return billsNeedingAttention({
    bills,
    paidKeys: paidKeysFrom(payments),
    period,
    today,
  }).map((entry) => ({
    id: entry.bill.id,
    name: entry.bill.name,
    amountLabel: formatPesos(entry.bill.amountCentavos),
    statusLabel: entry.status.label,
    periodLabel: formatPeriod(entry.period),
    overdue: entry.status.kind === "overdue",
  }));
}
