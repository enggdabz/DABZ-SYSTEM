import "server-only";

/**
 * Reading and writing push subscriptions (Phase 11).
 *
 * Two different connections are used here on purpose, and which one is which
 * matters:
 *
 *   * Anything a signed-in person does about their OWN phone goes through the
 *     ordinary server client, so the policies on `push_subscriptions` decide.
 *   * The digest job runs from a cron, as nobody, and has to read every
 *     Owner/Admin's phones plus the shop's warnings. That cannot pass an RLS
 *     check, so it uses the service-role client - the THIRD sanctioned use in
 *     this system, alongside sign-in and the public page. It is listed in
 *     AGENTS.md with the other two.
 */
import { cache } from "react";

import { billsNeedingAttention, paidKey, type Bill } from "@/lib/bills";
import { sumCentavos } from "@/lib/money";
import type { DigestInput } from "@/lib/notifications";
import {
  currentPeriod,
  manilaToday,
  periodToMonthStartISO,
} from "@/lib/period";
import { unclaimedStatus, type TicketStatus } from "@/lib/repairs";
import {
  buildStockLines,
  itemsNeedingAttention,
  type MovementKind,
  type StockItem,
  type StockMovement,
} from "@/lib/stocks";
import type { ExpenseTag } from "@/lib/divisions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PushSubscriptionRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  lastDigestOn: string | null;
  active: boolean;
  lastError: string | null;
  failureCount: number;
  createdAt: string;
}

const COLUMNS =
  "id, user_id, endpoint, p256dh, auth, user_agent, last_digest_on, active, last_error, failure_count, created_at";

function toRow(raw: Record<string, unknown>): PushSubscriptionRow {
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    endpoint: String(raw.endpoint),
    p256dh: String(raw.p256dh),
    auth: String(raw.auth),
    userAgent: (raw.user_agent as string | null) ?? null,
    lastDigestOn: (raw.last_digest_on as string | null) ?? null,
    active: raw.active !== false,
    lastError: (raw.last_error as string | null) ?? null,
    failureCount: Number(raw.failure_count ?? 0),
    createdAt: String(raw.created_at),
  };
}

/**
 * The signed-in person's own phones.
 *
 * RLS returns only theirs, so this needs no `.eq()` on the user - and adding
 * one would suggest the filtering happens here, which is exactly the
 * misunderstanding that leads somebody to remove a policy later.
 */
export const getMySubscriptions = cache(
  async (): Promise<PushSubscriptionRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(COLUMNS)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data.map((row) => toRow(row as Record<string, unknown>));
  },
);

// ---------------------------------------------------------------------------
// What the digest is made of
// ---------------------------------------------------------------------------

/**
 * Today's warnings, counted - read as NOBODY.
 *
 * This deliberately does NOT call `getBills`, `getStockOverview`,
 * `getRepairTickets` or `getEnquiries`. Every one of those reads through the
 * ordinary server client, which is right for a screen and useless here: a cron
 * has nobody signed in, so Row Level Security would hand back nothing and the
 * digest would be empty every single morning without ever looking broken.
 *
 * So the ROWS are fetched with the service-role client, and then handed to the
 * very same pure functions the screens use - `billsNeedingAttention`,
 * `buildStockLines`, `itemsNeedingAttention`, `unclaimedStatus`. The fetching
 * differs because the caller differs; the judgement of what counts as
 * "needing attention" is shared, which is the part that must never drift.
 */
