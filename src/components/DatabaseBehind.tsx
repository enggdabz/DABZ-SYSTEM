import Link from "next/link";

import { Notice, TAP_AREA } from "@/components/ui";

/**
 * Shown in place of a screen whose migration has not reached the database.
 *
 * It names the migration and the command, because "something went wrong" is the
 * one sentence that gives nobody a next step. Warnings carry the icon and the
 * words, never colour alone - `Notice` does both.
 */
export function DatabaseBehind({
  migration,
  canOpenSystemCheck,
}: {
  migration: string;
  /** Owner/Admin only - the System check screen is not for staff. */
  canOpenSystemCheck: boolean;
}) {
  return (
    <Notice tone="attention" title="The database is behind this version of the app">
      <p>
        This screen needs <strong>{migration}</strong>, which has not been
        applied to the database yet. Nothing is lost: the data is fine, it just
        cannot be read until the migration is applied.
      </p>
      <p className="mt-2">
        Whoever looks after the database applies it with{" "}
        <code className="rounded bg-ink/5 px-1">npm run db:push</code>, then
        reloads this page.
        {canOpenSystemCheck ? (
          <>
            {" "}
            <Link
              href="/system"
              className={`underline underline-offset-2 ${TAP_AREA}`}
            >
              Open System check
            </Link>{" "}
            to see everything that is missing.
          </>
        ) : (
          " Tell the owner or an admin."
        )}
      </p>
    </Notice>
  );
}
