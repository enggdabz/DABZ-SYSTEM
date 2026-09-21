import type { OnlineTab } from "./OnlineTabs";

/**
 * Which tabs this person gets.
 *
 * Reports, Products and Designs are Owner/Admin only - the same rule as every
 * other price list and every other report in this system. Hiding a tab is a
 * courtesy; each of those screens re-checks on the server.
 */
export function onlineTabs(isOwnerOrAdmin: boolean): OnlineTab[] {
  const tabs: OnlineTab[] = [
    { href: "/online-orders", label: "Orders" },
    { href: "/online-orders/production", label: "Production" },
    { href: "/online-orders/calendar", label: "Calendar" },
  ];

  if (isOwnerOrAdmin) {
    tabs.push(
      { href: "/online-orders/reports", label: "Reports" },
      { href: "/online-orders/products", label: "Products" },
      { href: "/online-orders/designs", label: "Designs" },
    );
  }

  return tabs;
}
