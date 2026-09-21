/**
 * The navigation (spec 4.1, 4.3).
 *
 * A person only sees the sections they are allowed to open. Hiding a link is
 * not security on its own - the database still refuses the data - but it keeps
 * the counter screen uncluttered and stops staff hitting dead ends.
 *
 * Sections for phases that are not built yet are marked `comingSoon` so the
 * shape of the finished system is visible from the start.
 */
import { isOwnerOrAdmin, can, type Actor, type Permission } from "./permissions";

/**
 * The three blocks the sidebar shows under their own headings. They were
 * already here as blank lines in the list below; naming them makes the
 * grouping something the sidebar can render rather than something a reader
 * has to infer.
 */
export type NavGroup = "Daily" | "Money & people" | "Manage";

export const NAV_GROUPS: NavGroup[] = ["Daily", "Money & people", "Manage"];

export interface NavSection {
  href: string;
  label: string;
  group: NavGroup;
  /** Needs this permission. Owner/Admin always pass. */
  permission?: Permission;
  /** Owner and Admin only, never grantable to staff (spec 4.3). */
  ownerOrAdminOnly?: boolean;
  /** Which build phase delivers it. */
  phase: number;
  comingSoon?: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  /*
    Ordered by how often the shop actually opens them, not by which phase built
    them, so the counter's daily screens come first and are never scrolled to.
  */
  { href: "/overview", label: "Home", group: "Daily", phase: 1 },
  { href: "/pos", label: "Counter", permission: "add_sales", group: "Daily", phase: 4 },
  { href: "/sales", label: "Sales", permission: "add_sales", group: "Daily", phase: 4 },
  { href: "/timeclock", label: "Time clock", group: "Daily", phase: 3 },
  { href: "/closing", label: "End of day", permission: "add_sales", group: "Daily", phase: 4 },
  { href: "/expenses", label: "Expenses", permission: "record_expenses", group: "Daily", phase: 5 },
  { href: "/stocks", label: "Stocks", permission: "stock_in_out", group: "Daily", phase: 5 },
  { href: "/apparel", label: "Apparel", permission: "apparel_job_orders", group: "Daily", phase: 6 },
  {
    href: "/apparel/calendar",
    label: "Apparel calendar",
    permission: "apparel_job_orders",
    group: "Daily",
    phase: 6,
  },
  { href: "/repairs", label: "Repairs", permission: "dabztech_tickets", group: "Daily", phase: 7 },
  { href: "/customers", label: "Customers", group: "Daily", phase: 4 },

  { href: "/enquiries", label: "Messages", ownerOrAdminOnly: true, group: "Money & people", phase: 9 },
  { href: "/bills", label: "Bills", ownerOrAdminOnly: true, group: "Money & people", phase: 2 },
  { href: "/loans", label: "Loans", ownerOrAdminOnly: true, group: "Money & people", phase: 2 },
  { href: "/ledger", label: "Money in/out", ownerOrAdminOnly: true, group: "Money & people", phase: 2 },
  { href: "/payables", label: "Owed to suppliers", ownerOrAdminOnly: true, group: "Money & people", phase: 5 },
  { href: "/payroll", label: "Payroll", ownerOrAdminOnly: true, group: "Money & people", phase: 3 },
  { href: "/staff", label: "Staff", ownerOrAdminOnly: true, group: "Money & people", phase: 3 },

  { href: "/reports", label: "Reports", ownerOrAdminOnly: true, group: "Manage", phase: 8 },
  { href: "/products", label: "Products", ownerOrAdminOnly: true, group: "Manage", phase: 4 },
  { href: "/accounts", label: "Accounts", ownerOrAdminOnly: true, group: "Manage", phase: 1 },
  { href: "/activity", label: "Activity", ownerOrAdminOnly: true, group: "Manage", phase: 1 },
  { href: "/settings", label: "Settings", ownerOrAdminOnly: true, group: "Manage", phase: 1 },
  { href: "/checklist", label: "To fill in", ownerOrAdminOnly: true, group: "Manage", phase: 4 },
  { href: "/system", label: "System check", ownerOrAdminOnly: true, group: "Manage", phase: 1 },
];

export function visibleSections(actor: Actor | null): NavSection[] {
  return NAV_SECTIONS.filter((section) => {
    if (section.ownerOrAdminOnly) return isOwnerOrAdmin(actor);
    if (section.permission) return can(actor, section.permission);
    // No requirement: anyone signed in may open it.
    return !!actor && actor.status === "active";
  });
}
