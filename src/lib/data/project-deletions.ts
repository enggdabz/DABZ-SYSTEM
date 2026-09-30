import "server-only";

/**
 * Reading deletion requests (owner's request, 30 September 2026).
 *
 * Every read goes through the ordinary server client, so RLS decides: the
 * requests table is Owner/Admin only, and a counter person gets an empty list
 * back rather than an error. Nothing here writes - the writes are the three
 * functions in `0023_project_deletion_requests.sql`.
 *
 * Flat reads stitched together, not one embedded select, for the reason
 * `data/projects.ts` gives: the schema checker cannot see inside an embed.
 */
import { cache } from "react";

import { DatabaseBehindError } from "@/lib/database-behind";
import { outcomeFromError } from "@/lib/schema-health";
import type { DeletionRequestStatus } from "@/lib/project-deletion";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MIGRATION = "0023_project_deletion_requests";
const REFUND_MIGRATION = "0025_project_deletion_refund";

/**
 * A missing TABLE means 0023 is behind; a missing COLUMN on a table that is
 * there means 0025 is (that is the one that adds `refund_requested`). Naming
 * the right one matters: the owner runs the command the notice names.
 */
function throwIfBehind(
  error: { code?: string | null; message?: string | null } | null,
): void {
  if (error === null || outcomeFromError(error) !== "missing") return;
  const code = (error.code ?? "").toUpperCase();
  const columnMissing =
    code === "42703" ||
    code === "PGRST204" ||
    /column .* does not exist|could not find the .*column/i.test(error.message ?? "");
  throw new DatabaseBehindError(
    columnMissing ? REFUND_MIGRATION : MIGRATION,
    error.message ?? undefined,
  );
}

const REQUEST_COLUMNS =
  "id, project_id, requested_by, reason, status, reviewed_by, review_note, created_at, reviewed_at, refund_requested";
const PROJECT_LABEL_COLUMNS = "id, project_number, customer_name, description, deleted_at";
const PERSON_COLUMNS = "id, full_name";

interface RequestRow {
  id: string;
  project_id: string;
  requested_by: string;
  reason: string;
  status: DeletionRequestStatus;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  refund_requested: boolean;
}

interface ProjectLabelRow {
  id: string;
  project_number: string;
  customer_name: string;
  description: string;
  deleted_at: string | null;
}

interface PersonRow {
  id: string;
  full_name: string;
}

export interface DeletionRequest {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  customerName: string;
  requestedBy: string;
  requestedByName: string;
  reason: string;
  status: DeletionRequestStatus;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** The admin asked for the project's live payments to be refunded on approval. */
  refundRequested: boolean;
  /**
   * What approving would refund RIGHT NOW: the live payments, which may be
   * more than when the admin asked if a balance was paid since. Null unless a
   * refund was asked for and the request is still pending.
   */
  refundCentavos: number | null;
}

/** A person's name from their id; a removed account reads as "Unknown". */
function nameOf(people: Map<string, string>, id: string | null): string | null {
  if (id === null) return null;
  return people.get(id) ?? "Unknown";
}

async function label(rows: RequestRow[]): Promise<DeletionRequest[]> {
  if (rows.length === 0) return [];
  const supabase = await createSupabaseServerClient();

  const projectIds = [...new Set(rows.map((row) => row.project_id))];
  const personIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.reviewed_by ? [row.requested_by, row.reviewed_by] : [row.requested_by],
      ),
    ),
  ];

  const [projectRead, personRead] = await Promise.all([
    supabase.from("projects").select(PROJECT_LABEL_COLUMNS).in("id", projectIds),
    supabase.from("profiles").select(PERSON_COLUMNS).in("id", personIds),
  ]);
  if (projectRead.error)
    throw new Error(`Could not read the projects: ${projectRead.error.message}`);
  if (personRead.error)
    throw new Error(`Could not read the people: ${personRead.error.message}`);

  const projects = new Map(
    ((projectRead.data ?? []) as ProjectLabelRow[]).map((row) => [row.id, row]),
  );
  const people = new Map(
    ((personRead.data ?? []) as PersonRow[]).map((row) => [row.id, row.full_name]),
  );

  // What a pending refund would hand back today, asked of the database that
  // works it out (`project_paid_centavos`) rather than added up here.
  const refunds = new Map<string, number>();
  await Promise.all(
    rows
      .filter((row) => row.refund_requested && row.status === "pending")
      .map(async (row) => {
        const { data } = await supabase.rpc("project_paid_centavos", {
          p_project_id: row.project_id,
        });
        if (typeof data === "number" || typeof data === "string") {
          refunds.set(row.id, Number(data));
        }
      }),
  );

  return rows.map((row) => {
    const project = projects.get(row.project_id);
    return {
      id: row.id,
      projectId: row.project_id,
      projectNumber: project?.project_number ?? "Unknown project",
      projectName: project?.description ?? "",
      customerName: project?.customer_name ?? "",
      requestedBy: row.requested_by,
      requestedByName: nameOf(people, row.requested_by) ?? "Unknown",
      reason: row.reason,
      status: row.status,
      reviewedByName: nameOf(people, row.reviewed_by),
      reviewNote: row.review_note,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      refundRequested: row.refund_requested,
      refundCentavos: refunds.get(row.id) ?? null,
    };
  });
}

