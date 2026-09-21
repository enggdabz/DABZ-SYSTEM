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

/**
 * True when PostgREST could not find a COLUMN the write was trying to set.
 *
 * The same two causes as above, and the same two fixes - a migration that was
 * never applied, or a cache built before it was.
 *
 * Worth naming separately because of WHEN it happens: the app deploys the
 * moment a branch merges, while `npm run db:push` is run by hand afterwards.
 * In between, a screen whose form writes a column added by that migration
 * cannot save AT ALL - not just the new box, the whole form - and the raw
 * message ("Could not find the 'x' column of 'y' in the schema cache") reads
 * like a bug in the system rather than a step not yet taken.
 */
export function isColumnMissingFromApi(error: PostgrestLikeError): boolean {
  // What PostgREST answers when its own schema cache has no such column.
  if (error.code === "PGRST204") return true;

  // And PostgreSQL's own `undefined_column`, for the case where the error is
  // passed straight through rather than caught by the cache first. Unambiguous
  // - 42703 means this and nothing else.
  if (error.code === "42703") return true;

  // Older builds answer without the code. Matched narrowly: a column named in
  // some OTHER kind of failure - a check constraint, a not-null violation -
  // has a different fix and must not be reported as a missing migration.
  return /could not find the .*column/i.test(error.message ?? "");
}
