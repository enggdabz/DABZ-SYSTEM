import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { modulesFor } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

/** Reference tables whose contents the shop maintains directly. */
const COUNTED = [
  { table: "products", label: "Products" },
  { table: "repair_services", label: "Repair services" },
  { table: "apparel_products", label: "Apparel products" },
  { table: "bills", label: "Recurring bills" },
  { table: "loans", label: "Active loans" },
  { table: "suppliers", label: "Suppliers" },
  { table: "customers", label: "Customers" },
  { table: "staff", label: "Staff" },
] as const;

async function counts() {
  const supabase = await createClient();
  const results = await Promise.all(
    COUNTED.map(async ({ table, label }) => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      return { label, count: error ? null : (count ?? 0) };
    }),
  );
  return results;
}

export default async function AdminDashboard() {
  const { role, profile } = await requireUser();
  const [tiles, modules] = await Promise.all([
    counts(),
    Promise.resolve(modulesFor(role)),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <p className="label-caps text-brand">Overview</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-fg">
          Welcome back, {profile.full_name}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Reference data currently held in the system.
        </p>
      </div>

      <section aria-labelledby="totals">
        <h3 id="totals" className="sr-only">
          Record totals
        </h3>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="relative overflow-hidden rounded-xl border border-line bg-card p-5"
            >
              {/* A thin red rule anchors the tile without turning it into a red field. */}
              <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
              <dt className="label-caps text-fg-subtle">{tile.label}</dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums text-fg">
                {tile.count === null ? "—" : tile.count}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-fg-subtle">
          Sales, repair tickets and apparel orders have no records yet, so no
          trends are shown.
        </p>
      </section>

      <section aria-labelledby="modules">
        <h3 id="modules" className="label-caps mb-4 text-fg-subtle">
          Modules
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-sm font-semibold text-fg">{module.title}</h4>
                  {module.ready ? null : (
                    <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[0.6875rem] font-medium text-fg-subtle">
                      Not built yet
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-fg-muted">{module.body}</p>
              </>
            );

            return module.ready ? (
              <Link
                key={module.key}
                href={module.href}
                className="rounded-xl border border-line bg-card p-5 transition hover:border-brand"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={module.key}
                className="rounded-xl border border-dashed border-line bg-card p-5 opacity-70"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
