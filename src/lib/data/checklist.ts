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
import { getApparelProducts, getSizePrices } from "@/lib/data/apparel";
import { getRepairServices } from "@/lib/data/repairs";
import { getSettings } from "@/lib/auth/dal";

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
  const [
    bills,
    loans,
    staff,
    products,
    stockItems,
    apparelItems,
    sizes,
    settings,
    repairServices,
  ] =
    await Promise.all([
      getBills(),
      getLoans(),
      getStaff(),
      getAllProducts(),
      getStockItems(),
      getApparelProducts(),
      getSizePrices(),
      getSettings(),
      getRepairServices(),
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

  const apparelWithoutPrice = apparelItems.filter(
    (item) => item.active && item.basePriceCentavos === null,
  );
  if (apparelWithoutPrice.length > 0) {
    items.push({
      id: "apparel-prices",
      title: `${apparelWithoutPrice.length} apparel item${
        apparelWithoutPrice.length === 1 ? "" : "s"
      } with no price`,
      why: "A job order still works - whoever writes one is asked for the price - but two people quoting the same jersey will quote it differently.",
      names: apparelWithoutPrice.map((item) => item.name),
      href: "/apparel/prices",
      linkLabel: "Open apparel prices",
      important: true,
    });
  }

  const sizesWithoutPrice = sizes.filter((size) => size.extraCentavos === null);
  if (sizesWithoutPrice.length > 0) {
    items.push({
      id: "apparel-size-prices",
      title: `${sizesWithoutPrice.length} apparel size${
        sizesWithoutPrice.length === 1 ? "" : "s"
      } with no add-on`,
      why: "A 2XL costs more fabric to make. Until you say how much, those sizes go onto an order at no extra charge - which is not the same as free, only unknown.",
      names: sizesWithoutPrice.map((size) => size.size),
      href: "/apparel/prices",
      linkLabel: "Open apparel prices",
      important: false,
    });
  }

  const checkingFee = repairServices.find((service) => service.isCheckingFee);
  if (checkingFee && checkingFee.priceCentavos === null) {
    items.push({
      id: "repair-checking-fee",
      title: "No checking fee set",
      why: "It is the one charge that applies even when the customer says no to the repair, so it is the one worth setting first.",
      names: [],
      href: "/repairs/prices",
      linkLabel: "Open repair prices",
      important: true,
    });
  }

  const repairsWithoutPrice = repairServices.filter(
    (service) => service.active && !service.isCheckingFee && service.priceCentavos === null,
  );
  if (repairsWithoutPrice.length > 0) {
    items.push({
      id: "repair-prices",
      title: `${repairsWithoutPrice.length} repair service${
        repairsWithoutPrice.length === 1 ? "" : "s"
      } with no price`,
      why: "A ticket still works - whoever writes one is asked for the price - but two technicians will charge differently for the same job.",
      names: repairsWithoutPrice.map((service) => service.name),
      href: "/repairs/prices",
      linkLabel: "Open repair prices",
      important: false,
    });
  }

  if (settings.apparelDownPaymentPercent === null) {
    items.push({
      id: "apparel-down-payment",
      title: "No down payment policy for apparel",
      why: "The order screen asks for whatever the customer hands over and never says a payment is short. Set a percentage and it starts checking.",
      names: [],
      href: "/settings",
      linkLabel: "Open Settings",
      important: false,
    });
  }

  /*
    The shop's own details (Phase 9). These are facts only the owner knows, and
    the public page leaves out whatever is missing rather than printing a guess
    - a made-up address on a page a real person might drive to is a different
    order of mistake from a made-up figure on an internal screen.
  */
  const missingPublicDetails = [
    settings.shopAddress === null ? "Address" : null,
    settings.shopPhone === null ? "Phone number" : null,
    settings.publicOpeningHours === null ? "Opening hours" : null,
    settings.facebookPageUrl === null ? "Facebook page" : null,
    settings.messengerUsername === null ? "Messenger name" : null,
  ].filter((label): label is string => label !== null);

  if (missingPublicDetails.length > 0) {
    items.push({
      id: "public-page-details",
      title: `${missingPublicDetails.length} shop detail${
        missingPublicDetails.length === 1 ? "" : "s"
      } missing from your public page`,
      why: "A customer arriving from Facebook is shown only what you have filled in. Nothing here is guessed, so an empty address is simply absent from the page - and the Message us button is missing until the Messenger name is set.",
      names: missingPublicDetails,
      href: "/settings",
      linkLabel: "Open Settings",
      important: true,
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
