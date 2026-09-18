import { createAdminClient } from "@/lib/supabase/server";

/** audit_log.action — see the audit_log_action_check constraint. */
export type AuditAction =
  | "create" | "update" | "delete" | "void"
  | "login" | "login_failed" | "logout"
  | "password_change" | "password_reset"
  | "permission_grant" | "permission_revoke"
  | "activate" | "deactivate";

/**
 * Writes an audit entry.
 *
 * audit_log has a read policy but no insert policy — nobody writes it as
 * themselves — so this goes through the service-role client. It never throws:
 * losing an audit line must not fail the operation that succeeded.
 */
export async function recordAudit(entry: {
  actorId: string;
  actorUsername: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      actor_username: entry.actorUsername,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
    });
  } catch {
    // Deliberately swallowed.
  }
}
