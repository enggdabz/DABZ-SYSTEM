"use server";

/**
 * Marking the benches an item has passed (Phase 12).
 *
 * ONE SAVE PER ITEM, NOT ONE PER TICK. The printer finishes a job and marks
 * the print; the sewer finishes and marks the sewing. But somebody catching up
 * a project on Monday morning is ticking four benches at once, and four
 * separate round trips is four chances for half of it to land. So the form
 * sends the whole row of ten and this works out the difference.
 *
 * WHAT IT WRITES. A bench that was already marked is left exactly as it was,
 * timestamp and all - re-saving an item must not rewrite when the printing
 * happened. Only the newly ticked ones are inserted and only the cleared ones
 * are removed.
 *
 * WHY A TICK CAN BE REMOVED AT ALL. A ledger entry is voided and a stock
 * movement is answered with an opposite one, because both are money and the
 * history is the point. A production mark is a statement about where the work
 * is RIGHT NOW, and the honest correction to "the printing is done" when it is
 * not is to stop saying it. The history is kept in the audit log, which is
 * append-only and which this writes on every change.
 */
import { revalidatePath } from "next/cache";

import { ORDER_STATUS_LABELS } from "@/lib/apparel";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/dal";
import { getApparelOrder } from "@/lib/data/apparel";
import {
  PRODUCTION_STAGES,
  PRODUCTION_STAGE_LABELS,
  isProductionStage,
  type ProductionStage,
} from "@/lib/production";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProductionState {
  error?: string;
  success?: string;
  /** Which item the message belongs to, so ten forms do not all light up. */
  lineId?: string;
}

function revalidateProduction(orderId: string) {
  revalidatePath("/production");
  revalidatePath(`/production/${orderId}`);
  // The job order screen shows the same status, so it must not go stale.
  revalidatePath("/apparel");
  revalidatePath(`/apparel/${orderId}`);
}

/** The benches in bench order, for a summary that reads the way the shop works. */
function inOrder(stages: readonly ProductionStage[]): string[] {
  return PRODUCTION_STAGES.filter((stage) => stages.includes(stage)).map(
    (stage) => PRODUCTION_STAGE_LABELS[stage],
  );
}

export async function saveItemStagesAction(
  _previous: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That project could not be found.", lineId };

  const line = detail.lines.find((entry) => entry.id === lineId);
  if (!line) return { error: "That item is not on this project.", lineId };

  /*
    A cancelled project is not work, so its benches are history: they stay
    readable and stop being editable. The same reasoning keeps it off the
    production calendar.
  */
  if (detail.order.status === "cancelled") {
    return { error: "This project was cancelled, so its benches are closed.", lineId };
  }

  // Whatever arrives that is not one of the ten benches is dropped rather than
  // saved: the database would refuse it anyway, and a form post is a public
  // endpoint whoever sent it.
  const wanted = new Set(
    formData
      .getAll("stages")
      .map((value) => String(value))
      .filter(isProductionStage),
  );

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from("apparel_production_steps")
    .select("id, stage")
    .eq("line_id", lineId);

  /*
    Read first, and stop if the read fails. Without the current marks this
    cannot tell a bench that is already marked from one that is not, and
    "save anyway" would mean deleting marks it never saw.
  */
  if (readError || !existing) {
    return {
      error: `The benches for this item could not be read, so nothing was changed: ${
        readError?.message ?? "no answer from the database"
      }`,
      lineId,
    };
  }

  const already = new Map(
    existing
      .filter((row) => isProductionStage(String(row.stage)))
      .map((row) => [String(row.stage) as ProductionStage, String(row.id)]),
  );

  const toAdd = [...wanted].filter((stage) => !already.has(stage));
  const toRemoveIds = [...already.entries()]
    .filter(([stage]) => !wanted.has(stage))
    .map(([, id]) => id);

  if (toAdd.length === 0 && toRemoveIds.length === 0) {
    return { success: "Nothing changed.", lineId };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("apparel_production_steps").insert(
      toAdd.map((stage) => ({
        line_id: lineId,
        stage,
        created_by: user.id,
      })),
    );

    if (error) {
      return { error: `That could not be saved: ${error.message}`, lineId };
    }
  }

  if (toRemoveIds.length > 0) {
    const { error } = await supabase
      .from("apparel_production_steps")
      .delete()
      .in("id", toRemoveIds);

    if (error) {
      return {
        error: `The benches that were ticked have been saved, but the ones you cleared could not be removed: ${error.message}`,
        lineId,
      };
    }
  }

  const before = inOrder([...already.keys()]);
  const after = inOrder([...wanted]);

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "apparel_production",
    entityId: lineId,
    summary: `Production on ${line.name} (${detail.order.orderNumber}) is now ${
      after.length === 0 ? "not started" : after.join(", ")
    }`,
    before: { stages: before, order_status: ORDER_STATUS_LABELS[detail.order.status] },
    after: { stages: after },
  });

  revalidateProduction(orderId);

  const added = toAdd.length;
  const removed = toRemoveIds.length;

  // Said plainly, because clearing a tick is the change somebody will want to
  // be sure of: "Saved." after an accidental un-tick tells nobody anything.
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} bench${added === 1 ? "" : "es"} marked`);
  if (removed > 0) parts.push(`${removed} cleared`);

  return { success: `${line.name}: ${parts.join(", ")}.`, lineId };
}
