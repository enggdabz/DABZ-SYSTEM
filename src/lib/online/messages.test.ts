import { describe, expect, it } from "vitest";

import { messageFor } from "./messages";
import type {
  OrderDetail,
  OrderStatus,
  ProductionRow,
  ProductionStage,
} from "./types";

const STAGES: ProductionStage[] = [
  { key: "design", label: "Design", customerLabel: "Design", description: "", position: 1, inDtfPath: true },
  { key: "pattern", label: "Pattern", customerLabel: "Pattern", description: "", position: 2, inDtfPath: false },
  { key: "print", label: "Print", customerLabel: "Print", description: "", position: 3, inDtfPath: true },
  { key: "heat_press", label: "Heat press", customerLabel: "Heat press", description: "", position: 4, inDtfPath: true },
  { key: "tabas", label: "Tabas", customerLabel: "Cutting (tabas)", description: "", position: 5, inDtfPath: false },
  { key: "sewing", label: "Sewing", customerLabel: "Sewing", description: "", position: 6, inDtfPath: false },
  { key: "quality_check", label: "Quality check", customerLabel: "Quality check", description: "", position: 7, inDtfPath: true },
  { key: "packaging", label: "Packaging", customerLabel: "Packaging", description: "", position: 8, inDtfPath: true },
];

const done = (...keys: string[]): ProductionRow[] =>
  keys.map((stageKey) => ({ stageKey, doneAt: "2026-09-16T02:00:00Z", doneByName: "Juan", skipped: false }));

function order(over: Partial<OrderDetail> & { status: OrderStatus }): OrderDetail {
  return {
    id: "o1",
    orderNo: "DA-0042",
    customerName: "Mark",
    mobile: "09171234567",
    facebookName: null,
    method: "pickup",
    address: null,
    notes: null,
    cancelReason: null,
    completedAt: null,
    cancelledAt: null,
    dateNeeded: { year: 2026, month: 9, day: 25 },
    source: "website",
    createdAt: "2026-09-10T03:00:00Z",
    quoteAmountCentavos: null,
    fixedTotalCentavos: 270000,
    totalCentavos: 270000,
    paidCentavos: 0,
    balanceCentavos: 270000,
    pieces: 6,
    hasQuoteItems: false,
    firstItemName: "Jersey",
    extraItemCount: 0,
    doneStageKeys: [],
    productionPath: "full",
    items: [
      {
        id: "i1",
        productId: "p1",
        productName: "Jersey",
        categoryName: "Jerseys",
        productionPath: "full",
        pricingMode: "fixed",
        variantLabel: "Standard",
        unitPriceCentavos: 45000,
        options: {},
        qty: 6,
        sizes: {},
        designId: null,
        designCode: null,
        designName: null,
        teamColors: null,
        notes: null,
        roster: [],
        files: [],
      },
    ],
    payments: [],
    production: [],
    history: [],
    ...over,
  };
}

const say = (o: OrderDetail, downPaymentPercent: number | null = null) =>
  messageFor({ order: o, stages: STAGES, downPaymentPercent });

describe("messageFor", () => {
  it("tells a customer with something to price that a quote is coming", () => {
    const text = say(
      order({
        status: "new",
        hasQuoteItems: true,
        items: [
          {
            ...order({ status: "new" }).items[0],
            pricingMode: "quote",
            unitPriceCentavos: null,
          },
        ],
      }),
    );
    expect(text).toContain("We received your order DA-0042");
    expect(text).toContain("send the quote shortly");
  });

  it("does not promise a quote on an order that was priced on the page", () => {
    /*
      Telling somebody "we will send the quote shortly" when the price was
      printed beside the Add to order button is confusing, and saying nothing
      at all is worse.
    */
    const text = say(order({ status: "new" }));
    expect(text).toContain("confirm it and send the down payment details");
    expect(text).not.toContain("quote");
  });

  it("gives the quote with the pieces and the total", () => {
    const text = say(
      order({ status: "quoted", hasQuoteItems: true, quoteAmountCentavos: 800000 }),
    );
    expect(text).toContain("(6 pcs)");
    expect(text).toContain("₱10,700.00");
    expect(text).toContain("Reply YES");
  });

  it("says nothing about a down payment share the owner has not set", () => {
    // The specification offers "e.g. 50%", which is an example, not the owner
    // saying so. A made-up policy would have staff turning away a customer who
    // paid what the owner actually wanted.
    const text = say(order({ status: "quoted", quoteAmountCentavos: 0 }), null);
    expect(text).not.toContain("down payment is");
  });

  it("names the down payment once the owner has set one", () => {
    const text = say(order({ status: "quoted" }), 50);
    expect(text).toContain("The down payment is ₱1,350.00 (50%)");
  });

  it("says what has been paid when the order is confirmed", () => {
    const text = say(
      order({
        status: "confirmed",
        payments: [
          { id: "p", amountCentavos: 135000, method: "cash", paidOn: "2026-09-12", note: null, voidedAt: null, voidReason: null },
        ],
      }),
    );
    expect(text).toContain("Payment received so far: ₱1,350.00");
  });

  it("asks the customer to check the layout when production has just started", () => {
    const text = say(order({ status: "in_production" }));
    expect(text).toContain("The first step is your design layout");
    expect(text).toContain("names, numbers and sizes");
  });

  it("names the step just finished and the one under way, in the CUSTOMER's words", () => {
    const text = say(
      order({ status: "in_production", production: done("design", "pattern", "print", "heat_press") }),
    );
    // "Tabas" is shop language; the customer reads "Cutting (tabas)".
    expect(text).toContain("Heat press is done");
    expect(text).toContain("now in Cutting (tabas)");
    expect(text).toContain("step 5 of 8");
    expect(text).toContain("Target date: Sep 25, 2026");
  });

  it("counts out of five on a DTF order", () => {
    const text = say(
      order({
        status: "in_production",
        productionPath: "dtf",
        production: done("design", "print"),
      }),
    );
    expect(text).toContain("step 3 of 5");
  });

  it("says pick up or delivery, and the balance, when it is packed", () => {
    const pickup = say(order({ status: "ready_to_ship" }));
    expect(pickup).toContain("ready for pick up");
    expect(pickup).toContain("Remaining balance: ₱2,700.00");

    const delivery = say(order({ status: "ready_to_ship", method: "delivery", address: "Somewhere" }));
    expect(delivery).toContain("ready for delivery");
  });

  it("thanks them when it is done and asks for nothing", () => {
    const text = say(order({ status: "completed" }));
    expect(text).toContain("Thank you Mark");
    expect(text).toContain("team photo");
  });

  it("leaves the door open on a cancelled order", () => {
    const text = say(order({ status: "cancelled" }));
    expect(text).toContain("has been cancelled");
    expect(text).toContain("any time");
  });

  it("has something to say in every state", () => {
    const statuses: OrderStatus[] = [
      "new",
      "quoted",
      "confirmed",
      "in_production",
      "ready_to_ship",
      "completed",
      "cancelled",
    ];
    for (const status of statuses) {
      const text = say(order({ status }));
      expect(text.length, status).toBeGreaterThan(20);
      expect(text, status).toContain("DA-0042");
    }
  });
});
