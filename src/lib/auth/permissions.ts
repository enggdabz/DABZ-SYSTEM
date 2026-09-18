/**
 * Roles and permissions (spec 4.2, 4.3).
 *
 * This file is the single description of who may do what. The database
 * enforces the same rules through Row Level Security - these are the same
 * rules expressed in TypeScript so screens can hide what a person cannot use.
 *
 * The database is the guard; this file is the courtesy.
 */

export const ROLES = ["owner", "admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

/** The permission checkboxes an Owner or Admin can tick for a staff member. */
export const PERMISSIONS = [
  "add_sales",
  "record_expenses",
  "stock_in_out",
  "dabztech_tickets",
  "apparel_job_orders",
  "give_discounts",
  "view_daily_sales_report",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

interface PermissionInfo {
  label: string;
  description: string;
  /** Ticked automatically for a brand-new staff account (spec 4.3). */
  defaultForNewStaff: boolean;
}

export const PERMISSION_INFO: Record<Permission, PermissionInfo> = {
  add_sales: {
    label: "Add sales (POS)",
    description: "Ring up sales at the counter.",
    defaultForNewStaff: true,
  },
  record_expenses: {
    label: "Record expenses",
    description: "Enter shop purchases like paper and ink.",
    defaultForNewStaff: false,
  },
  stock_in_out: {
    label: "Stock in / stock out",
    description: "Receive deliveries and take materials out of stock.",
    defaultForNewStaff: false,
  },
  dabztech_tickets: {
    label: "DabzTech job tickets",
    description: "Accept and update repair jobs.",
    defaultForNewStaff: false,
  },
  apparel_job_orders: {
    label: "Dabz Apparel job orders",
    description: "Create and update uniform orders.",
    defaultForNewStaff: false,
  },
  give_discounts: {
    label: "Give discounts",
    description: "Discount a sale, up to the limit set in Settings.",
    defaultForNewStaff: false,
  },
  view_daily_sales_report: {
    label: "View daily sales report",
    description: "See the day's sales total.",
    defaultForNewStaff: false,
  },
};

export const DEFAULT_NEW_STAFF_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (permission) => PERMISSION_INFO[permission].defaultForNewStaff,
);

/** Who the signed-in person is, as far as permission checks are concerned. */
export interface Actor {
  role: Role;
  permissions: readonly Permission[];
  status: "active" | "inactive";
}

/**
 * Owner and Admin are never limited by the checkboxes (spec 4.3), and a
 * deactivated account can do nothing at all (spec 13.1).
 */
export function can(actor: Actor | null, permission: Permission): boolean {
  if (!actor || actor.status !== "active") return false;
  if (actor.role === "owner" || actor.role === "admin") return true;
  return actor.permissions.includes(permission);
}

/**
 * Areas that can never be handed to staff, no matter the checkboxes
 * (spec 4.3): bills, loans, payroll, adding staff, void approvals, owner
 * withdrawals, full reports, settings.
 */
export function isOwnerOrAdmin(actor: Actor | null): boolean {
  if (!actor || actor.status !== "active") return false;
  return actor.role === "owner" || actor.role === "admin";
}

/** Only the Owner may create or remove Admins (spec 4.2). */
export function canManageAdmins(actor: Actor | null): boolean {
  return !!actor && actor.status === "active" && actor.role === "owner";
}

/**
 * May `actor` edit the account belonging to `target`?
 *
 * The Owner may edit anyone. An Admin may edit staff only, so they can neither
 * touch the Owner nor quietly promote themselves (spec 4.2, 4.4).
 */
export function canEditAccount(
  actor: Actor | null,
  target: { role: Role },
): boolean {
  if (!actor || actor.status !== "active") return false;
  if (actor.role === "owner") return true;
  if (actor.role === "admin") return target.role === "staff";
  return false;
}

/** Which roles may `actor` assign to someone else? */
export function assignableRoles(actor: Actor | null): Role[] {
  if (!actor || actor.status !== "active") return [];
  if (actor.role === "owner") return ["admin", "staff"];
  if (actor.role === "admin") return ["staff"];
  return [];
}
