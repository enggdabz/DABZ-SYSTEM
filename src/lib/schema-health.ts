/**
 * Does the database this app is pointed at actually have what the app needs?
 *
 * WHY THIS EXISTS
 * On 21 September 2026 the owner opened Sales and saw PHP 0.00 across the day
 * and all three doors. The shop had taken money that morning. What had
 * happened was that migration `0015` had never been applied to the production
 * database, so `public.collections` did not exist and every read of the feed
 * failed - and the screen had no way to tell "the shop took nothing" from "the
 * question could not be asked". The owner spent a day believing the takings
 * had been wiped.
 *
 * `npm run check:schema` already catches a MISSPELLED column, but it runs
 * against a throwaway database built from the migration files. It can only
 * ever prove that the code agrees with the migrations. It cannot know whether
 * those migrations reached the real database, and that is the gap that cost a
 * day.
 *
 * So this file is the other half: it asks the LIVE database, at runtime, which
 * of the relations the app depends on are actually there.
 *
 * THREE STATES, NOT TWO
 * A probe comes back `present`, `missing` or `unknown`, and the third is not a
 * rounding error. A network blip, a paused project or an expired key all make
 * a probe fail without saying anything about the schema, and reporting that as
 * "missing" would be this module committing the exact sin it was written to
 * prevent: a confident wrong answer beside somebody's money. Unknown is said
 * out loud and never counted as missing.
 */

/** A table or view the app reads, and what stops working without it. */
export interface RequiredRelation {
  name: string;
  /** The migration file that creates it, so the fix names itself. */
  migration: string;
  /** What the owner loses, in the owner's words - not in table names. */
  breaks: string;
}

/*
  Every relation the app reads, tagged with the migration that creates it.

  Kept in migration order so a report reads as "you are behind from here on".
  `schema-health.test.ts` reads supabase/migrations and fails if a table or
  view is created there and forgotten here - the same rule that holds the
  public page and the To fill in checklist together.
*/
export const REQUIRED_RELATIONS: readonly RequiredRelation[] = [
  ...["app_health"].map((name) => ({
    name,
    migration: "0000_phase0_hello",
    breaks: "the system's own health check",
  })),
  ...["app_settings", "audit_log", "login_events", "profiles", "user_permissions"].map(
    (name) => ({
      name,
      migration: "0001_phase1_foundation",
      breaks: "signing in, accounts, settings and the activity log",
    }),
  ),
  ...["bill_payments", "bills", "ledger_entries", "loan_payments", "loans"].map(
    (name) => ({
      name,
      migration: "0002_phase2_money",
      breaks: "bills, loans and Money in/out",
    }),
  ),
  ...[
    "advance_deductions",
    "attendance_entries",
    "cash_advances",
    "payroll_days",
    "payroll_weeks",
    "staff",
  ].map((name) => ({
    name,
    migration: "0003_phase3_staff",
    breaks: "staff, the time clock and payroll",
  })),
  ...[
    "customers",
    "day_closings",
    "product_price_tiers",
    "products",
    "sale_lines",
    "sales",
    "void_requests",
  ].map((name) => ({
    name,
    migration: "0005_phase4_pos",
    breaks: "the Counter, customers, products and End of day",
  })),
  ...[
    "expense_presets",
    "expenses",
    "stock_items",
    "stock_movements",
    "supplier_payables",
    "suppliers",
  ].map((name) => ({
    name,
    migration: "0006_phase5_expenses_stocks",
    breaks: "expenses, stocks and what is owed to suppliers",
  })),
  ...[
    "apparel_options",
    "apparel_order_lines",
    "apparel_order_names",
    "apparel_orders",
    "apparel_payments",
    "apparel_products",
    "apparel_size_prices",
  ].map((name) => ({
    name,
    migration: "0007_phase6_apparel",
    breaks: "Dabz Apparel job orders",
  })),
  ...["repair_lines", "repair_payments", "repair_services", "repair_tickets"].map(
    (name) => ({
      name,
      migration: "0008_phase7_repairs",
      breaks: "DabzTech repair tickets",
    }),
  ),
  ...["enquiries"].map((name) => ({
    name,
    migration: "0009_phase9_public",
    breaks: "the public page and customer messages",
  })),
  ...["collections"].map((name) => ({
    name,
    migration: "0015_phase10_collections",
    breaks: "the Sales screen, the takings on Home, and the End of day breakdown",
  })),
  ...["push_subscriptions"].map((name) => ({
    name,
    migration: "0016_phase11_notifications",
    breaks: "notifications on your phone",
  })),
];

