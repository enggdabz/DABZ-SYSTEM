import "server-only";

/**
 * The audit log (spec 2.1): who did what, when, on which record, with the
 * before and after values for edits, voids and deletions.
 *
 * Writing to the log must never stop the thing being logged. If the log write
 * fails we record the problem on the server console and carry on - a staff
 * member should not lose a sale because the history table hiccuped. The log
 * table itself is append-only: no policy allows updating or deleting a row,
 * so nobody can quietly rewrite history.
 */
import { createSupabaseAdminClient } from "./supabase/admin";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "void"
  | "login"
  | "login_failed"
  | "logout"
  | "password_change"
  | "password_reset"
  | "permission_grant"
  | "permission_revoke"
  | "activate"
  | "deactivate";

export interface AuditEntry {
  actorId: string | null;
  actorUsername: string | null;
  action: AuditAction;
  /** What kind of thing was touched, e.g. "profile", "app_settings". */
  entity: string;
  entityId?: string | null;
  /** One plain-language line the owner can read without help. */
  summary: string;
  before?: unknown;
  after?: unknown;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      actor_username: entry.actorUsername,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });

    if (error) {
      console.error("[audit] could not write entry:", error.message, entry.summary);
    }
  } catch (caught) {
    console.error(
      "[audit] could not write entry:",
      caught instanceof Error ? caught.message : caught,
    );
  }
}

/**
 * Describes what changed between two versions of a record, for the log's
 * before/after columns. Only changed fields are kept, so the log stays
 * readable instead of repeating every unchanged value.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T>; changedKeys: string[] } {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  const changedKeys: string[] = [];

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const from = before[key as keyof T];
    const to = after[key as keyof T];
    if (from !== to) {
      changedBefore[key as keyof T] = from;
      changedAfter[key as keyof T] = to;
      changedKeys.push(key);
    }
  }

  return { before: changedBefore, after: changedAfter, changedKeys: changedKeys.sort() };
}