/**
 * The owner's page: everything waiting, oldest first (the one that has waited
 * longest is at the top), and the last few answered. A failed read throws - an
 * empty "nothing waiting" that really means "could not ask" is the wrong one to
 * believe.
 */
export const getDeletionRequests = cache(
  async (): Promise<{ pending: DeletionRequest[]; recent: DeletionRequest[] }> => {
    const supabase = await createSupabaseServerClient();

    const [pendingRead, recentRead] = await Promise.all([
      supabase
        .from("project_deletion_requests")
        .select(REQUEST_COLUMNS)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("project_deletion_requests")
        .select(REQUEST_COLUMNS)
        .neq("status", "pending")
        .order("reviewed_at", { ascending: false })
        .limit(20),
    ]);
    throwIfBehind(pendingRead.error);
    throwIfBehind(recentRead.error);
    if (pendingRead.error)
      throw new Error(`Could not read the requests: ${pendingRead.error.message}`);
    if (recentRead.error)
      throw new Error(`Could not read the requests: ${recentRead.error.message}`);

    return {
      pending: await label((pendingRead.data ?? []) as RequestRow[]),
      recent: await label((recentRead.data ?? []) as RequestRow[]),
    };
  },
);

/** The request waiting on one project, for its page. Null when none is. */
export async function getPendingRequestForProject(
  projectId: string,
): Promise<DeletionRequest | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_deletion_requests")
    .select(REQUEST_COLUMNS)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .maybeSingle();
  throwIfBehind(error);
  if (error) throw new Error(`Could not read the request: ${error.message}`);
  if (!data) return null;
  return (await label([data as RequestRow]))[0] ?? null;
}

/** One request by id, for an action that is about to act on it. */
export async function getDeletionRequest(
  requestId: string,
): Promise<DeletionRequest | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_deletion_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  throwIfBehind(error);
  if (error) throw new Error(`Could not read the request: ${error.message}`);
  if (!data) return null;
  return (await label([data as RequestRow]))[0] ?? null;
}

/**
 * The ids of projects with a request waiting - what the list badges from.
 * Owner/Admin only by policy; a counter person's answer is an empty set, and
 * their project PAGE still shows the badge, via `project_deletion_pending`.
 */
export const getPendingDeletionProjectIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_deletion_requests")
    .select("project_id")
    .eq("status", "pending");
  throwIfBehind(error);
  if (error) throw new Error(`Could not read the requests: ${error.message}`);
  return new Set(
    ((data ?? []) as { project_id: string }[]).map((row) => row.project_id),
  );
});

/**
 * How many requests are waiting, for the sidebar. A failed read is 0 rather
 * than an error: a badge that cannot be drawn must not take the whole frame
 * down with it, and the page itself throws if it cannot ask.
 */
export async function countPendingDeletionRequests(): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from("project_deletion_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Which of these sales paid a project that has since been deleted. Sales and
 * End of day tag those "Project deleted" - the money still counts, this only
 * says where it came from. Asked through a function because a counter person
 * cannot read a deleted project to join against it.
 */
export async function getDeletedProjectSaleIds(
  saleIds: readonly string[],
): Promise<Set<string>> {
  if (saleIds.length === 0) return new Set();
  const supabase = await createSupabaseServerClient();
  const found = new Set<string>();

  // Ids ride in the request body, but keep the pieces small anyway.
  for (let index = 0; index < saleIds.length; index += 200) {
    const { data, error } = await supabase.rpc("deleted_project_sale_ids", {
      p_sale_ids: saleIds.slice(index, index + 200),
    });
    // A tag that cannot be worked out is left off, not guessed: the row is
    // still shown and still counted either way.
    if (error) return found;
    for (const id of (data ?? []) as string[]) found.add(id);
  }
  return found;
}
