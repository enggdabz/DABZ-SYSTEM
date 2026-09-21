import { describe, expect, it } from "vitest";

import {
  PRODUCTION_LEAD_DAYS,
  buildCalendar,
  compareProjects,
  isProductionDone,
  scheduleAll,
  scheduleNote,
  scheduleProject,
  summariseProjects,
  type CalendarOrder,
} from "./apparel-calendar";
import { parsePesos } from "./money";
import { parseISODate, type CivilDate } from "./period";

function date(iso: string): CivilDate {
  const parsed = parseISODate(iso);
  if (!parsed) throw new Error(`bad test date: ${iso}`);
  return parsed;
}

function order(overrides: Partial<CalendarOrder> = {}): CalendarOrder {
  return {
    id: "order-1",
    orderNumber: "A-260918-001",
    teamName: "San Carlos Warriors",
    customerName: "Coach Rivera",
    status: "in_production",
    promisedOn: "2026-09-25",
    itemCount: 15,
    totalCentavos: parsePesos("9750"),
    balanceCentavos: parsePesos("4875"),
    ...overrides,
  };
}

describe("the target date", () => {
  it("is one day before the date the customer was promised", () => {
    const project = scheduleProject({
      order: order({ promisedOn: "2026-09-25" }),
      today: date("2026-09-20"),
    });

    expect(project.targetOn).toBe("2026-09-24");
    expect(project.scheduledOn).toBe("2026-09-24");
    expect(project.reason).toBe("on_target");
    expect(project.priority).toBe(false);
  });

  it("moves back across the start of a month", () => {
    const project = scheduleProject({
      order: order({ promisedOn: "2026-10-01" }),
      today: date("2026-09-20"),
    });

    expect(project.targetOn).toBe("2026-09-30");
  });

  it("never moves the promised date itself", () => {
    const project = scheduleProject({
      order: order({ promisedOn: "2026-09-25" }),
      today: date("2026-09-20"),
    });

    // The promise was made to somebody; only the shop's own target moves.
    expect(project.promisedOn).toBe("2026-09-25");
  });

  it("is one day, as the owner asked", () => {
    expect(PRODUCTION_LEAD_DAYS).toBe(1);
  });
});

describe("work that is not finished", () => {
  it("is carried to today and marked priority once the target has passed", () => {
    const project = scheduleProject({
      order: order({ promisedOn: "2026-09-25" }),
      // Target was the 24th; it is now the 25th.
      today: date("2026-09-25"),
    });

    expect(project.scheduledOn).toBe("2026-09-25");
    expect(project.priority).toBe(true);
    expect(project.rolledDays).toBe(1);
    expect(scheduleNote(project)).toBe("Carried over from yesterday");
  });

  it("keeps being carried, so it lands on today rather than on the day it missed", () => {
    const project = scheduleProject({
      order: order({ promisedOn: "2026-09-25" }),
      today: date("2026-09-28"),
    });

    // Rolled from the 24th four times, not left sitting on the 25th where
    // nobody can act on it.
    expect(project.scheduledOn).toBe("2026-09-28");
    expect(project.rolledDays).toBe(4);
    expect(scheduleNote(project)).toBe("Carried over 4 days");
  });

  it("is not carried on the target day itself, which still has hours in it", () => {
    const project = scheduleProject({
      order: order({ promisedOn: "2026-09-25" }),
      today: date("2026-09-24"),
    });

    expect(project.priority).toBe(false);
    expect(project.rolledDays).toBe(0);
    expect(project.scheduledOn).toBe("2026-09-24");
  });

  it("says when the customer's own date has gone past, not just the shop's", () => {
    const onTargetDay = scheduleProject({
      order: order(),
      today: date("2026-09-25"),
    });
    const afterPromised = scheduleProject({
      order: order(),
      today: date("2026-09-26"),
    });

    // The 25th is the promised day: late for the shop, not yet late for the
    // customer. The 26th is late for both.
    expect(onTargetDay.pastPromised).toBe(false);
    expect(afterPromised.pastPromised).toBe(true);
  });
});

describe("work that is finished", () => {
  it("stays on the day it was made for and is never priority", () => {
    for (const status of ["ready", "released"] as const) {
      const project = scheduleProject({
        order: order({ status, promisedOn: "2026-09-25" }),
        today: date("2026-09-30"),
      });

      expect(isProductionDone(status)).toBe(true);
      expect(project.scheduledOn).toBe("2026-09-24");
      expect(project.priority).toBe(false);
      expect(project.done).toBe(true);
    }
  });

  it("counts a quoted order as still on the bench", () => {
    expect(isProductionDone("quoted")).toBe(false);
    expect(isProductionDone("confirmed")).toBe(false);
    expect(isProductionDone("layout_approved")).toBe(false);
    expect(isProductionDone("in_production")).toBe(false);
  });
});

