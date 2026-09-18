import type { AppRole } from "@/lib/types/app";

/**
 * The modules backed by the existing database schema — the single source of
 * truth for both the sidebar and the dashboard grid.
 *
 * `ready` flips to true as each module is built. Until then its card is inert
 * and its sidebar entry is disabled, so neither can lead to a 404.
 */
export type Module = {
  key: string;
  href: string;
  title: string;
  short: string;
  body: string;
  roles: readonly AppRole[];
  ready: boolean;
};

export const MODULES: readonly Module[] = [
  {
    key: "sales",
    href: "/admin/sales",
    title: "Sales",
    short: "Sales",
    body: "Point of sale, sale lines, discounts and void requests.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    key: "repairs",
    href: "/admin/repairs",
    title: "DabzTech repairs",
    short: "Repairs",
    body: "Repair tickets, services, parts fitted and repair payments.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    key: "apparel",
    href: "/admin/apparel",
    title: "Apparel job orders",
    short: "Apparel",
    body: "Orders, name lists, fabric and collar options, down payments.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    key: "inventory",
    href: "/admin/inventory",
    title: "Inventory",
    short: "Inventory",
    body: "Stock items, stock movements, suppliers and payables.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    key: "expenses",
    href: "/admin/expenses",
    title: "Expenses & bills",
    short: "Expenses",
    body: "Expense capture and approval, recurring bills, loans.",
    roles: ["owner", "admin", "staff"],
    ready: false,
  },
  {
    key: "payroll",
    href: "/admin/payroll",
    title: "Payroll & attendance",
    short: "Payroll",
    body: "Weekly payroll, attendance entries, cash advances.",
    roles: ["owner", "admin"],
    ready: false,
  },
  {
    key: "reports",
    href: "/admin/reports",
    title: "Reports & day closing",
    short: "Reports",
    body: "Ledger, daily sales, day closing and targets.",
    roles: ["owner", "admin"],
    ready: false,
  },
  {
    key: "settings",
    href: "/admin/settings",
    title: "Settings & users",
    short: "Settings",
    body: "Shop settings, staff accounts, permissions and audit log.",
    roles: ["owner", "admin"],
    ready: false,
  },
];

export function modulesFor(role: AppRole): Module[] {
  return MODULES.filter((m) => m.roles.includes(role));
}
