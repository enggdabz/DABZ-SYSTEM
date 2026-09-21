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
  /**
   * Set when the entry is a COLUMN on `name` rather than the relation itself.
   * See REQUIRED_COLUMNS below for why a column is worth probing at all.
   */
  column?: string;
  /** The migration file that creates it, so the fix names itself. */
  migration: string;
  /** What the owner loses, in the owner's words - not in table names. */
  breaks: string;
}

/** What to ask the database about - a table name, or `table.column`. */
export function probeKey(relation: RequiredRelation): string {
  return relation.column ? `${relation.name}.${relation.column}` : relation.name;
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
  ...["apparel_production_steps"].map((name) => ({
    name,
    migration: "0018_phase12_production",
    breaks: "the production report - where each item on a project has got to",
  })),
  ...[
    "online_categories",
    "online_design_products",
    "online_designs",
    "online_order_files",
    "online_order_items",
    "online_order_production",
    "online_order_roster",
    "online_order_totals",
    "online_orders",
    "online_payments",
    "online_product_images",
    "online_product_options",
    "online_product_prices",
    "online_product_stats",
    "online_production_stages",
    "online_products",
    "online_status_log",
    "online_rate_events",
  ].map((name) => ({
    name,
    migration: "0019_phase13_online_orders",
    breaks: "the online shop, its orders, the production board and the order calendar"
  })),
];

/*
  Some migrations create no table at all - they add a COLUMN to one that
  already existed. Those are invisible to every probe above, and on
  21 September 2026 that gap cost the owner the Settings screen: `0014` adds
  `app_settings.staff_stay_signed_in` and nothing else, so it had never reached
  the production database, Settings could not save ANY setting, and this
  screen cheerfully reported that the database had everything the system needs.

  That is the same sin as the PHP 0.00 on Sales that this whole file was
  written for, one layer down: a confident "all fine" beside a screen that is
  visibly not fine.

  ONE COLUMN PER TABLE PER MIGRATION, for the reason the sentinels exist: a
  migration is applied whole, so asking about one of the eight columns `0009`
  adds answers for all eight at an eighth of the cost. The guard test reads the
  migrations and fails if a table gains a column from a LATER migration and
  nothing here asks about it.
*/
export const REQUIRED_COLUMNS: readonly RequiredRelation[] = [
  {
    name: "app_settings",
    column: "receipt_paper",
    migration: "0005_phase4_pos",
    breaks: "choosing the receipt paper size, and saving any other setting",
  },
  {
    name: "app_settings",
    column: "apparel_down_payment_percent",
    migration: "0007_phase6_apparel",
    breaks: "the apparel down payment percentage, and saving any other setting",
  },
  {
    name: "app_settings",
    column: "shop_address",
    migration: "0009_phase9_public",
    breaks: "the shop details on the public page, and saving any other setting",
  },
  {
    name: "app_settings",
    column: "staff_stay_signed_in",
    migration: "0014_staff_stay_signed_in",
    breaks: "keeping staff signed in, and saving any other setting",
  },
  {
    name: "repair_payments",
    column: "kind",
    migration: "0015_phase10_collections",
    breaks: "telling a repair down payment from a balance on the Sales screen",
  },
  {
    name: "day_closings",
    column: "counter_cash_centavos",
    migration: "0015_phase10_collections",
    breaks: "the breakdown kept with a closed day",
  },
  {
    name: "app_settings",
    column: "online_min_days_ahead",
    migration: "0019_phase13_online_orders",
    breaks: "the online shop's own settings, and saving any other setting",
  },
  {
    /*
      `customers` was created by 0005 and gained this column in 0018, so no
      relation probe can see it is absent - the same shape of gap as 0014's.
      Nothing writes it yet, but it is what the online shop's own tables sit
      beside, and a database missing it is a database missing all of them.
    */
    name: "customers",
    column: "messenger_psid",
    migration: "0019_phase13_online_orders",
    breaks: "linking a customer to their Messenger chat later on",
  },
];

/** Everything the System check screen asks about - relations and columns. */
export const REQUIRED_SCHEMA: readonly RequiredRelation[] = [
  ...REQUIRED_RELATIONS,
  ...REQUIRED_COLUMNS,
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
  REQUIRED_SCHEMA.reduce<Record<string, RequiredRelation>>((first, relation) => {
    first[relation.migration] ??= relation;
    return first;
  }, {}),
);

export type ProbeOutcome = "present" | "missing" | "unknown";

/**
 * Was this the database saying "no such table or column", or something else
 * entirely?
 *
 * PostgreSQL answers 42P01 and PostgREST answers PGRST205 when a relation is
 * not there; 42703 and PGRST204 are the same answer about a column. ANYTHING
 * else - a timeout, a paused project, a bad key, a row limit - is `unknown`,
 * because none of those is evidence about the schema and guessing would put a
 * wrong answer beside the owner's money.
 */
export function outcomeFromError(
  error: { code?: string | null; message?: string | null } | null,
): ProbeOutcome {
  if (error === null) return "present";

  const code = (error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return "missing";

  // 42703 is PostgreSQL's undefined_column, which is how a COLUMN probe comes
  // back when the migration that adds it never ran. Unambiguous - it means
  // this and nothing else.
  if (code === "42703" || code === "PGRST204") return "missing";

  // Some proxies drop the code and keep only the sentence.
  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    /could not find the .*column/.test(message)
  ) {
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
  relations: readonly RequiredRelation[] = REQUIRED_SCHEMA,
): SchemaReport {
  const missing: RequiredRelation[] = [];
  const unknown: RequiredRelation[] = [];
  const present: RequiredRelation[] = [];

  for (const relation of relations) {
    switch (outcomes.get(probeKey(relation)) ?? "unknown") {
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
