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
  mergeCollectionRows,
  type CollectionKind,
  type CollectionRow,
  type CollectionsRead,
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

/** How many rows one read of the feed will take, when nobody says otherwise. */
export const COLLECTIONS_DEFAULT_LIMIT = 500;

/**
 * Reads a window of the feed, and says whether it got all of it.
 *
 * Two things it will not do quietly. A failed query comes back as
 * `failed: true` rather than as an empty day - `if (error) return []` turns a
 * missing migration or a stale PostgREST cache into "nothing was taken today",
 * printed in peso signs. And a window with more rows than the cap comes back
 * as `truncated: true` rather than as a total that is short by however much
 * was cut off.
 *
 * The cap is asked for as `limit + 1`: if the extra row arrives, there is more
 * in the window than is being shown, and that is the only way to know.
 */
export async function getCollections(options: {
  /** UTC instants, from `manilaDayRangeUtc` - never a bare calendar date. */
  from: string;
  to: string;
  limit?: number;
}): Promise<CollectionsRead> {
  const supabase = await createSupabaseServerClient();
  const limit = options.limit ?? COLLECTIONS_DEFAULT_LIMIT;

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
      .limit(limit + 1),
    displayNames(supabase),
  ]);

  /*
    The feed did not answer, so ask the three tables it is a view of.

    This is not a guess at the data and it is not a relaxed permission: see
    `rebuildCollections`. It is the same question put to the same rows without
    the view in the way.
  */
  if (error || !data) {
    return rebuildCollections(supabase, options, limit, names);
  }

  const truncated = data.length > limit;
  // Ordered newest first, so the kept rows are the most recent ones.
  const kept = truncated ? data.slice(0, limit) : data;

  return {
    rows: kept.flatMap((raw) => {
      const row = toRow(raw as Record<string, unknown>, names);
      return row ? [row] : [];
    }),
    failed: false,
    truncated,
    feedViewMissing: false,
  };
}

// ---------------------------------------------------------------------------
// The feed, without the feed
// ---------------------------------------------------------------------------

/** A sale's payment method, in the ledger's words. The view's CASE, in TypeScript. */
const SALE_SOURCES: Record<string, MoneySource> = {
  cash: "cash_drawer",
  gcash: "gcash",
  maya: "maya",
  bank: "bank",
};

/**
 * How many ids may go into one `in (...)`.
 *
 * PostgREST puts the list in the QUERY STRING, so a thousand uuids is a
 * thirty-seven kilobyte URL, and something between here and the database will
 * refuse it - a proxy, a gateway, a server's header limit. A month's report
 * asks for up to 5,000 rows, so this is reachable rather than theoretical, and
 * the failure would land on the rescue path where there is nothing to fall
 * back to. A hundred uuids is under four kilobytes, which nothing objects to.
 */
const ID_BATCH = 100;

/**
 * The parent rows a set of payments points at, or null if the read failed.
 *
 * An empty list of ids is an empty map and NOT a failure - there was nothing
 * to ask about, which is a different thing from asking and getting no answer.
 * One failed batch fails the whole lookup, for the reason every other read
 * here does: a half-filled map would silently drop the payments whose order
 * happened to be in the batch that did not arrive.
 */
async function rowsById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: string,
  columns: string,
  ids: string[],
): Promise<Map<string, Record<string, unknown>> | null> {
  if (ids.length === 0) return new Map();

  const batches: string[][] = [];
  for (let at = 0; at < ids.length; at += ID_BATCH) {
    batches.push(ids.slice(at, at + ID_BATCH));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      supabase.from(table).select(columns).in("id", batch),
    ),
  );

  const found = new Map<string, Record<string, unknown>>();
  for (const { data, error } of results) {
    if (error || !data) return null;
    for (const row of data as unknown as Record<string, unknown>[]) {
      found.set(String(row.id), row);
    }
  }

  return found;
}

function idsOf(rows: Record<string, unknown>[], column: string): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[column])
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
}

