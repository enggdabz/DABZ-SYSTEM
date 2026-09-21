import "server-only";

/**
 * Reading the production marks (Phase 12).
 *
 * WHY THIS RETURNS A FAILURE FLAG RATHER THAN AN EMPTY LIST
 *
 * No marks and "the question could not be asked" look identical from here: an
 * empty array either way. But on screen they are opposites - the first says
 * the shop has not started, the second says nobody knows. Reporting a failed
 * read as "Not started" across every project would be this file making exactly
 * the mistake that cost the owner a day in September, when a missing migration
 * showed up as PHP 0.00 on the Sales screen instead of as "the database is
 * behind". So the read says which it was, and the screen says so too.
 *
 * Nothing here is worked out. The status of an item and of a project comes
 * from the pure functions in `src/lib/production.ts`, which the screens and
 * the tests share.
 */
import { cache } from "react";

import { type ApparelOrderDetail } from "@/lib/data/apparel";
import {
  isProductionStage,
  projectProduction,
  type ProductionItem,
  type ProductionStep,
  type ProjectProduction,
} from "@/lib/production";
import { outcomeFromError } from "@/lib/schema-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProductionRead {
  steps: ProductionStep[];
  /** The read itself failed. The marks are UNKNOWN, not "none". */
  failed: boolean;
  /**
   * `apparel_production_steps` is not in the database at all, which means
   * migration `0018` has not been applied. Worth saying in its own words,
   * because the fix is `npm run db:push` rather than anything on this screen.
   */
  tableMissing: boolean;
}

/**
 * Every mark on every item.
 *
 * One read for the whole screen rather than one per project: a shop with
 * forty open orders would otherwise make forty round trips to draw one list.
 * Row Level Security still decides what comes back - this is the ordinary
 * server client, never the service-role one.
 */
export const getProductionSteps = cache(async (): Promise<ProductionRead> => {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("apparel_production_steps")
    .select("line_id, stage, created_at");

  if (error || !data) {
    return {
      steps: [],
      failed: true,
      tableMissing: outcomeFromError(error) === "missing",
    };
  }

  return {
    steps: data
      // A stage the database does not know is impossible - a check constraint
      // refuses one - but a row read through an older copy of this app would
      // be, and dropping it is safer than drawing a bench nothing can label.
      .filter((row) => isProductionStage(String(row.stage)))
      .map((row) => ({
        lineId: String(row.line_id),
        stage: String(row.stage) as ProductionStep["stage"],
        markedAt: String(row.created_at),
      })),
    failed: false,
    tableMissing: false,
  };
});

/**
 * An order's items as the production report needs them.
 *
 * Here rather than in either screen, so the list and the report cannot
 * disagree about what an item is or how many pieces it is - the same reason
 * `toCalendarOrder` lives beside the orders it maps.
 *
 * The quantity comes from the order's own totals, which means the roster where
 * there is one: fifteen names is fifteen jerseys, and the report says so.
 */
export function toProductionItems(
  detail: ApparelOrderDetail,
): ProductionItem[] {
  return detail.totals.lines.map((entry) => ({
    lineId: entry.line.id,
    name: entry.line.name,
    quantity: entry.quantity,
  }));
}

/** One order's production status, summed from its items. */
export function productionFor(
  detail: ApparelOrderDetail,
  steps: readonly ProductionStep[],
): ProjectProduction {
  return projectProduction({ items: toProductionItems(detail), steps });
}
