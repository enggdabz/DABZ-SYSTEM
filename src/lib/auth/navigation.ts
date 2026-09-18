/**
 * The top navigation (spec 4.1, 4.3).
 *
 * A person only sees the sections they are allowed to open. Hiding a link is
 * not security on its own - the database still refuses the data - but it keeps
 * the counter screen uncluttered and stops staff hitting dead ends.
 *
 * Sections for phases that are not built yet are marked `comingSoon` so the
 * shape of the finished system is visible from the start.
 */
import { isOwnerOrAdmin, can, type Actor, type Permission } from "./permissions";

export interface NavSection {
  href: string;
  label: string;
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
    them. The bar scrolls sideways on a narrow screen, so what matters is that
    the counter's daily screens come first and never need scrolling to reach.
  */
  { href: "/overview", label: "Home", phase: 1 },
  { href: "/pos", label: "Counter", permission: "add_sales", phase: 4 },
  { href: "/sales", label: "Sales", permission: "add_sales", phase: 4 },
  { href: "/timeclock", label: "Time clock", phase: 3 },
  { href: "/closing", label: "End of day", permission: "add_sales", phase: 4 },
  { href: "/expenses", label: "Expenses", permission: "record_expenses", phase: 5 },
  { href: "/stocks", label: "Stocks", permission: "stock_in_out", phase: 5 },
  { href: "/apparel", label: "Apparel", permission: "apparel_job_orders", phase: 6 },
  { href: "/repairs", label: "Repairs", permission: "dabztech_tickets", phase: 7 },
  { href: "/customers", label: "Customers", phase: 4 },

  { href: "/enquiries", label: "Messages", ownerOrAdminOnly: true, phase: 9 },
  { href: "/bills", label: "Bills", ownerOrAdminOnly: true, phase: 2 },
  { href: "/loans", label: "Loans", ownerOrAdminOnly: true, phase: 2 },
  { href: "/ledger", label: "Money in/out", ownerOrAdminOnly: true, phase: 2 },
  { href: "/payables", label: "Owed to suppliers", ownerOrAdminOnly: true, phase: 5 },
  { href: "/payroll", label: "Payroll", ownerOrAdminOnly: true, phase: 3 },
  { href: "/staff", label: "Staff", ownerOrAdminOnly: true, phase: 3 },

  { href: "/reports", label: "Reports", ownerOrAdminOnly: true, phase: 8 },
  { href: "/products", label: "Products", ownerOrAdminOnly: true, phase: 4 },
  { href: "/accounts", label: "Accounts", ownerOrAdminOnly: true, phase: 1 },
  { href: "/activity", label: "Activity", ownerOrAdminOnly: true, phase: 1 },
  { href: "/settings", label: "Settings", ownerOrAdminOnly: true, phase: 1 },
  { href: "/checklist", label: "To fill in", ownerOrAdminOnly: true, phase: 4 },
];

export function visibleSections(actor: Actor | null): NavSection[] {
  return NAV_SECTIONS.filter((section) => {
    if (section.ownerOrAdminOnly) return isOwnerOrAdmin(actor);
    if (section.permission) return can(actor, section.permission);
    // No requirement: anyone signed in may open it.
    return !!actor && actor.status === "active";
  });
}