/**
 * The same day, read from `sales`, `apparel_payments` and `repair_payments`.
 *
 * WHY THIS IS ALLOWED TO EXIST
 * `public.collections` is `security_invoker`, which means it holds no
 * privileges of its own: every row it hands back is a row the policies on
 * those three tables would have handed back anyway. Reading them directly, as
 * the same person, therefore returns the same rows - this opens nothing, adds
 * no policy, and touches neither the service-role key nor a SECURITY DEFINER
 * function. It is the same question with the view taken out of the middle.
 *
 * WHY IT NEEDS TO EXIST
 * On 21 September 2026 migration `0015` had never reached the owner's
 * database, so the view was not there, every read of the feed failed, and the
 * Sales screen - the screen the whole shop looks at - could say nothing about
 * a morning in which money had been taken. The money was never in danger: it
 * was in `sales` the whole time, one table away. A screen that cannot show the
 * day's takings because a CONVENIENCE is missing is a screen with a single
 * point of failure it did not need.
 *
 * THREE THINGS IT COPIES FROM THE VIEW ON PURPOSE
 *   * The counter's division is always `printshoppe`. A sale's LINES may be
 *     apparel or dabztech; the door the money came through is the counter.
 *   * An apparel or repair payment is joined to its order or ticket INNER. A
 *     payment whose parent this person may not read is not theirs to see, and
 *     dropping it is what the view does.
 *   * `taken_at` is when the row was written - `occurred_at` on a sale,
 *     `created_at` on a payment - never the date somebody typed.
 *
 * AND ONE THING IT CANNOT COPY
 * `repair_payments.kind` is added by `0015` as well, so it is not asked for:
 * this path runs precisely when that migration may be missing, and naming a
 * column that is not there would fail the read it is here to rescue. Those
 * rows come back with no kind, which reads as a plain "Payment" - the same
 * answer the system already gives for a repair payment taken before Phase 10,
 * and the honest one, because in this database the kind genuinely is not
 * recorded anywhere this query can reach.
 *
 * ANY of the reads failing fails the whole thing. A staff member who may not
 * see apparel money gets an EMPTY result from that table, never an error, so
 * an error here is a real fault - and leaving one door out of a total silently
 * is exactly what this file exists to refuse.
 */
