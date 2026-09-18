import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Inserts a row carrying a per-day document number, retrying on collision.
 *
 * repair_tickets.ticket_number and apparel_orders.order_number are NOT NULL
 * with no default and no trigger, so the number is the application's job.
 * complete_sale solves the same problem in SQL by counting the day's rows and
 * retrying when the unique index rejects the number; two people writing a
 * ticket in the same second would otherwise collide. This is that loop, for
 * the tables whose inserts are not wrapped in a function.
 */
export async function insertWithDocumentNumber<T>(
  supabase: SupabaseClient<Database>,
  options: {
    table: "repair_tickets" | "apparel_orders";
    numberColumn: "ticket_number" | "order_number";
    prefix: string;
    on: string;
    dateColumn: string;
    row: Record<string, unknown>;
  },
): Promise<{ data: T | null; error: string | null }> {
  const { table, numberColumn, prefix, on, dateColumn, row } = options;

  const stamp = on.replaceAll("-", "").slice(2); // YYYY-MM-DD -> YYMMDD
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(dateColumn, on);

  let sequence = count ?? 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    sequence += 1;
    const number = `${prefix}-${stamp}-${String(sequence).padStart(3, "0")}`;

    const { data, error } = await supabase
      .from(table)
      .insert({ ...row, [numberColumn]: number } as never)
      .select()
      .single();

    if (!error) return { data: data as T, error: null };
    if (error.code !== UNIQUE_VIOLATION) return { data: null, error: error.message };
  }

  return { data: null, error: "Could not find a free number for today." };
}