describe("an order with no promised date", () => {
  it("is never given one", () => {
    const project = scheduleProject({
      order: order({ promisedOn: null }),
      today: date("2026-09-20"),
    });

    expect(project.targetOn).toBeNull();
    expect(project.scheduledOn).toBeNull();
    expect(project.reason).toBe("no_promised_date");
    expect(project.priority).toBe(false);
  });

  it("is listed as unscheduled while it is still open", () => {
    const calendar = buildCalendar({
      orders: [order({ promisedOn: null })],
      period: { year: 2026, month: 9 },
      today: date("2026-09-20"),
      weekStartsOn: "monday",
    });

    expect(calendar.unscheduled).toHaveLength(1);
    expect(calendar.weeks.flat().every((day) => day.projects.length === 0)).toBe(true);
  });

  it("is left alone once it has been released", () => {
    const calendar = buildCalendar({
      orders: [order({ promisedOn: null, status: "released" })],
      period: { year: 2026, month: 9 },
      today: date("2026-09-20"),
      weekStartsOn: "monday",
    });

    // Nothing left to schedule, so it is not asking for a date.
    expect(calendar.unscheduled).toHaveLength(0);
  });
});

describe("the month grid", () => {
  const today = date("2026-09-21");

  it("runs in whole weeks from the shop's own first day of the week", () => {
    const monday = buildCalendar({
      orders: [],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });
    const sunday = buildCalendar({
      orders: [],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "sunday",
    });

    expect(monday.weeks.every((week) => week.length === 7)).toBe(true);
    // 1 September 2026 is a Tuesday, so a Monday grid opens on 31 August and
    // a Sunday one on 30 August.
    expect(monday.weeks[0][0].date).toBe("2026-08-31");
    expect(sunday.weeks[0][0].date).toBe("2026-08-30");
  });

  it("marks the days either side that only fill the grid out", () => {
    const calendar = buildCalendar({
      orders: [],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });

    const days = calendar.weeks.flat();
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
    expect(days.find((day) => day.date === "2026-08-31")?.inMonth).toBe(false);
    expect(days.find((day) => day.date === "2026-09-21")?.isToday).toBe(true);
  });

  it("puts each project on the day it is scheduled for", () => {
    const calendar = buildCalendar({
      orders: [
        order({ id: "a", orderNumber: "A-1", promisedOn: "2026-09-25" }),
        order({ id: "b", orderNumber: "A-2", promisedOn: "2026-09-30" }),
      ],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });

    const days = calendar.weeks.flat();
    expect(days.find((day) => day.date === "2026-09-24")?.projects.map((p) => p.id)).toEqual(["a"]);
    expect(days.find((day) => day.date === "2026-09-29")?.projects.map((p) => p.id)).toEqual(["b"]);
  });

  it("gathers everything carried over onto today", () => {
    const calendar = buildCalendar({
      orders: [
        order({ id: "late", orderNumber: "A-1", promisedOn: "2026-09-15" }),
        order({ id: "later", orderNumber: "A-2", promisedOn: "2026-09-10" }),
        order({ id: "fine", orderNumber: "A-3", promisedOn: "2026-09-30" }),
      ],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });

    const todayCell = calendar.weeks.flat().find((day) => day.isToday);
    // Longest carried first: that is what marking them priority is for.
    expect(todayCell?.projects.map((project) => project.id)).toEqual(["later", "late"]);
    expect(calendar.priority.map((project) => project.id)).toEqual(["later", "late"]);
  });

  it("leaves a cancelled order off altogether", () => {
    const calendar = buildCalendar({
      orders: [order({ status: "cancelled", promisedOn: "2026-09-10" })],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });

    expect(calendar.weeks.flat().every((day) => day.projects.length === 0)).toBe(true);
    expect(calendar.priority).toHaveLength(0);
    expect(calendar.unscheduled).toHaveLength(0);
  });

  it("shows every order exactly once", () => {
    const orders = [
      order({ id: "a", orderNumber: "A-1", promisedOn: "2026-09-25" }),
      order({ id: "b", orderNumber: "A-2", promisedOn: "2026-09-10" }),
      order({ id: "c", orderNumber: "A-3", promisedOn: "2026-09-18", status: "ready" }),
    ];
    const calendar = buildCalendar({
      orders,
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });

    const placed = calendar.weeks.flat().flatMap((day) => day.projects.map((p) => p.id));
    expect(placed.sort()).toEqual(["a", "b", "c"]);
  });

  it("counts the open orders targeted at this month", () => {
    const calendar = buildCalendar({
      orders: [
        order({ id: "a", promisedOn: "2026-09-25" }),
        // Promised on 1 October, so its target is 30 September - this month.
        order({ id: "b", promisedOn: "2026-10-01" }),
        order({ id: "c", promisedOn: "2026-10-02" }),
        order({ id: "d", promisedOn: "2026-09-18", status: "released" }),
      ],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });

    expect(calendar.scheduledThisMonth).toBe(2);
  });
});

