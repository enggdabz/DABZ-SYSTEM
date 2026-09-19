/**
 * Reading PostgREST's errors, so a screen can say something true about them.
 *
 * Supabase does not talk to PostgreSQL directly from the browser or from a
 * Server Action - it talks to PostgREST, which keeps its OWN cache of what
 * tables and functions exist. That cache is the source of a failure that reads
 * exactly like a missing migration but is not one.
 */

/** The shape supabase-js hands back. Every field can be absent. */
export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/**
 * True when PostgREST could not find the function it was asked to call.
 *
 * TWO different causes, and the screen must name both, because they have
 * different fixes and the failure looks identical:
 *
 *  1. The migration was never applied - the function really is absent.
 *  2. The migration WAS applied, but PostgREST is still serving a cache built
 *     before it existed. Supabase normally refreshes that after a schema
 *     change; it does not always do so when the SQL was run by hand in the
 *     SQL editor. `notify pgrst, 'reload schema'` forces it.
 *
 * Matching on the function's NAME appearing in the message would be wrong: a
 * function that ran and raised its own exception can carry its name too, and
 * that is the opposite problem with the opposite fix.
 */
export function isFunctionMissingFromApi(error: PostgrestLikeError): boolean {
  if (error.code === "PGRST202") return true;

  // Older PostgREST builds answer without the code but keep the phrase.
  return /schema cache/i.test(error.message ?? "");
}