/**
 * One relation per migration, for the check that runs on the owner's home
 * screen.
 *
 * The full sweep is forty-four round trips, which is fine on a screen somebody
 * opened on purpose and is not fine on every visit to Home. Migrations are
 * applied in order and as a whole, so one relation per migration answers the
 * question that actually gets asked - "is this database behind?" - at a
 * quarter of the cost. The full list is one tap away when it says yes.
 */
export const SENTINEL_RELATIONS: readonly RequiredRelation[] = Object.values(
  REQUIRED_RELATIONS.reduce<Record<string, RequiredRelation>>((first, relation) => {
    first[relation.migration] ??= relation;
    return first;
  }, {}),
);

export type ProbeOutcome = "present" | "missing" | "unknown";

/**
 * Was this the database saying "no such table", or something else entirely?
 *
 * PostgreSQL answers 42P01 and PostgREST answers PGRST205 when a relation is
 * not there. ANYTHING else - a timeout, a paused project, a bad key, a row
 * limit - is `unknown`, because none of those is evidence about the schema and
 * guessing would put a wrong answer beside the owner's money.
 */
export function outcomeFromError(
  error: { code?: string | null; message?: string | null } | null,
): ProbeOutcome {
  if (error === null) return "present";

  const code = (error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return "missing";

  // Some proxies drop the code and keep only the sentence.
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("does not exist") || message.includes("could not find the table")) {
    return "missing";
  }

  return "unknown";
}

export interface SchemaReport {
  /** True only when every relation asked about came back present. */
  ok: boolean;
  missing: RequiredRelation[];
  unknown: RequiredRelation[];
  present: RequiredRelation[];
  /** The migrations that would fix it, in the order they must be applied. */
  missingMigrations: string[];
  headline: string;
}

/**
 * Turns a set of probes into something worth showing a person.
 *
 * MISSING AND UNKNOWN ARE REPORTED SEPARATELY and the headline names whichever
 * is worse. "Something is missing" is an instruction - go and apply a
 * migration. "I could not check" is a different sentence with a different
 * answer, and a screen that ran them together would send the owner to fix a
 * database that was fine.
 */
export function schemaReport(
  outcomes: ReadonlyMap<string, ProbeOutcome>,
  relations: readonly RequiredRelation[] = REQUIRED_RELATIONS,
): SchemaReport {
  const missing: RequiredRelation[] = [];
  const unknown: RequiredRelation[] = [];
  const present: RequiredRelation[] = [];

  for (const relation of relations) {
    switch (outcomes.get(relation.name) ?? "unknown") {
      case "present":
        present.push(relation);
        break;
      case "missing":
        missing.push(relation);
        break;
      default:
        unknown.push(relation);
    }
  }

  // Ordered, and each named once however many of its tables are absent.
  const missingMigrations = [...new Set(missing.map((r) => r.migration))].sort();

  return {
    ok: missing.length === 0 && unknown.length === 0,
    missing,
    unknown,
    present,
    missingMigrations,
    headline: headlineFor(missing, unknown, missingMigrations),
  };
}

function headlineFor(
  missing: RequiredRelation[],
  unknown: RequiredRelation[],
  missingMigrations: string[],
): string {
  if (missing.length > 0) {
    const count = missingMigrations.length;
    return count === 1
      ? "The database is missing one migration"
      : `The database is missing ${count} migrations`;
  }
  if (unknown.length > 0) return "The database could not be checked";
  return "The database has everything the system needs";
}

/**
 * What a person should do about it, in sentences rather than table names.
 *
 * The `0013` warning is not optional. That migration deletes every bill, loan,
 * product, apparel item and repair service, and it cannot be undone - so a
 * screen that says "run npm run db:push" without it is handing somebody a
 * loaded instruction. It is named whenever anything is missing, because the
 * app cannot see which migrations have been recorded and must therefore assume
 * the dangerous case is possible.
 */
export function schemaAdvice(report: SchemaReport): string[] {
  if (report.missing.length > 0) {
    return [
      `Apply ${report.missingMigrations.join(", ")} to the database this system is pointed at.`,
      "Before running npm run db:push, check which migrations are already recorded: select version from supabase_migrations.schema_migrations order by version. If 0011, 0012 and 0013 are NOT listed, do not push - 0013 deletes every bill, loan, product, apparel item and repair service, and it cannot be undone.",
      "If only the migrations above are missing, each one can be pasted into the Supabase SQL editor on its own.",
    ];
  }
  if (report.unknown.length > 0) {
    return [
      "This is not a report that anything is wrong - it is a report that the question could not be asked. The database may be paused, the key may have expired, or the network may have dropped.",
      "Try again in a moment. If it keeps saying this, check the Supabase project is running.",
    ];
  }
  return [];
}