async function rebuildCollections(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  window: { from: string; to: string },
  limit: number,
  names: Map<string, string>,
): Promise<CollectionsRead> {
  const unreadable: CollectionsRead = {
    rows: [],
    failed: true,
    truncated: false,
    feedViewMissing: false,
  };

  // Each door is capped at limit + 1 as the view's own read is, and the cap is
  // then applied once across all three by `mergeCollectionRows`.
  const cap = limit + 1;

  const [sales, apparel, repairs] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, sale_number, customer_id, total_centavos, payment_method, reference_number, occurred_at, sale_date, created_by, voided_at",
      )
      .gte("occurred_at", window.from)
      .lt("occurred_at", window.to)
      .order("occurred_at", { ascending: false })
      .limit(cap),
    supabase
      .from("apparel_payments")
      .select(
        "id, order_id, amount_centavos, kind, source, reference_number, created_at, paid_on, created_by, voided_at",
      )
      .gte("created_at", window.from)
      .lt("created_at", window.to)
      .order("created_at", { ascending: false })
      .limit(cap),
    supabase
      .from("repair_payments")
      .select(
        "id, ticket_id, amount_centavos, source, reference_number, created_at, paid_on, created_by, voided_at",
      )
      .gte("created_at", window.from)
      .lt("created_at", window.to)
      .order("created_at", { ascending: false })
      .limit(cap),
  ]);

  if (sales.error || !sales.data) return unreadable;
  if (apparel.error || !apparel.data) return unreadable;
  if (repairs.error || !repairs.data) return unreadable;

  const saleRaw = sales.data as Record<string, unknown>[];
  const apparelRaw = apparel.data as Record<string, unknown>[];
  const repairRaw = repairs.data as Record<string, unknown>[];

  const [orders, tickets] = await Promise.all([
    rowsById(
      supabase,
      "apparel_orders",
      "id, order_number, customer_id, team_name",
      idsOf(apparelRaw, "order_id"),
    ),
    rowsById(
      supabase,
      "repair_tickets",
      "id, ticket_number, customer_id, customer_name",
      idsOf(repairRaw, "ticket_id"),
    ),
  ]);

  if (!orders || !tickets) return unreadable;

  /*
    The customers the rows name. The view reaches them with a LEFT join, so a
    customer this person cannot read leaves the name empty rather than dropping
    the payment - a walk-in has no customer row at all and must still appear.
  */
  const customers = await rowsById(
    supabase,
    "customers",
    "id, name",
    idsOf([...saleRaw, ...orders.values()], "customer_id"),
  );
  if (!customers) return unreadable;

  const customerName = (id: unknown): string | null =>
    typeof id === "string"
      ? ((customers.get(id)?.name as string | null) ?? null)
      : null;

  const takenBy = (id: unknown): string | null =>
    typeof id === "string" ? (names.get(id) ?? null) : null;

  const text = (value: unknown): string | null =>
    typeof value === "string" ? value : null;

  const saleRows: CollectionRow[] = saleRaw.map((raw) => {
    const id = String(raw.id);
    return {
      id,
      kind: "counter_sale",
      division: "printshoppe",
      paymentKind: "sale",
      reference: String(raw.sale_number),
      customerName: customerName(raw.customer_id),
      amountCentavos: Number(raw.total_centavos),
      // `?? "cash_drawer"` is the view's own `else` branch, not a guess: the
      // column is constrained to those four methods by 0005.
      source: SALE_SOURCES[String(raw.payment_method)] ?? "cash_drawer",
      referenceNumber: text(raw.reference_number),
      takenAt: String(raw.occurred_at),
      recordedForISO: String(raw.sale_date),
      takenBy: takenBy(raw.created_by),
      voidedAt: text(raw.voided_at),
      href: hrefFor("counter_sale", id, id),
    };
  });

  const apparelRows: CollectionRow[] = apparelRaw.flatMap((raw) => {
    const orderId = String(raw.order_id);
    const order = orders.get(orderId);
    if (!order) return [];

    const id = String(raw.id);
    return [
      {
        id,
        kind: "apparel_payment",
        division: "apparel",
        paymentKind: (text(raw.kind) as PaymentKind) ?? null,
        reference: String(order.order_number),
        // coalesce(customer, team): a team name is what the counter calls an
        // order that was never attached to a customer record.
        customerName: customerName(order.customer_id) ?? text(order.team_name),
        amountCentavos: Number(raw.amount_centavos),
        source: String(raw.source) as MoneySource,
        referenceNumber: text(raw.reference_number),
        takenAt: String(raw.created_at),
        recordedForISO: String(raw.paid_on),
        takenBy: takenBy(raw.created_by),
        voidedAt: text(raw.voided_at),
        href: hrefFor("apparel_payment", id, orderId),
      },
    ];
  });

  const repairRows: CollectionRow[] = repairRaw.flatMap((raw) => {
    const ticketId = String(raw.ticket_id);
    const ticket = tickets.get(ticketId);
    if (!ticket) return [];

    const id = String(raw.id);
    return [
      {
        id,
        kind: "repair_payment",
        division: "dabztech",
        // Not read - see the note above about 0015 and `kind`.
        paymentKind: null,
        reference: String(ticket.ticket_number),
        customerName: text(ticket.customer_name),
        amountCentavos: Number(raw.amount_centavos),
        source: String(raw.source) as MoneySource,
        referenceNumber: text(raw.reference_number),
        takenAt: String(raw.created_at),
        recordedForISO: String(raw.paid_on),
        takenBy: takenBy(raw.created_by),
        voidedAt: text(raw.voided_at),
        href: hrefFor("repair_payment", id, ticketId),
      },
    ];
  });

  const merged = mergeCollectionRows(
    [saleRows, apparelRows, repairRows],
    limit,
  );

  return {
    rows: merged.rows,
    failed: false,
    truncated: merged.truncated,
    feedViewMissing: true,
  };
}

/**
 * One Manila day's collections.
 *
 * The window is worked out by `manilaDayRangeUtc`, so a down payment taken at
 * 11:50 pm belongs to that day rather than the next - comparing a stored UTC
 * timestamp to a bare date would move it, every night.
 */
export async function getCollectionsForDay(
  date: CivilDate,
  limit = COLLECTIONS_DEFAULT_LIMIT,
): Promise<CollectionsRead> {
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
