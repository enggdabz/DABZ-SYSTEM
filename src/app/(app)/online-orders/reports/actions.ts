"use server";

/**
 * The monthly target, edited from the Reports screen (docs/spec.md 9.5).
 *
 * One column, and the same rule as everywhere else: AN EMPTY BOX IS A REAL
 * ANSWER. Clearing it puts the meter away rather than setting a target of
 * nothing, because a target of nothing reads as reached before the first
 * order of the month.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { formatPesos, parsePesos } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface TargetState {
  error?: string;
  success?: string;
}

export async function setMonthlyTargetAction(
  _previous: TargetState,
  formData: FormData,
): Promise<TargetState> {
  const actor = await requireOwnerOrAdmin();

  const typed = String(formData.get("target") ?? "").trim();

  let centavos: number | null = null;
  if (typed !== "") {
    try {
      centavos = parsePesos(typed);
      if (centavos <= 0) throw new Error("not above zero");
    } catch {
      return { error: "Enter an amount like 100000, or leave it empty for no target." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ online_monthly_target_centavos: centavos })
    .eq("id", 1);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "update",
    entity: "app_settings",
    entityId: "1",
    summary:
      centavos === null
        ? "Cleared the online shop's monthly sales target"
        : `Set the online shop's monthly sales target to ${formatPesos(centavos)}`,
    after: { online_monthly_target_centavos: centavos },
  });

  revalidatePath("/online-orders/reports");
  revalidatePath("/settings");
  revalidatePath("/checklist");

  return {
    success: centavos === null ? "Target cleared." : "Target saved.",
  };
}
