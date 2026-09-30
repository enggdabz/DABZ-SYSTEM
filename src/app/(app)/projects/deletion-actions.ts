"use server";

/**
 * Deleting a project with the owner's approval.
 *
 * WHO DECIDES WHAT
 * Nothing in this file decides. `deleteProjectAction` always calls
 * `delete_project` and reports whatever the database says happened - deleted
 * for the owner, requested for an admin, refused for anybody else - so an admin
 * calling this endpoint directly, with a hand-made form, still only creates a
 * request. `decideDeletionAction` turns away anyone who is not the owner before
 * it asks, and `decide_project_deletion` turns them away again. The checks here
 * exist so a person reads a sentence instead of a database error, and so the
 * audit log says who was refused; the boundary is the database.
 *
 * Every step is written to the audit log, with the project as it stood.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getDeletionRequest } from "@/lib/data/project-deletions";
import { getProject } from "@/lib/data/projects";
import { formatPesos } from "@/lib/money";
import {
  canCancelDeletionRequest,
  canDecideDeletion,
  deleteMode,
  outcomeMessage,
  validateNote,
  validateReason,
} from "@/lib/project-deletion";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DeletionState {
  error?: string;
  done?: string;
  /** What the database said happened, for the screen to react to. */
  outcome?: "deleted" | "requested" | "cancelled" | "approved" | "rejected";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the database says, minus the plumbing, for a person to read. */
function friendly(message: string): string {
  return message.replace(/^.*?ERROR:\s*/, "");
}

function revalidateDeletionScreens(projectId?: string) {
  revalidatePath("/projects");
  revalidatePath("/projects/deletion-requests");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/sales");
  revalidatePath("/closing");
  // The sidebar's pending count and the bell live in the layout.
  revalidatePath("/", "layout");
}

/** The project as it stood, for the audit log's before column. */
function snapshot(project: NonNullable<Awaited<ReturnType<typeof getProject>>>) {
  return {
    number: project.number,
    customer: project.customerName,
    division: project.division,
    description: project.description,
    total_centavos: project.totalCentavos,
    status: project.status,
  };
}

// ---------------------------------------------------------------------------
// "Delete project"
// ---------------------------------------------------------------------------

export async function deleteProjectAction(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const user = await requireUser();

  if (deleteMode(user.role) === "none") {
    return { error: "Only the owner or an admin can delete a project." };
  }

  const projectId = String(formData.get("projectId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!UUID.test(projectId)) return { error: "That project could not be found." };

  const problem = validateReason(reason);
  if (problem) return { error: problem };

  const project = await getProject(projectId);
  if (!project) return { error: "That project could not be found." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_project", {
    p_project_id: projectId,
    p_reason: reason.trim(),
  });
  if (error) return { error: friendly(error.message) };

  const result = (Array.isArray(data) ? data[0] : data) as
    | { outcome?: string; request_id?: string | null }
    | null
    | undefined;
  if (result?.outcome !== "deleted" && result?.outcome !== "requested") {
    return { error: "That did not go through. Nothing was changed." };
  }

  if (result.outcome === "deleted") {
    await recordAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: "delete",
      entity: "projects",
      entityId: projectId,
      summary: `Project ${project.number} for ${project.customerName} (${formatPesos(project.totalCentavos)}) deleted by the owner: ${reason.trim()}`,
      before: snapshot(project),
      after: { deleted: true, reason: reason.trim() },
    });
  } else {
    await recordAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: "request",
      entity: "project_deletion_requests",
      entityId: result.request_id ?? projectId,
      summary: `Asked the owner to delete project ${project.number} for ${project.customerName}: ${reason.trim()}`,
      before: snapshot(project),
      after: { status: "pending", reason: reason.trim() },
    });
  }

  revalidateDeletionScreens(projectId);

  // The project is gone, so its own page is too: send the owner to the list
  // rather than leave them on a 404 for the thing they just did.
  if (result.outcome === "deleted") {
    redirect(`/projects?deleted=${encodeURIComponent(project.number)}`);
  }

  return {
    outcome: result.outcome,
    done: outcomeMessage(result.outcome, project.number),
  };
}

// ---------------------------------------------------------------------------
// "Cancel request"
// ---------------------------------------------------------------------------

export async function cancelDeletionRequestAction(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const user = await requireUser();
  if (!isOwnerOrAdmin(user)) {
    return { error: "You do not have permission to do that." };
  }

  const requestId = String(formData.get("requestId") ?? "");
  if (!UUID.test(requestId)) return { error: "That request could not be found." };

  const request = await getDeletionRequest(requestId);
  if (!request) return { error: "That request could not be found." };
  if (request.status !== "pending") {
    return { error: "That request has already been dealt with." };
  }
  if (
    !canCancelDeletionRequest({
      role: user.role,
      userId: user.id,
      requestedBy: request.requestedBy,
    })
  ) {
    return {
      error: "Only the person who asked, or the owner, can cancel a request.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_project_deletion", {
    p_request_id: requestId,
  });
  if (error) return { error: friendly(error.message) };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "cancel",
    entity: "project_deletion_requests",
    entityId: requestId,
    summary: `Request to delete project ${request.projectNumber} for ${request.customerName} withdrawn`,
    before: { status: "pending", reason: request.reason },
    after: { status: "cancelled" },
  });

  revalidateDeletionScreens(request.projectId);
  return {
    outcome: "cancelled",
    done: `The request to delete project ${request.projectNumber} was cancelled.`,
  };
}

// ---------------------------------------------------------------------------
// Approve / reject - the owner only
// ---------------------------------------------------------------------------

export async function decideDeletionAction(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const user = await requireUser();

  // Before anything is read or asked. An admin - including the one who made
  // the request - stops here, and the database would stop them again.
  if (!canDecideDeletion(user.role)) {
    return { error: "Only the owner can approve or reject a deletion." };
  }

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!UUID.test(requestId)) return { error: "That request could not be found." };
  if (decision !== "approve" && decision !== "reject") {
    return { error: "Choose approve or reject." };
  }
  const noteProblem = validateNote(note);
  if (noteProblem) return { error: noteProblem };

  const request = await getDeletionRequest(requestId);
  if (!request) return { error: "That request could not be found." };
  if (request.status !== "pending") {
    return { error: "That request has already been dealt with." };
  }

  const approve = decision === "approve";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_project_deletion", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note.trim() === "" ? null : note.trim(),
  });
  if (error) return { error: friendly(error.message) };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: approve ? "approve" : "reject",
    entity: "project_deletion_requests",
    entityId: requestId,
    summary: `${approve ? "Approved" : "Rejected"} the request to delete project ${request.projectNumber} for ${request.customerName}, asked by ${request.requestedByName}${note.trim() ? `: ${note.trim()}` : ""}`,
    before: { status: "pending", reason: request.reason },
    after: { status: approve ? "approved" : "rejected", note: note.trim() || null },
  });
  if (approve) {
    await recordAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: "delete",
      entity: "projects",
      entityId: request.projectId,
      summary: `Project ${request.projectNumber} for ${request.customerName} deleted after the owner approved ${request.requestedByName}'s request: ${request.reason}`,
      before: { deleted: false },
      after: { deleted: true, reason: request.reason },
    });
  }

  revalidateDeletionScreens(request.projectId);
  return {
    outcome: approve ? "approved" : "rejected",
    done: approve
      ? `Project ${request.projectNumber} was deleted.`
      : `The request to delete project ${request.projectNumber} was rejected.`,
  };
}
