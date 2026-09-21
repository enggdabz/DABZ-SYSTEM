import "server-only";

/**
 * Reading the collections feed (spec: Phase 10).
 *
 * One read of `public.collections`, which is a view over sales, apparel
 * payments and repair payments. The view is `security_invoker`, so the
 * policies already on those three tables decide what comes back: a staff
 * member with only Add sales gets their own counter sales and nothing at all
 * from Apparel or DabzTech, without this file knowing the difference.
 *
 * Nothing here writes. A payment reaches the ledger through complete_sale,
 * record_apparel_payment or record_repair_payment, and nowhere else.
 */
import { cache } from "react";

import { isOpenOrder } from "@/lib/apparel";
import {
  heldForUnfinishedWork,
  type CollectionKind,
  type CollectionRow,
  type HeldMoney,
  type PayableJob,
  type PaymentKind,
} from "@/lib/collections";
import { getApparelOrders } from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { getRepairTickets } from "@/lib/data/repairs";
import type { DivisionId } from "@/lib/divisions";
import type { MoneySource } from "@/lib/ledger";
import { manilaDayRangeUtc, type CivilDate } from "@/lib/period";
import { isOpenTicket, UNIT_KIND_LABELS } from "@/lib/repairs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COLUMNS =
  "id, kind, division, payment_kind, reference, parent_id, customer_id, customer_name, amount_centavos, source, reference_number, taken_at, recorded_for, taken_by, voided_at";

const KINDS: Record<CollectionKind, true> = {
  counter_sale: true,
  apparel_payment: true,
  repair_payment: true,
};

/**
 * Where tapping the row goes.
 *
 * A counter sale opens its own receipt; a payment opens the order or ticket it
 * belongs to, which is where an Owner or Admin voids one. The feed deliberately
 * does NOT offer a void of its own - a second path to the same void is how two
 * of them end up disagreeing.
 */
function hrefFor(kind: CollectionKind, id: string, parentId: string): string {
  switch (kind) {
    case "apparel_payment":
      return `/apparel/${parentId}`;
    case "repair_payment":
      return `/repairs/${parentId}`;
    default:
      return `/sales/${id}/receipt`;
  }
}

function toRow(
  raw: Record<string, unknown>,
  names: Map<string, string>,
): CollectionRow | null {
  const kind = String(raw.kind) as CollectionKind;
  if (!(kind in KINDS)) return null;

  const id = String(raw.id);
  const paymentKind = raw.payment_kind === null ? null : String(raw.payment_kind);

  return {
    id,
    kind,
    division: String(raw.division) as DivisionId,
    paymentKind: (paymentKind as PaymentKind) ?? null,
    reference: String(raw.reference),
    customerName: (raw.customer_name as string | null) ?? null,
    amountCentavos: Number(raw.amount_centavos),
    source: String(raw.source) as MoneySource,
    referenceNumber: (raw.reference_number as string | null) ?? null,
    takenAt: String(raw.taken_at),
    recordedForISO: String(raw.recorded_for),
    takenBy: raw.taken_by === null ? null : names.get(String(raw.taken_by)) ?? null,
    voidedAt: (raw.voided_at as string | null) ?? null,
    href: hrefFor(kind, id, String(raw.parent_id)),
  };
}

/**
 * The people whose names may be shown beside a row.
 *
 * `profiles` is readable only by yourself and by an Owner or Admin, so a staff
 * member reading the feed gets an empty map and the rows say nothing about who
 * took them - which is the correct answer, not a missing one.
 */
async function displayNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("id, full_name");
  return new Map(
    (data ?? []).map((row) => [row.id as string, row.full_name as string]),
  );
}

export const getCollections = cache(
  async (options: {
    /** UTC instants, from `manilaDayRangeUtc` - never a bare calendar date. */
    from: string;
    to: string;
    limit?: number;
  }): Promise<CollectionRow[]> => {
    const supabase = await createSupabaseServerClient();

    // `lt` on the upper bound, never `lte`: the window from manilaDayRangeUtc
    // ends at midnight of the NEXT Manila day, and including it would count a
    // payment twice - once in each day.
    const [{ data, error }, names] = await Promise.all([
      supabase
        .from("collections")
        .select(COLUMNS)
        .gte("taken_at", options.from)
        .lt("taken_at", options.to)
        .order("taken_at", { ascending: false })
        .limit(options.limit ?? 500),
      displayNames(supabase),
    ]);

    if (error || !data) return [];

    return data.flatMap((raw) => {
      const row = toRow(raw as Record<string, unknown>, names);
      return row ? [row] : [];
    });
  },
);

/**
 * One Manila day's collections.
 *
 * The window is worked out by `manilaDayRangeUtc`, so a down payment taken at
 * 11:50 pm belongs to that day rather than the next - comparing a stored UTC
 * timestamp to a bare date would move it, every night.
 */
export async function getCollectionsForDay(
  date: CivilDate,
  limit = 500,
): Promise<CollectionRow[]> {
  const range = manilaDayRangeUtc(date);
  return getCollections({ from: range.from, to: range.to, limit });
}

