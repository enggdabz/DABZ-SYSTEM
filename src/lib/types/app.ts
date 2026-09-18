import type { Database } from "@/lib/types/database";

export type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type Staff = Tables["staff"]["Row"];

/** profiles.role — see the profiles_role_check constraint. */
export type AppRole = "owner" | "admin" | "staff";
export const APP_ROLES: readonly AppRole[] = ["owner", "admin", "staff"];

/** profiles.status — see the profiles_status_check constraint. */
export type ProfileStatus = "active" | "inactive";

/**
 * Per-user permission flags for the `staff` role. Owner and admin bypass these
 * entirely, matching public.has_permission() in the database.
 */
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

export function isAppRole(value: string | null | undefined): value is AppRole {
  return value === "owner" || value === "admin" || value === "staff";
}
