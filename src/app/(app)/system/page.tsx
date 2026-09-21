import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { readSchemaHealth } from "@/lib/data/schema-health";
import { probeKey, schemaAdvice, type RequiredRelation } from "@/lib/schema-health";

export const metadata = { title: "System check · Dabz System" };

/**
 * Does the database this system is pointed at have everything the screens ask
 * for?
 *
 * WHY THIS SCREEN EXISTS
 * On 21 September 2026 the Sales screen showed PHP 0.00 for a morning the shop
 * had taken money in. Migration `0015` had never reached the production
 * database, so `public.collections` did not exist and every read failed - and
 * the owner spent a day believing the takings had been wiped. Nothing in the
 * system was able to say "this database is behind"; the only symptom was an
 * empty till.
 *
 * So the question now has a screen. It is dull on a good day, which is the
 * point: a check nobody ever needs is cheaper than a day spent thinking the
 * money is gone.
 */
export default async function SystemPage() {
  await connection();

  await requireOwnerOrAdmin();
  const report = await readSchemaHealth();
  const advice = schemaAdvice(report);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">System check</h1>
        <p className="mt-2 text-muted">
          Whether the database this system is connected to has everything the
          screens ask for. Nothing here is about your shop &mdash; it is about
          the system itself.
        </p>
      </div>

      {report.ok ? (
        <Notice tone="success" title={report.headline}>
          <p>
            All {report.present.length} tables, views and columns the screens
            read are present. A screen showing nothing is showing you a real
            nothing.
          </p>
        </Notice>
      ) : report.missing.length > 0 ? (
        <Notice tone="attention" title={report.headline}>
          <p>
            Some screens cannot read what they need, and will show you empty
            figures that are <strong>not</strong> your shop&rsquo;s, or
            refuse to save. Your records are not affected &mdash; nothing has
            been lost. A missing migration means the database was never told
            about a table or a column, not that anything was removed from it.
          </p>
        </Notice>
      ) : (
        <Notice tone="info" title={report.headline}>
          <p>
            This is not a report that something is wrong. It is a report that
            the question could not be asked at all.
          </p>
        </Notice>
      )}

      {report.missing.length > 0 ? (
        <Card
          title={`What is missing (${report.missingMigrations.length})`}
          description="Grouped by the migration that creates it, in the order they must be applied."
        >
          <ul className="space-y-5">
            {report.missingMigrations.map((migration) => (
              <MigrationBlock
                key={migration}
                migration={migration}
                relations={report.missing.filter((r) => r.migration === migration)}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {report.unknown.length > 0 ? (
        <Card
          title={`Could not be checked (${report.unknown.length})`}
          description="Asked, but no answer came back. This says nothing about whether they exist."
        >
          <p className="text-sm text-muted">
            {report.unknown.map(probeKey).join(", ")}
          </p>
        </Card>
      ) : null}

      {advice.length > 0 ? (
        <Card title="What to do">
          <ol className="space-y-3 text-sm">
            {advice.map((line, index) => (
              <li key={index} className="flex gap-3">
                <span className="font-medium text-muted">{index + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card
        title="What this does not check"
        description="So that a clean result is not read as more than it is."
      >
        <ul className="space-y-2 text-sm text-muted">
          <li>
            &bull; It checks that each table and view <em>exists</em>, and asks
            after one column per migration that adds columns to a table that
            already existed &mdash; enough to catch a database that is behind,
            because a migration is applied whole. It does not check that every
            column in every table is right. That is what{" "}
            <code className="text-ink">npm run check:schema</code> does, before
            the code ever ships.
          </li>
          <li>
            &bull; It does not check the security rules, so a migration that
            only changes those &mdash; or only clears out rows &mdash; is
            invisible here even when it has never been applied. Those have
            their own suite, <code className="text-ink">npm run test:rls</code>,
            which runs against a database built from the migration files rather
            than against this one.
          </li>
          <li>
            &bull; A table being present does not mean it has anything in it. An
            empty list is a real state everywhere in this system, and{" "}
            <Link href="/checklist" className={`underline ${TAP_AREA}`}>
              To fill in
            </Link>{" "}
            is where the gaps that are yours to close are listed.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function MigrationBlock({
  migration,
  relations,
}: {
  migration: string;
  relations: RequiredRelation[];
}) {
  return (
    <li>
      <p className="flex flex-wrap items-baseline gap-2">
        <span aria-hidden="true" className="text-attention">
          {"⚠"}
        </span>
        <code className="font-medium">{migration}.sql</code>
      </p>
      <p className="mt-1 text-sm text-muted">
        Without it: {relations[0].breaks}.
      </p>
      <p className="mt-1 text-xs text-muted">
        Missing: {relations.map(probeKey).join(", ")}
      </p>
    </li>
  );
}
