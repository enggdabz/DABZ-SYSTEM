import "server-only";

/**
 * Reading one payment, so it can be printed for the customer (spec 3.5).
 *
 * These are separate from `getApparelOrders` and `getRepairTickets` for one
 * reason: those two drop voided payments, and a receipt has to be able to
 * print a voided one - with VOIDED across it - so that a slip somebody is
 * holding can always be looked up and shown to be worthless.
 *
 * Row Level Security still decides whether the payment comes back at all: this
 * uses the ordinary server client, so a person without the division's
 * permission gets nothing and the route answers "not found".
 */
import { orderTotals } from "@/lib/apparel";
import { receiptFigures, type ReceiptFigures } from "@/lib/collections";
import { getApparelOrder } from "@/lib/data/apparel";
import { getRepairTicket } from "@/lib/data/repairs";
import type { DivisionId } from "@/lib/divisions";
import type { MoneySource } from "@/lib/ledger";
import { ticketTotals } from "@/lib/repairs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PaymentReceipt {
  division: DivisionId;
  /** Job order number or ticket number. */
  reference: string;
  customerName: string;
  /** A team, or the unit being repaired. Printed under the customer. */
  detail: string | null;

  paymentId: string;
  amountCentavos: number;
  source: MoneySource;
  referenceNumber: string | null;
  kind: "down_payment" | "balance" | null;
  note: string | null;
  /** UTC. Printed in Manila time. */
  takenAt: string;
  /** The date somebody typed, which is usually the same day. */
  paidOnISO: string;
  takenBy: string | null;

  voidedAt: string | null;
  voidReason: string | null;

  figures: ReceiptFigures;
}

const PAYMENT_COLUMNS =
  "id, amount_centavos, paid_on, source, kind, reference_number, note, created_at, created_by, voided_at, void_reason";

/** Who took the payment, when the reader is allowed to know. */
async function nameOf(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.full_name as string | undefined) ?? null;
}

export async function getApparelPaymentReceipt(
  orderId: string,
  paymentId: string,
): Promise<PaymentReceipt | null> {
  const detail = await getApparelOrder(orderId);
  if (!detail) return null;

  const supabase = await createSupabaseServerClient();

  // Every payment on the order, voided ones included - the live list alone
  // cannot print a voided slip, and the live list alone cannot say what was
  // paid before one.
  const { data, error } = await supabase
    .from("apparel_payments")
    .select(PAYMENT_COLUMNS)
    .eq("order_id", orderId);

  if (error || !data) return null;

  const raw = data.find((row) => row.id === paymentId);
  if (!raw) return null;

  const totals = orderTotals({
    lines: detail.lines,
    roster: detail.roster,
    payments: detail.payments,
  });

  return {
    division: "apparel",
    reference: detail.order.orderNumber,
    customerName:
      detail.order.customerName ?? detail.order.teamName ?? "Walk-in",
    detail:
      detail.order.teamName && detail.order.teamName !== detail.order.customerName
        ? detail.order.teamName
        : null,

    paymentId: String(raw.id),
    amountCentavos: Number(raw.amount_centavos),
    source: String(raw.source) as MoneySource,
    referenceNumber: (raw.reference_number as string | null) ?? null,
    kind:
      raw.kind === "down_payment" || raw.kind === "balance" ? raw.kind : null,
    note: (raw.note as string | null) ?? null,
    takenAt: String(raw.created_at),
    paidOnISO: String(raw.paid_on),
    takenBy: await nameOf(supabase, (raw.created_by as string | null) ?? null),

    voidedAt: (raw.voided_at as string | null) ?? null,
    voidReason: (raw.void_reason as string | null) ?? null,

    figures: receiptFigures({
      totalCentavos: totals.totalCentavos,
      livePayments: data
        .filter((row) => row.voided_at === null)
        .map((row) => ({
          id: String(row.id),
          takenAt: String(row.created_at),
          amountCentavos: Number(row.amount_centavos),
        })),
      payment: {
        id: String(raw.id),
        takenAt: String(raw.created_at),
        amountCentavos: Number(raw.amount_centavos),
        voided: raw.voided_at !== null,
      },
    }),
  };
}

export async function getRepairPaymentReceipt(
  ticketId: string,
  paymentId: string,
): Promise<PaymentReceipt | null> {
  const detail = await getRepairTicket(ticketId);
  if (!detail) return null;

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("repair_payments")
    .select(PAYMENT_COLUMNS)
    .eq("ticket_id", ticketId);

  if (error || !data) return null;

  const raw = data.find((row) => row.id === paymentId);
  if (!raw) return null;

  const totals = ticketTotals({
    lines: detail.lines,
    payments: detail.payments,
  });

  return {
    division: "dabztech",
    reference: detail.ticket.ticketNumber,
    customerName: detail.ticket.customerName,
    detail:
      [detail.ticket.brand, detail.ticket.model].filter(Boolean).join(" ") ||
      null,

    paymentId: String(raw.id),
    amountCentavos: Number(raw.amount_centavos),
    source: String(raw.source) as MoneySource,
    referenceNumber: (raw.reference_number as string | null) ?? null,
    kind:
      raw.kind === "down_payment" || raw.kind === "balance" ? raw.kind : null,
    note: (raw.note as string | null) ?? null,
    takenAt: String(raw.created_at),
    paidOnISO: String(raw.paid_on),
    takenBy: await nameOf(supabase, (raw.created_by as string | null) ?? null),

    voidedAt: (raw.voided_at as string | null) ?? null,
    voidReason: (raw.void_reason as string | null) ?? null,

    figures: receiptFigures({
      totalCentavos: totals.totalCentavos,
      livePayments: data
        .filter((row) => row.voided_at === null)
        .map((row) => ({
          id: String(row.id),
          takenAt: String(row.created_at),
          amountCentavos: Number(row.amount_centavos),
        })),
      payment: {
        id: String(raw.id),
        takenAt: String(raw.created_at),
        amountCentavos: Number(raw.amount_centavos),
        voided: raw.voided_at !== null,
      },
    }),
  };
}
