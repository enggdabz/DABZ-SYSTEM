import "server-only";

/**
 * Reading DabzTech repair tickets (spec 9).
 *
 * A ticket's total is never read from a column, because there is no such
 * column: it is added up from its lines every time. And there is no password
 * to read, because nothing here stores one (spec 9.3).
 */
import { cache } from "react";

import {
  ticketTotals,
  ticketWarnings,
  warrantyStatus,
  unclaimedStatus,
  type LineKind,
  type TicketLine,
  type TicketPayment,
  type TicketStatus,
  type TicketTotals,
  type TicketWarning,
  type UnitKind,
  type UnlockMethod,
  type WarrantyStatus,
} from "@/lib/repairs";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RepairService {
  id: string;
  name: string;
  unitKind: UnitKind | "any";
  priceCentavos: number | null;
  incomeCategory: string;
  isCheckingFee: boolean;
  sortOrder: number;
  active: boolean;
  note: string | null;
}

export interface RepairTicket {
  id: string;
  ticketNumber: string;
  receivedOn: string;
  customerId: string | null;
  customerName: string;
  contactNumber: string | null;
  unitKind: UnitKind;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  accessories: string | null;
  conditionNote: string | null;
  problem: string;
  diagnosis: string | null;
  unlockMethod: UnlockMethod;
  status: TicketStatus;
  promisedOn: string | null;
  readyOn: string | null;
  releasedOn: string | null;
  warrantyDays: number | null;
  declineReason: string | null;
  note: string | null;
}

export interface RepairTicketDetail {
  ticket: RepairTicket;
  lines: TicketLine[];
  payments: TicketPayment[];
  totals: TicketTotals;
  warnings: TicketWarning[];
  warranty: WarrantyStatus;
  unclaimed: ReturnType<typeof unclaimedStatus>;
}

export const getRepairServices = cache(async (): Promise<RepairService[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("repair_services")
    .select(
      "id, name, unit_kind, price_centavos, income_category, is_checking_fee, sort_order, active, note",
    )
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    unitKind: row.unit_kind as UnitKind | "any",
    priceCentavos: row.price_centavos === null ? null : Number(row.price_centavos),
    incomeCategory: row.income_category,
    isCheckingFee: row.is_checking_fee,
    sortOrder: Number(row.sort_order),
    active: row.active,
    note: row.note,
  }));
});

const TICKET_COLUMNS =
  "id, ticket_number, received_on, customer_id, customer_name, contact_number, unit_kind, brand, model, serial_number, accessories, condition_note, problem, diagnosis, unlock_method, status, promised_on, ready_on, released_on, warranty_days, decline_reason, note";