describe("the order projects are read in", () => {
  it("puts priority first, then the earliest promise, then the order number", () => {
    const today = date("2026-09-21");
    const projects = [
      scheduleProject({ order: order({ id: "b", orderNumber: "A-2", promisedOn: "2026-09-30" }), today }),
      scheduleProject({ order: order({ id: "a", orderNumber: "A-1", promisedOn: "2026-09-30" }), today }),
      scheduleProject({ order: order({ id: "soon", orderNumber: "A-9", promisedOn: "2026-09-24" }), today }),
      scheduleProject({ order: order({ id: "late", orderNumber: "A-8", promisedOn: "2026-09-14" }), today }),
    ].sort(compareProjects);

    expect(projects.map((project) => project.id)).toEqual(["late", "soon", "a", "b"]);
  });
});

describe("what the Apparel screen is told about the calendar", () => {
  const today = date("2026-09-21");

  function summarise(orders: CalendarOrder[]) {
    return summariseProjects(scheduleAll({ orders, today }), today);
  }

  it("counts what is carried over and what is due off the bench today", () => {
    const summary = summarise([
      // Target 20 Sep, so carried over onto today.
      order({ id: "late", promisedOn: "2026-09-21" }),
      // Target 21 Sep - today, and not late yet.
      order({ id: "now", promisedOn: "2026-09-22" }),
      order({ id: "later", promisedOn: "2026-09-30" }),
    ]);

    expect(summary.priority).toBe(1);
    expect(summary.dueToday).toBe(1);
    expect(summary.nextOn).toBe("2026-09-29");
  });

  it("never counts a job twice: carried over is not also due today", () => {
    const summary = summarise([order({ promisedOn: "2026-09-21" })]);

    expect(summary.priority).toBe(1);
    expect(summary.dueToday).toBe(0);
  });

  it("leaves finished and cancelled work out of every count", () => {
    const summary = summarise([
      order({ id: "done", promisedOn: "2026-09-22", status: "ready" }),
      order({ id: "gone", promisedOn: "2026-09-10", status: "cancelled" }),
    ]);

    expect(summary).toEqual({
      priority: 0,
      dueToday: 0,
      nextOn: null,
      undated: 0,
    });
  });

  it("says how many orders are waiting on a promised date", () => {
    const summary = summarise([
      order({ id: "a", promisedOn: null }),
      order({ id: "b", promisedOn: null }),
      // Released, so nothing is waiting on a date for it.
      order({ id: "c", promisedOn: null, status: "released" }),
    ]);

    expect(summary.undated).toBe(2);
    expect(summary.nextOn).toBeNull();
  });

  it("gives the earliest day still to come, not the first one it finds", () => {
    const summary = summarise([
      order({ id: "far", orderNumber: "A-1", promisedOn: "2026-10-20" }),
      order({ id: "near", orderNumber: "A-2", promisedOn: "2026-09-25" }),
    ]);

    expect(summary.nextOn).toBe("2026-09-24");
  });
});

describe("scheduleAll", () => {
  it("is the one list both screens read, priority first", () => {
    const today = date("2026-09-21");
    const projects = scheduleAll({
      orders: [
        order({ id: "fine", orderNumber: "A-1", promisedOn: "2026-09-30" }),
        order({ id: "late", orderNumber: "A-2", promisedOn: "2026-09-12" }),
        order({ id: "gone", orderNumber: "A-3", promisedOn: "2026-09-12", status: "cancelled" }),
      ],
      today,
    });

    expect(projects.map((project) => project.id)).toEqual(["late", "fine"]);
  });
});
