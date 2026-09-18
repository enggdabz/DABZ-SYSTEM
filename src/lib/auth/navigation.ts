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
  { href: "/", label: "Home", phase: 1 },
  { href: "/staff", label: "Staff", ownerOrAdminOnly: true, phase: 1 },
  { href: "/activity", label: "Activity", ownerOrAdminOnly: true, phase: 1 },
  { href: "/settings", label: "Settings", ownerOrAdminOnly: true, phase: 1 },

  { href: "/bills", label: "Bills", ownerOrAdminOnly: true, phase: 2 },
  { href: "/loans", label: "Loans", ownerOrAdminOnly: true, phase: 2 },
  { href: "/ledger", label: "Money in/out", ownerOrAdminOnly: true, phase: 2 },
  { href: "/payroll", label: "Payroll", ownerOrAdminOnly: true, phase: 3, comingSoon: true },
  { href: "/pos", label: "POS", permission: "add_sales", phase: 4, comingSoon: true },
  { href: "/stocks", label: "Stocks", permission: "stock_in_out", phase: 5, comingSoon: true },
];

export function visibleSections(actor: Actor | null): NavSection[] {
  return NAV_SECTIONS.filter((section) => {
    if (section.ownerOrAdminOnly) return isOwnerOrAdmin(actor);
    if (section.permission) return can(actor, section.permission);
    // No requirement: anyone signed in may open it.
    return !!actor && actor.status === "active";
  });
}
