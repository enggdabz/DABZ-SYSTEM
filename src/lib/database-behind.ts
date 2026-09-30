/**
 * "The database is behind" - a screen's way of saying so instead of a blank
 * error page.
 *
 * WHY THIS EXISTS
 * A migration can reach the code (Vercel deploys on merge) before it reaches
 * the database (`npm run db:push` is a separate step). In between, every
 * screen that reads what the migration added fails with a table or column
 * that "does not exist", and production shows only "This page couldn't load" -
 * which sends the owner looking for a bug when the fix is one command. The
 * System check screen already says this about the schema as a whole; this is
 * the same sentence, shown on the screen that actually fell over.
 *
 * ONLY A MISSING RELATION OR COLUMN COUNTS. A timeout, a paused project or a
 * bad key is not evidence about the schema, so `outcomeFromError` (the same
 * judgement the System check makes) decides, and anything else is thrown as
 * the error it is - a confident wrong "apply the migration" beside a database
 * that is fine would be worse than the blank page.
 */
import { outcomeFromError } from "./schema-health";

export class DatabaseBehindError extends Error {
  /** The migration file that adds what was missing, e.g. "0023_project_deletion_requests". */
  readonly migration: string;

  constructor(migration: string, detail?: string) {
    super(
      `The database is behind: ${migration} has not been applied.${detail ? ` (${detail})` : ""}`,
    );
    this.name = "DatabaseBehindError";
    this.migration = migration;
  }
}

export function isDatabaseBehind(error: unknown): error is DatabaseBehindError {
  return error instanceof DatabaseBehindError;
}

/**
 * Call with the `error` a Supabase read came back with, before throwing the
 * ordinary "could not read" error. Does nothing unless the error is the
 * database saying a table or column is not there.
 */
export function throwIfBehind(
  error: { code?: string | null; message?: string | null } | null,
  migration: string,
): void {
  if (error !== null && outcomeFromError(error) === "missing") {
    throw new DatabaseBehindError(migration, error.message ?? undefined);
  }
}
