/**
 * Deleting a project with the owner's approval (owner's request, 30 Sept 2026).
 *
 * THE RULE, IN ONE PLACE
 * The owner deletes at once. An admin can only ask. Everybody else can do
 * neither. `0023_project_deletion_requests.sql` enforces exactly this inside
 * `delete_project`; this file says the same thing in TypeScript so a screen
 * knows which button to draw and an action knows what to expect back. Neither
 * of them decides anything: the database is the boundary.
 *
 * DELETING IS SOFT
 * A deleted project keeps its row, its payments and its steps, so the money it
 * took stays in Sales, End of day and the ledger. Only the per-project
 * screens - the list, the calendar - stop showing it, which is `isLive`.
 */
import type { Role } from "./auth/permissions";

export type DeletionRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export const DELETION_STATUS_LABELS: Record<DeletionRequestStatus, string> = {
  pending: "Waiting for the owner",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** What pressing "Delete project" does for this person. */
export type DeleteMode = "delete" | "request" | "none";

export function deleteMode(role: Role | null | undefined): DeleteMode {
  if (role === "owner") return "delete";
  if (role === "admin") return "request";
  return "none";
}

/** Only the owner approves or rejects. Not an admin, and not the one who asked. */
export function canDecideDeletion(role: Role | null | undefined): boolean {
  return role === "owner";
}

/**
 * Who may withdraw a request: the person who asked, or the owner. Another
 * admin cannot - a request is the requester's to take back.
 */
export function canCancelDeletionRequest(options: {
  role: Role | null | undefined;
  userId: string;
  requestedBy: string;
}): boolean {
  if (options.role === "owner") return true;
  return options.role === "admin" && options.requestedBy === options.userId;
}

/** A project still in the shop's records. Deleted ones are out of every list. */
export function isLive(project: { deletedAt?: string | null }): boolean {
  return !project.deletedAt;
}

export const REASON_MAX_LENGTH = 500;

/** Null when the reason will do; otherwise the sentence to show. */
export function validateReason(reason: string): string | null {
  const text = reason.trim();
  if (text === "") return "Say why the project is being deleted.";
  if (text.length > REASON_MAX_LENGTH) {
    return `Keep the reason under ${REASON_MAX_LENGTH} characters.`;
  }
  return null;
}

/** A note on a decision is optional, but not unbounded. */
export function validateNote(note: string): string | null {
  return note.trim().length > REASON_MAX_LENGTH
    ? `Keep the note under ${REASON_MAX_LENGTH} characters.`
    : null;
}

/**
 * The refund choice, as the form sends it. Only asked when something is paid:
 * a project with nothing paid has nothing to refund, so nothing to choose.
 *
 * There is deliberately NO default. A default of "refund" voids a customer's
 * payment on a stray tap, and a default of "keep" leaves money in the books
 * that the person believed they had handed back. Either way the person has to
 * say which.
 */
export type RefundChoice = "refund" | "keep";

export function parseRefundChoice(value: string): RefundChoice | null {
  return value === "refund" || value === "keep" ? value : null;
}

/** The sentence when the choice is missing from a project that has money on it. */
export const REFUND_CHOICE_REQUIRED =
  "This project has a payment on it. Choose whether to refund it or keep the money.";

/** The sentence a screen shows once the database has answered. */
export function outcomeMessage(
  outcome: "deleted" | "requested",
  projectNumber: string,
  options: { refundedLabel?: string | null; refundAskedLabel?: string | null } = {},
): string {
  if (outcome === "deleted") {
    return options.refundedLabel
      ? `Project ${projectNumber} was deleted and ${options.refundedLabel} was refunded.`
      : `Project ${projectNumber} was deleted.`;
  }
  return options.refundAskedLabel
    ? `Deletion of project ${projectNumber}, with a ${options.refundAskedLabel} refund, has been sent to the owner for approval.`
    : `Deletion of project ${projectNumber} has been sent to the owner for approval.`;
}

/** What is still to be said to an admin, on the project, while a request waits. */
export const PENDING_BADGE = "Deletion pending owner approval";

/**
 * The tag shown on a sale that belongs to a deleted project. The money is still
 * counted - this only says where it came from.
 */
export const PROJECT_DELETED_TAG = "Project deleted";

/** What the pending count in the sidebar reads as, for a screen reader too. */
export function pendingCountLabel(count: number): string {
  return count === 1 ? "1 request waiting" : `${count} requests waiting`;
}