function toTicket(row: Record<string, unknown>): RepairTicket {
  return {
    id: String(row.id),
    ticketNumber: String(row.ticket_number),
    receivedOn: String(row.received_on),
    customerId: (row.customer_id as string | null) ?? null,
    customerName: String(row.customer_name),
    contactNumber: (row.contact_number as string | null) ?? null,
    unitKind: String(row.unit_kind) as UnitKind,
    brand: (row.brand as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serialNumber: (row.serial_number as string | null) ?? null,
    accessories: (row.accessories as string | null) ?? null,
    conditionNote: (row.condition_note as string | null) ?? null,
    problem: String(row.problem),
    diagnosis: (row.diagnosis as string | null) ?? null,
    unlockMethod: String(row.unlock_method) as UnlockMethod,
    status: String(row.status) as TicketStatus,
    promisedOn: (row.promised_on as string | null) ?? null,
    readyOn: (row.ready_on as string | null) ?? null,
    releasedOn: (row.released_on as string | null) ?? null,
    warrantyDays: row.warranty_days === null ? null : Number(row.warranty_days),
    declineReason: (row.decline_reason as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

function toLine(row: Record<string, unknown>): TicketLine {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    kind: String(row.kind) as LineKind,
    name: String(row.name),
    unitPriceCentavos: Number(row.unit_price_centavos),
    quantity: Number(row.quantity),
    incomeCategory: String(row.income_category),
    stockItemId: (row.stock_item_id as string | null) ?? null,
  };
}

function toPayment(row: Record<string, unknown>): TicketPayment {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    amountCentavos: Number(row.amount_centavos),
    paidOn: String(row.paid_on),
    source: String(row.source),
    note: (row.note as string | null) ?? null,
  };
}

/**
 * Every ticket, with its totals worked out.
 *
 * Read in three queries rather than one joined one: joining lines to payments
 * would multiply them together and the totals would be nonsense.
 */
export const getRepairTickets = cache(
  async (options?: {
    limit?: number;
    unclaimedAfterDays?: number;
  }): Promise<RepairTicketDetail[]> => {
    const supabase = await createSupabaseServerClient();
    const today = civilDateToISO(manilaToday());
    const unclaimedAfterDays = options?.unclaimedAfterDays ?? 30;

    const { data: ticketRows, error } = await supabase
      .from("repair_tickets")
      .select(TICKET_COLUMNS)
      .order("received_on", { ascending: false })
      .limit(options?.limit ?? 200);

    if (error || !ticketRows || ticketRows.length === 0) return [];

    const [{ data: lineRows }, { data: paymentRows }] = await Promise.all([
      supabase
        .from("repair_lines")
        .select(
          "id, ticket_id, kind, name, unit_price_centavos, quantity, income_category, stock_item_id",
        ),
      // Voided payments are skipped, exactly as voided ledger entries are.
      supabase
        .from("repair_payments")
        .select("id, ticket_id, amount_centavos, paid_on, source, note, voided_at")
        .order("paid_on", { ascending: false }),
    ]);

    const allLines = (lineRows ?? []).map((row) => toLine(row as Record<string, unknown>));
    const livePayments = (paymentRows ?? [])
      .filter((row) => row.voided_at === null)
      .map((row) => toPayment(row as Record<string, unknown>));

    return ticketRows.map((row) => {
      const ticket = toTicket(row as Record<string, unknown>);
      const lines = allLines.filter((line) => line.ticketId === ticket.id);
      const payments = livePayments.filter(
        (payment) => payment.ticketId === ticket.id,
      );

      const totals = ticketTotals({ lines, payments });

      return {
        ticket,
        lines,
        payments,
        totals,
        warnings: ticketWarnings({
          status: ticket.status,
          promisedOn: ticket.promisedOn,
          readyOn: ticket.readyOn,
          today,
          unclaimedAfterDays,
          totals,
        }),
        warranty: warrantyStatus({
          releasedOn: ticket.releasedOn,
          warrantyDays: ticket.warrantyDays,
          today,
        }),
        unclaimed: unclaimedStatus({
          status: ticket.status,
          readyOn: ticket.readyOn,
          unclaimedAfterDays,
          today,
        }),
      };
    });
  },
);

export async function getRepairTicket(
  ticketId: string,
  unclaimedAfterDays?: number,
): Promise<RepairTicketDetail | null> {
  const tickets = await getRepairTickets({ unclaimedAfterDays });
  return tickets.find((entry) => entry.ticket.id === ticketId) ?? null;
}

/** Voided payments, shown on the ticket so a void can be explained. */
export async function getVoidedRepairPayments(
  ticketId: string,
): Promise<{ id: string; amountCentavos: number; voidReason: string | null }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("repair_payments")
    .select("id, ticket_id, amount_centavos, void_reason, voided_at")
    .eq("ticket_id", ticketId)
    .order("paid_on", { ascending: false });

  if (error || !data) return [];

  return data
    .filter((row) => row.voided_at !== null)
    .map((row) => ({
      id: row.id,
      amountCentavos: Number(row.amount_centavos),
      voidReason: row.void_reason,
    }));
}
