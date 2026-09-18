import "server-only";

/**
 * What is still waiting to be filled in (spec 17, and the owner's own request).
 *
 * The system is deliberately usable before every figure is known: a bill with
 * no due day, a loan with no interest rate, a product with no price and a staff
 * member with no daily rate are all REAL states, not errors. Nothing is ever
 * guessed for them, because a confident wrong number gets trusted.
 *
 * The cost of that honesty is that the gaps are scattered across six screens.
 * This gathers them into one list, so the owner can fill them in over weeks,
 * while the shop is already running, without hunting for them.
 */
import { cache } from "react";

import { getBills, getLoans } from "@/lib/data/money";
import { getAllProducts } from "@/lib/data/pos";
import { getStaff } from "@/lib/data/staff";
import { getStockItems } from "@/lib/data/stocks";

export interface ChecklistItem {
  id: string;
  /** What is missing, in the owner's words. */
  title: string;
  /** Why it matters - what the system cannot do until it is filled in. */
  why: string;
  /** The names still waiting, so the owner knows the size of the job. */
  names: string[];
  href: string;
  linkLabel: string;
  /** True when the system is meaningfully hobbled without it. */
  important: boolean;
}

export interface Checklist {
  items: ChecklistItem[];
  outstanding: number;
}

export const getChecklist = cache(async (): Promise<Checklist> => {
  const [bills, loans, staff, products, stockItems] = await Promise.all([
    getBills(),
    getLoans(),
    getStaff(),
    getAllProducts(),
    getStockItems(),
  ]);

  const items: ChecklistItem[] = [];

  const billsWithoutDueDay = bills.filter(
    (bill) => bill.active && bill.dueDay === null,
  );
  if (billsWithoutDueDay.length > 0) {
    items.push({
      id: "bill-due-days",
      title: `${billsWithoutDueDay.length} bill${billsWithoutDueDay.length === 1 ? "" : "s"} with no due day`,
      why: "Without a due day the system cannot warn you before a bill is late, and cannot put it in the 5-day reminder.",
      names: billsWithoutDueDay.map((bill) => bill.name),
      href: "/bills",
      linkLabel: "Open Bills",
      important: true,
    });
  }

  const loansWithoutRate = loans.filter(
    (loan) => loan.active && loan.interestPercentPerMonth === null,
  );
  if (loansWithoutRate.length > 0) {
    items.push({
      id: "loan-rates",
      title: `${loansWithoutRate.length} loan${loansWithoutRate.length === 1 ? "" : "s"} with no interest rate`,
      why: "Without the rate the payoff time ignores interest, and the system cannot tell you whether a balance is actually growing.",
      names: loansWithoutRate.map((loan) => loan.lender),
      href: "/loans",
      linkLabel: "Open Loans",
      important: true,
    });
  }

  const activeStaff = staff.filter((member) => member.status === "active");

  const staffWithoutRate = activeStaff.filter(
    (member) => member.dailyRateCentavos === null,
  );
  if (staffWithoutRate.length > 0) {
    items.push({
      id: "staff-rates",
      title: `${staffWithoutRate.length} staff with no daily rate`,
      why: "Payroll will not guess a wage, so it cannot work out their pay - and the daily target is short by what they cost.",
      names: staffWithoutRate.map((member) => member.fullName),
      href: "/staff",
      linkLabel: "Open Staff",
      important: true,
    });
  }

  const staffWithoutLogin = activeStaff.filter(
    (member) => member.profileId === null,
  );
  if (staffWithoutLogin.length > 0) {
    items.push({
      id: "staff-logins",
      title: `${staffWithoutLogin.length} staff with no login`,
      why: "Each person clocks only themselves in, so without an account they cannot use the time clock and you have to record their days yourself.",
      names: staffWithoutLogin.map((member) => member.fullName),
      href: "/accounts",
      linkLabel: "Open Accounts",
      important: false,
    });
  }

  const productsWithoutPrice = products.filter(
    (product) => product.active && product.priceCentavos === null,
  );
  if (productsWithoutPrice.length > 0) {
    items.push({
      id: "product-prices",
      title: `${productsWithoutPrice.length} product${productsWithoutPrice.length === 1 ? "" : "s"} with no price`,
      why: "The counter asks for the amount each time, which works - but a fixed price is faster and stops two staff charging differently.",
      names: productsWithoutPrice.map((product) => product.name),
      href: "/products",
      linkLabel: "Open Products",
      important: false,
    });
  }

  const activeStock = stockItems.filter((item) => item.active);

  const stockWithoutReorderLevel = activeStock.filter(
    (item) => item.reorderLevel === null,
  );
  if (stockWithoutReorderLevel.length > 0) {
    items.push({
      id: "stock-reorder-levels",
      title: `${stockWithoutReorderLevel.length} material${
        stockWithoutReorderLevel.length === 1 ? "" : "s"
      } with no reorder level`,
      why: "Until you say when to worry, the system cannot tell you to buy more. It will not guess a level - it would warn on the wrong day and you would learn to ignore it.",
      names: stockWithoutReorderLevel.map((item) => item.name),
      href: "/stocks",
      linkLabel: "Open Stocks",
      important: true,
    });
  }

  const stockWithoutCost = activeStock.filter(
    (item) => item.unitCostCentavos === null,
  );
  if (stockWithoutCost.length > 0) {
    items.push({
      id: "stock-costs",
      title: `${stockWithoutCost.length} material${
        stockWithoutCost.length === 1 ? "" : "s"
      } with no price`,
      why: "Without a price the shelf cannot be valued, so what you are holding is left out of the total.",
      names: stockWithoutCost.map((item) => item.name),
      href: "/stocks",
      linkLabel: "Open Stocks",
      important: false,
    });
  }

  if (activeStock.length === 0) {
    items.push({
      id: "no-stock",
      title: "No materials added yet",
      why: "Stock levels, low-stock warnings and the value of the shelf all wait on your list of materials - paper, ink, vinyl, blank shirts - and the unit you count each one in.",
      names: [],
      href: "/stocks",
      linkLabel: "Open Stocks",
      important: false,
    });
  }

  if (activeStaff.length === 0) {
    items.push({
      id: "no-staff",
      title: "No staff added yet",
      why: "The time clock and payroll have nobody to work with until someone is added.",
      names: [],
      href: "/staff",
      linkLabel: "Open Staff",
      important: false,
    });
  }

  return {
    items,
    outstanding: items.reduce(
      (total, item) => total + Math.max(1, item.names.length),
      0,
    ),
  };
});
