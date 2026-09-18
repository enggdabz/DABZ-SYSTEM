import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import type { AppRole } from "@/lib/types/app";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The modules backed by the existing database schema. `ready` flips to true as
 * each one is built; until then the card is inert rather than a link, so it
 * cannot lead to a 404.
 */
const MODULES: {
  href: string;
  title: string;
  body: string;
  roles: readonly AppRole[];
  ready: boolean;
}[] = [
  {
    href: "/admin/sales",
    title: "Sales",
    body: "Point of sale, sale lines, discounts and void requests.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    href: "/admin/repairs",
    title: "DabzTech repairs",
    body: "Repair tickets, services, parts fitted and repair payments.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    href: "/admin/apparel",
    title: "Apparel job orders",
    body: "Orders, name lists, fabric and collar options, down payments.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    href: "/admin/inventory",
    title: "Inventory",
    body: "Stock items, stock movements, suppliers and payables.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    href: "/admin/expenses",
    title: "Expenses & bills",
    body: "Expense capture and approval, recurring bills, loans.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    href: "/admin/payroll",
    title: "Payroll & attendance",
    body: "Weekly payroll, attendance entries, cash advances.",
    roles: ["owner", "admin"],
    ready: false,
  },
  {
    href: "/admin/reports",
    title: "Reports & day closing",
    body: "Ledger, daily sales, day closing and targets.",
    roles: ["owner", "admin"],
    ready: false,
  },
  {
    href: "/admin/settings",
    title: "Settings & users",
    body: "Shop settings, staff accounts, permissions and audit log.",
    roles: ["owner", "admin"],
    ready: false,
  },
];

export default async function AdminDashboard() {
  const { role, profile } = await requireUser();
  const visible = MODULES.filter((m) => m.roles.includes(role));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Signed in as {profile.full_name} ({role}).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((module) => {
          const heading = (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {module.title}
                </h2>
                {module.ready ? null : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Not built yet
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{module.body}</p>
            </>
          );

          return module.ready ? (
            <Link
              key={module.href}
              href={module.href}
              className="rounded-xl border border-slate-200 p-5 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-900"
            >
              {heading}
            </Link>
          ) : (
            <div
              key={module.href}
              className="rounded-xl border border-dashed border-slate-200 p-5 opacity-70 dark:border-slate-800"
            >
              {heading}
            </div>
          );
        })}
      </div>
    </div>
  );
}
