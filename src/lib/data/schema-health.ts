import "server-only";

/**
 * Asking the LIVE database which of the app's relations are actually there.
 *
 * One HEAD request per relation. It fetches no rows and no count - the only
 * thing being asked is whether PostgREST recognises the name at all - so a
 * table with a million rows costs the same as an empty one.
 *
 * WHY THE ORDINARY SERVER CLIENT, AND NOT THE SERVICE-ROLE ONE
 * Row Level Security has nothing to say about whether a table EXISTS. A table
 * that is there but hands back no rows answers with an empty result and no
 * error, which is exactly the "present" this is looking for, so the question
 * is answered correctly through the ordinary client. Reaching for the
 * service-role key here would be a fourth sanctioned use of it (AGENTS.md
 * lists three) bought for no gain at all.
 */
import { cache } from "react";

import {
  REQUIRED_SCHEMA,
  SENTINEL_RELATIONS,
  outcomeFromError,
  probeKey,
  schemaReport,
  type ProbeOutcome,
  type RequiredRelation,
  type SchemaReport,
} from "@/lib/schema-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function probe(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  relation: RequiredRelation,
): Promise<[string, ProbeOutcome]> {
  const key = probeKey(relation);
  try {
    /*
      `head: true` sends a HEAD - no body comes back, so nothing about the
      shop's money crosses the wire to answer a question about its schema.

      Naming a column rather than `*` is what turns this into a column probe:
      PostgreSQL builds the SELECT either way and refuses a column it has not
      got, which is precisely the question.
    */
    const { error } = await supabase
      .from(relation.name)
      .select(relation.column ?? "*", { head: true });
    return [key, outcomeFromError(error)];
  } catch {
    /*
      A thrown error is the network, not the schema. It must read as "could
      not check" rather than "missing", or this module starts making the same
      kind of confident wrong claim it exists to stop.
    */
    return [key, "unknown"];
  }
}

async function reportOn(
  relations: readonly RequiredRelation[],
): Promise<SchemaReport> {
  const supabase = await createSupabaseServerClient();

  const tables = relations.filter((relation) => relation.column === undefined);
  const columns = relations.filter((relation) => relation.column !== undefined);

  const tableOutcomes = await Promise.all(
    tables.map((relation) => probe(supabase, relation)),
  );
  const byName = new Map(tableOutcomes);

  /*
    A column is only worth asking about once its table is known to be there.
    When the table itself is missing, the probe would answer "missing" and the
    report would name TWO migrations for one absence - and the wrong one
    loudest, since the column's migration is the later of the two. When the
    table could not be checked at all, the column cannot be either.

    A column whose table is not in this set (the home-screen sentinels) is
    asked about directly - nothing is known against it.
  */
  const askable = columns.filter(
    (relation) => (byName.get(relation.name) ?? "present") === "present",
  );

  const columnOutcomes = await Promise.all(
    askable.map((relation) => probe(supabase, relation)),
  );

  return schemaReport(new Map([...tableOutcomes, ...columnOutcomes]), [
    ...tables,
    ...askable,
  ]);
}

/**
 * Every relation the app reads, and the columns that later migrations added to
 * them. For the System check screen.
 */
export const readSchemaHealth = cache(
  async (): Promise<SchemaReport> => reportOn(REQUIRED_SCHEMA),
);

/**
 * One probe per migration. For the owner's home screen, where the full sweep
 * would be paid on every visit for an answer that is almost always "yes,
 * fine".
 */
export const readSchemaSentinel = cache(
  async (): Promise<SchemaReport> => reportOn(SENTINEL_RELATIONS),
);