export async function readDigestInput(options?: {
  unclaimedAfterDays?: number;
}): Promise<DigestInput> {
  const supabase = createSupabaseAdminClient();
  const today = manilaToday();
  const period = currentPeriod();
  const todayISO = `${today.year}-${String(today.month).padStart(2, "0")}-${String(
    today.day,
  ).padStart(2, "0")}`;

  const [
    { data: billRows },
    { data: paymentRows },
    { data: itemRows },
    { data: movementRows },
    { data: ticketRows },
    { count: enquiryCount },
  ] = await Promise.all([
    supabase
      .from("bills")
      .select("id, name, amount_centavos, due_day, type, loan_id, active, note"),
    supabase
      .from("bill_payments")
      .select("bill_id, period_month")
      .eq("period_month", periodToMonthStartISO(period)),
    supabase
      .from("stock_items")
      .select(
        "id, name, unit, tag, reorder_level_thousandths, unit_cost_centavos, photo_path, supplier_id, note, active",
      ),
    supabase
      .from("stock_movements")
      .select(
        "id, stock_item_id, kind, delta_thousandths, unit_cost_centavos, reason, occurred_at, created_by",
      ),
    supabase.from("repair_tickets").select("id, status, ready_on"),
    supabase
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  // ---- Bills -------------------------------------------------------------

  const bills: Bill[] = (billRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    amountCentavos: Number(row.amount_centavos),
    dueDay: row.due_day === null ? null : Number(row.due_day),
    type: row.type === "loan_installment" ? "loan_installment" : "operating",
    loanId: (row.loan_id as string | null) ?? null,
    active: Boolean(row.active),
  }));

  const paidKeys = new Set(
    (paymentRows ?? []).map((row) => paidKey(String(row.bill_id), period)),
  );

  const attention = billsNeedingAttention({ bills, paidKeys, period, today });
  const overdue = attention.filter((entry) => entry.status.kind === "overdue");
  const dueSoon = attention.filter((entry) => entry.status.kind !== "overdue");

  // ---- Stock -------------------------------------------------------------

  const items: StockItem[] = (itemRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit),
    tag: String(row.tag) as ExpenseTag,
    reorderLevel:
      row.reorder_level_thousandths === null
        ? null
        : Number(row.reorder_level_thousandths),
    unitCostCentavos:
      row.unit_cost_centavos === null ? null : Number(row.unit_cost_centavos),
    photoPath: (row.photo_path as string | null) ?? null,
    supplierId: (row.supplier_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    active: Boolean(row.active),
  }));

  const movements: StockMovement[] = (movementRows ?? []).map((row) => ({
    id: String(row.id),
    stockItemId: String(row.stock_item_id),
    kind: String(row.kind) as MovementKind,
    delta: Number(row.delta_thousandths),
    unitCostCentavos:
      row.unit_cost_centavos === null ? null : Number(row.unit_cost_centavos),
    reason: (row.reason as string | null) ?? null,
    occurredAt: String(row.occurred_at),
    createdBy: (row.created_by as string | null) ?? null,
  }));

  // ---- Repairs -----------------------------------------------------------

  const unclaimedAfterDays = options?.unclaimedAfterDays ?? 30;
  const unclaimedUnits = (ticketRows ?? []).filter(
    (row) =>
      unclaimedStatus({
        status: String(row.status) as TicketStatus,
        readyOn: (row.ready_on as string | null) ?? null,
        unclaimedAfterDays,
        today: todayISO,
      }).unclaimed,
  ).length;

  return {
    billsOverdue: {
      count: overdue.length,
      totalCentavos: sumCentavos(
        overdue.map((entry) => entry.bill.amountCentavos),
      ),
    },
    billsDueSoon: {
      count: dueSoon.length,
      totalCentavos: sumCentavos(
        dueSoon.map((entry) => entry.bill.amountCentavos),
      ),
    },
    unansweredEnquiries: enquiryCount ?? 0,
    // The pile in the corner that spec 9.4 is about - ready, declined and
    // unrepairable units nobody has come back for.
    unclaimedUnits,
    lowStockItems: itemsNeedingAttention(buildStockLines(items, movements))
      .length,
  };
}

// ---------------------------------------------------------------------------
// The cron's side: nobody is signed in
// ---------------------------------------------------------------------------

/**
 * Every phone that should get a digest, across all Owner/Admin accounts.
 *
 * Service-role, because a cron is nobody and no policy can match it. It reads
 * and it writes only the two bookkeeping columns below - never a money row.
 */
export async function getActiveSubscriptionsForDigest(): Promise<
  PushSubscriptionRow[]
> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select(COLUMNS)
    .eq("active", true);

  if (error || !data) return [];
  return data.map((row) => toRow(row as Record<string, unknown>));
}

/** Records that today's digest went out, so a second run does not repeat it. */
export async function markDigestSent(
  id: string,
  todayISO: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("push_subscriptions")
    .update({ last_digest_on: todayISO, failure_count: 0, last_error: null })
    .eq("id", id);
}

/**
 * Records that a send failed, and switches the phone off when it is gone.
 *
 * Never deletes: the row is how somebody answers "why did my notifications
 * stop?", and `last_error` is the answer.
 */
export async function recordSendFailure(options: {
  id: string;
  keepActive: boolean;
  reason: string | null;
  failureCount: number;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("push_subscriptions")
    .update({
      active: options.keepActive,
      last_error: options.reason,
      failure_count: options.failureCount + 1,
    })
    .eq("id", options.id);
}

/**
 * The phones belonging to people who may be told a customer has written.
 *
 * Owner and Admin only, enforced here by asking `profiles` which is which -
 * the insert policy already refuses anybody else, so this is the second of the
 * two layers rather than the only one.
 */
export async function getSubscriptionsForOwnersAndAdmins(): Promise<
  PushSubscriptionRow[]
> {
  const supabase = createSupabaseAdminClient();

  const [{ data: profiles }, { data: subscriptions }] = await Promise.all([
    supabase.from("profiles").select("id, role, status"),
    supabase.from("push_subscriptions").select(COLUMNS).eq("active", true),
  ]);

  const allowed = new Set(
    (profiles ?? [])
      .filter(
        (row) =>
          (row.role === "owner" || row.role === "admin") &&
          row.status === "active",
      )
      .map((row) => row.id as string),
  );

  return (subscriptions ?? [])
    .map((row) => toRow(row as Record<string, unknown>))
    .filter((row) => allowed.has(row.userId));
}

/**
 * How many customer messages are waiting, counted as nobody.
 *
 * The ordinary `getEnquiries` reads through RLS, which is exactly right for
 * the Messages screen and useless here: the public enquiry action runs with
 * nobody signed in, so it would count zero and every alert would read "1
 * message waiting" however many had piled up.
 *
 * A head count rather than fetching the rows: the alert needs the number and
 * must never carry a stranger's name or message onto a lock screen.
 */
export async function countUnansweredEnquiries(): Promise<number> {
  const supabase = createSupabaseAdminClient();

  const { count, error } = await supabase
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error) return 1;
  return count ?? 1;
}
