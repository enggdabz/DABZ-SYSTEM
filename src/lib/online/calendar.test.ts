import { describe, expect, it } from "vitest";

import { buildOrderCalendar, shortOrderNo } from "./calendar";
import type { OrderStatus, OrderSummary } from "./types";

const today = { year: 2026, month: 9, day: 21 };
const september = { year: 2026, month: 9 };

function order(over: Partial<OrderSummary> & { id: string }): OrderSummary {
  return {
    orderNo: `DA-00${over.id}`,
    customerName: "A customer",
    mobile: "09171234567",
    status: "confirmed" as OrderStatus,
    method: "pickup",
    dateNeeded: today,
    source: "website",
    createdAt: "2026-09-10T03:00:00Z",
    quoteAmountCentavos: null,
    fixedTotalCentavos: 0,
    totalCentavos: 0,
    paidCentavos: 0,
    balanceCentavos: 0,
    pieces: 10,
    hasQuoteItems: false,
    firstItemName: "Jersey",
    extraItemCount: 0,
    doneStageKeys: [],
    productionPath: "full",
    ...over,
  };
}

const build = (orders: OrderSummary[], capacity: number | null = null) =>
  buildOrderCalendar({ orders, period: september, today, dailyCapacityPcs: capacity });

describe("buildOrderCalendar", () => {
  it("lays the month out in whole weeks starting on Sunday", () => {
    const calendar = build([]);
    for (const week of calendar.weeks) expect(week).toHaveLength(7);

    const first = calendar.weeks[0][0];
    const weekday = new Date(`${first.date}T00:00:00Z`).getUTCDay();
    expect(weekday).toBe(0);
  });

  it("covers every day of the month and marks the ones outside it", () => {
    const calendar = build([]);
    const days = calendar.weeks.flat();
    const inMonth = days.filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(days.some((day) => !day.inMonth)).toBe(true);
  });

  it("marks today", () => {
    const calendar = build([]);
    const marked = calendar.weeks.flat().filter((day) => day.isToday);
    expect(marked.map((day) => day.date)).toEqual(["2026-09-21"]);
  });

  it("puts an order on the day it is due", () => {
    const calendar = build([
      order({ id: "1", dateNeeded: { year: 2026, month: 9, day: 25 } }),
    ]);
    const day = calendar.weeks.flat().find((d) => d.date === "2026-09-25");
    expect(day?.orders.map((o) => o.id)).toEqual(["1"]);
  });

  it("leaves a cancelled order off the calendar entirely", () => {
    /*
      A cancelled order is not work. A day that looks busy because of three
      orders nobody is making is a day the shop turns a customer away from.
    */
    const calendar = build([
      order({ id: "1", status: "cancelled", dateNeeded: { year: 2026, month: 9, day: 25 } }),
    ]);
    expect(calendar.weeks.flat().every((day) => day.orders.length === 0)).toBe(true);
    expect(calendar.dueThisMonth).toHaveLength(0);
  });

  it("knows of no full day until the owner says what full is", () => {
    const calendar = build([
      order({ id: "1", pieces: 200, dateNeeded: { year: 2026, month: 9, day: 25 } }),
    ]);
    const day = calendar.weeks.flat().find((d) => d.date === "2026-09-25");
    expect(day?.load?.full).toBeNull();
  });

  it("marks a day full once it is over the capacity", () => {
    const calendar = build(
      [
        order({ id: "1", pieces: 40, dateNeeded: { year: 2026, month: 9, day: 25 } }),
        order({ id: "2", pieces: 34, dateNeeded: { year: 2026, month: 9, day: 25 } }),
      ],
      60,
    );
    const day = calendar.weeks.flat().find((d) => d.date === "2026-09-25");
    expect(day?.load).toMatchObject({ pieces: 74, full: true });
  });

  it("lists what is due this month, soonest first", () => {
    const calendar = build([
      order({ id: "2", dateNeeded: { year: 2026, month: 9, day: 28 } }),
      order({ id: "1", dateNeeded: { year: 2026, month: 9, day: 22 } }),
      order({ id: "3", dateNeeded: { year: 2026, month: 10, day: 2 } }),
    ]);
    expect(calendar.dueThisMonth.map((o) => o.id)).toEqual(["2", "1"].sort());
    expect(calendar.dueThisMonth.map((o) => o.id)).toEqual(["1", "2"]);
  });

  it("counts what is already late", () => {
    const calendar = build([
      order({ id: "1", dateNeeded: { year: 2026, month: 9, day: 1 } }),
      order({ id: "2", dateNeeded: { year: 2026, month: 9, day: 1 }, status: "ready_to_ship" }),
    ]);
    expect(calendar.overdueThisMonth).toBe(1);
  });
});

describe("shortOrderNo", () => {
  it("keeps the last four digits, which is what fits in a calendar cell", () => {
    expect(shortOrderNo("DA-0042")).toBe("0042");
    expect(shortOrderNo("DA-12345")).toBe("2345");
  });

  it("leaves something that is not an order number alone", () => {
    expect(shortOrderNo("DA-XX")).toBe("DA-XX");
  });
});
