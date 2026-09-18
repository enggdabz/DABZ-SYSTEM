import { describe, expect, it } from "vitest";

import { visibleSections } from "./navigation";
import {
  DEFAULT_NEW_STAFF_PERMISSIONS,
  PERMISSIONS,
  assignableRoles,
  can,
  canEditAccount,
  canManageAdmins,
  isOwnerOrAdmin,
  type Actor,
} from "./permissions";

const owner: Actor = { role: "owner", permissions: [], status: "active" };
const admin: Actor = { role: "admin", permissions: [], status: "active" };
const staff: Actor = { role: "staff", permissions: ["add_sales"], status: "active" };
const staffNothing: Actor = { role: "staff", permissions: [], status: "active" };
const deactivated: Actor = {
  role: "admin",
  permissions: [],
  status: "inactive",
};

describe("can", () => {
  it("lets the owner do everything without any checkboxes", () => {
    for (const permission of PERMISSIONS) {
      expect(can(owner, permission), permission).toBe(true);
    }
  });

  it("lets an admin do everything without any checkboxes", () => {
    for (const permission of PERMISSIONS) {
      expect(can(admin, permission), permission).toBe(true);
    }
  });

  it("limits staff to their ticked boxes", () => {
    expect(can(staff, "add_sales")).toBe(true);
    expect(can(staff, "record_expenses")).toBe(false);
    expect(can(staff, "give_discounts")).toBe(false);
  });

  it("gives a staff member with no boxes ticked nothing", () => {
    for (const permission of PERMISSIONS) {
      expect(can(staffNothing, permission), permission).toBe(false);
    }
  });

  it("refuses a deactivated account everything, whatever its role", () => {
    for (const permission of PERMISSIONS) {
      expect(can(deactivated, permission), permission).toBe(false);
    }
    expect(isOwnerOrAdmin(deactivated)).toBe(false);
  });

  it("refuses someone who is not signed in", () => {
    expect(can(null, "add_sales")).toBe(false);
    expect(isOwnerOrAdmin(null)).toBe(false);
    expect(canManageAdmins(null)).toBe(false);
  });
});

describe("new staff defaults", () => {
  it("starts a new staff account with Add sales only (spec 4.3)", () => {
    expect(DEFAULT_NEW_STAFF_PERMISSIONS).toEqual(["add_sales"]);
  });
});

describe("who may manage whom", () => {
  it("lets only the owner create or remove admins", () => {
    expect(canManageAdmins(owner)).toBe(true);
    expect(canManageAdmins(admin)).toBe(false);
    expect(canManageAdmins(staff)).toBe(false);
  });

  it("lets the owner edit anyone", () => {
    expect(canEditAccount(owner, { role: "owner" })).toBe(true);
    expect(canEditAccount(owner, { role: "admin" })).toBe(true);
    expect(canEditAccount(owner, { role: "staff" })).toBe(true);
  });

  it("lets an admin edit staff only - never the owner or another admin", () => {
    expect(canEditAccount(admin, { role: "staff" })).toBe(true);
    expect(canEditAccount(admin, { role: "owner" })).toBe(false);
    expect(canEditAccount(admin, { role: "admin" })).toBe(false);
  });

  it("never lets staff edit an account", () => {
    expect(canEditAccount(staff, { role: "staff" })).toBe(false);
    expect(canEditAccount(staff, { role: "owner" })).toBe(false);
  });

  it("offers the owner both roles and an admin only staff", () => {
    expect(assignableRoles(owner)).toEqual(["admin", "staff"]);
    expect(assignableRoles(admin)).toEqual(["staff"]);
    expect(assignableRoles(staff)).toEqual([]);
    expect(assignableRoles(deactivated)).toEqual([]);
  });
});

describe("visibleSections", () => {
  it("shows the owner-and-admin sections to the owner", () => {
    const hrefs = visibleSections(owner).map((section) => section.href);
    expect(hrefs).toContain("/staff");
    expect(hrefs).toContain("/settings");
    expect(hrefs).toContain("/activity");
  });

  it("hides them from staff", () => {
    const hrefs = visibleSections(staff).map((section) => section.href);
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).not.toContain("/activity");
    expect(hrefs).not.toContain("/bills");
  });

  it("shows staff the sections their checkboxes allow", () => {
    // Juan may add sales, so the POS is listed; stocks is not.
    const hrefs = visibleSections(staff).map((section) => section.href);
    expect(hrefs).toContain("/pos");
    expect(hrefs).not.toContain("/stocks");
  });

  it("always shows Home to anyone signed in", () => {
    // "/" is the shop's public page since Phase 9; the signed-in home is
    // "/overview".
    for (const actor of [owner, admin, staff, staffNothing]) {
      expect(visibleSections(actor).map((s) => s.href)).toContain("/overview");
    }
  });

  it("keeps customer messages away from staff", () => {
    // An enquiry carries a stranger's name and phone number, so it sits with
    // bills and payroll rather than behind a staff checkbox.
    expect(visibleSections(staff).map((s) => s.href)).not.toContain("/enquiries");
    expect(visibleSections(admin).map((s) => s.href)).toContain("/enquiries");
  });

  it("shows a deactivated account and a visitor nothing at all", () => {
    expect(visibleSections(deactivated)).toEqual([]);
    expect(visibleSections(null)).toEqual([]);
  });
});