// ---------------------------------------------------------------------------
// What the counter can take money against (spec 3.2)
// ---------------------------------------------------------------------------

/**
 * Job orders and repair tickets with money still owed.
 *
 * WHAT COUNTS AS STILL OWED
 * A balance above zero, and nothing else. In particular a RELEASED order or
 * ticket is still on this list when it has a balance - spec 8 lets a regular
 * take the jerseys and settle later, and an order that disappeared from the
 * counter would be an order nobody ever chases. A cancelled order is the one
 * that drops off: nothing is owed on work that is not being done.
 *
 * Every balance is worked out from the job's own rows by `orderTotals` and
 * `ticketTotals`, never read from a column, because there is no such column.
 *
 * The two reads are skipped entirely when the person lacks the permission.
 * Row Level Security would return nothing anyway - this only saves the counter
 * two round trips it would learn nothing from.
 */
export async function getPayableJobs(options: {
  apparel: boolean;
  dabztech: boolean;
  unclaimedAfterDays?: number;
}): Promise<PayableJob[]> {
  const [orders, tickets, customers] = await Promise.all([
    options.apparel ? getApparelOrders() : Promise.resolve([]),
    options.dabztech
      ? getRepairTickets({ unclaimedAfterDays: options.unclaimedAfterDays })
      : Promise.resolve([]),
    options.apparel ? getCustomers() : Promise.resolve([]),
  ]);

  const phoneOf = new Map(
    customers.map((customer) => [customer.id, customer.contactNumber]),
  );

  const jobs: PayableJob[] = [];

  for (const entry of orders) {
    if (entry.order.status === "cancelled") continue;
    if (entry.totals.balanceCentavos <= 0) continue;

    const name = entry.order.customerName ?? entry.order.teamName ?? "Walk-in";
    const phone = entry.order.customerId
      ? phoneOf.get(entry.order.customerId) ?? null
      : null;

    jobs.push({
      id: entry.order.id,
      kind: "apparel_order",
      division: "apparel",
      reference: entry.order.orderNumber,
      customerName: name,
      // Whichever of the team and the phone number is not already the name -
      // both are things a customer says at the counter instead of a number.
      detail:
        [entry.order.teamName === name ? null : entry.order.teamName, phone]
          .filter(Boolean)
          .join(" · ") || null,
      totalCentavos: entry.totals.totalCentavos,
      paidCentavos: entry.totals.paidCentavos,
      balanceCentavos: entry.totals.balanceCentavos,
      nothingPaidYet: entry.totals.paidCentavos === 0,
      href: `/apparel/${entry.order.id}`,
    });
  }

  for (const entry of tickets) {
    if (entry.totals.balanceCentavos <= 0) continue;

    jobs.push({
      id: entry.ticket.id,
      kind: "repair_ticket",
      division: "dabztech",
      reference: entry.ticket.ticketNumber,
      customerName: entry.ticket.customerName,
      detail:
        [
          UNIT_KIND_LABELS[entry.ticket.unitKind],
          entry.ticket.brand,
          entry.ticket.contactNumber,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      totalCentavos: entry.totals.totalCentavos,
      paidCentavos: entry.totals.paidCentavos,
      balanceCentavos: entry.totals.balanceCentavos,
      nothingPaidYet: entry.totals.paidCentavos === 0,
      href: `/repairs/${entry.ticket.id}`,
    });
  }

  // Biggest balance first: the counter is usually settling the largest job in
  // front of it, and a long list is scrolled less often that way.
  return jobs.sort((a, b) => b.balanceCentavos - a.balanceCentavos);
}

// ---------------------------------------------------------------------------
// Money already taken for work not yet handed back (spec 3.4)
// ---------------------------------------------------------------------------

/**
 * What the shop is holding against work it still owes.
 *
 * WHAT THIS IS NOT
 * It is not a liability, not a new ledger category, and not a deduction from
 * anything. Every peso in it was recognised as income the day it was taken and
 * stays recognised - this only says which part of that income is for work the
 * customer has not received yet. Subtracting it anywhere would count the same
 * money twice, in opposite directions.
 *
 * WHICH JOBS COUNT
 * An order that has not been released, and a ticket that has not been
 * released. A DECLINED or UNREPAIRABLE unit still counts, because the unit is
 * still on the shelf and the customer has not been handed anything back yet -
 * that is exactly the pile spec 9.4 is about.
 */
export const getHeldMoney = cache(async (): Promise<HeldMoney> => {
  const [orders, tickets] = await Promise.all([
    getApparelOrders(),
    getRepairTickets(),
  ]);

  return heldForUnfinishedWork({
    apparel: orders
      .filter(
        (entry) =>
          isOpenOrder(entry.order.status) && entry.totals.paidCentavos > 0,
      )
      .map((entry) => ({ paidCentavos: entry.totals.paidCentavos })),
    dabztech: tickets
      .filter(
        (entry) =>
          isOpenTicket(entry.ticket.status) && entry.totals.paidCentavos > 0,
      )
      .map((entry) => ({ paidCentavos: entry.totals.paidCentavos })),
  });
});
