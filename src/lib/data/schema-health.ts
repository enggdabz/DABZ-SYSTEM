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
  REQUIRED_RELATIONS,
  SENTINEL_RELATIONS,
  outcomeFromError,
  schemaReport,
  type ProbeOutcome,
  type RequiredRelation,
  type SchemaReport,
} from "@/lib/schema-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function probe(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  name: string,
): Promise<[string, ProbeOutcome]> {
  try {
    // `head: true` sends a HEAD - no body comes back, so nothing about the
    // shop's money crosses the wire to answer a question about its schema.
    const { error } = await supabase.from(name).select("*", { head: true });
    return [name, outcomeFromError(error)];
  } catch {
    /*
      A thrown error is the network, not the schema. It must read as "could
      not check" rather than "missing", or this module starts making the same
      kind of confident wrong claim it exists to stop.
    */
    return [name, "unknown"];
  }
}

async function reportOn(
  relations: readonly RequiredRelation[],
): Promise<SchemaReport> {
  const supabase = await createSupabaseServerClient();
  const outcomes = await Promise.all(
    relations.map((relation) => probe(supabase, relation.name)),
  );
  return schemaReport(new Map(outcomes), relations);
}

/** Every relation the app reads. For the System check screen. */
export const readSchemaHealth = cache(
  async (): Promise<SchemaReport> => reportOn(REQUIRED_RELATIONS),
);

/**
 * One relation per migration. For the owner's home screen, where the full
 * forty-four round trips would be paid on every visit for an answer that is
 * almost always "yes, fine".
 */
export const readSchemaSentinel = cache(
  async (): Promise<SchemaReport> => reportOn(SENTINEL_RELATIONS),
);
