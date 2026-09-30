import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROJECT_CATEGORIES,
  PROJECT_STEPS,
  PROJECT_STEP_LABELS,
  belowDownPaymentPolicy,
  buildMonthCalendar,
  buildWeekCalendar,
  compareProjectsByDue,
  currentStep,
  daysUntilDue,
  filterProjects,
  isDueThisWeek,
  isOpenProject,
  isOverdue,
  isWorkFinished,
  productionLabel,
  projectMoney,
  projectReceiptFigures,
  projectReceiptTitle,
  undatedProjects,
  validateNewProject,
  type NewProjectInput,
  type Project,
  type ProjectPayment,
} from "./projects";

const today = { year: 2026, month: 9, day: 30 }; // a Wednesday

function payment(
  amountCentavos: number,
  over: Partial<ProjectPayment> = {},
): ProjectPayment {
  return {
    saleId: `sale-${Math.random()}`,
    saleNumber: "S-1",
    saleDate: "2026-09-30",
    occurredAt: "2026-09-30T02:00:00Z",
    kind: "down",
    amountCentavos,
    method: "cash",
    voided: false,
    ...over,
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    number: "J-260930-001",
    division: "apparel",
    customerName: "Team Falcons",
    contact: null,
    description: "15 jerseys",
    details: null,
    totalCentavos: 900000,
    dueOn: "2026-10-12",
    incomeCategory: "sublimation_jerseys",
    status: "open",
    cancelReason: null,
    payments: [payment(300000)],
    steps: [],
    ...over,
  };
}

describe("the balance", () => {
  it("is the total minus what was paid, to the centavo", () => {
    const money = projectMoney(project());
    expect(money.paidCentavos).toBe(300000);
    expect(money.balanceCentavos).toBe(600000);
    expect(money.fullyPaid).toBe(false);
  });

  it("adds several payments exactly, with no floating point drift", () => {
    const money = projectMoney(
      project({
        totalCentavos: 10,
        payments: [payment(1), payment(2), payment(3)],
      }),
    );
    expect(money.balanceCentavos).toBe(4);
  });

  it("is fully paid when the balance payment clears it", () => {
    const money = projectMoney(
      project({
        payments: [payment(300000), payment(600000, { kind: "balance" })],
      }),
    );
    expect(money.balanceCentavos).toBe(0);
    expect(money.fullyPaid).toBe(true);
  });

  it("ignores a voided payment, so the balance comes back by itself", () => {
    const money = projectMoney(
      project({
        payments: [
          payment(300000),
          payment(600000, { kind: "balance", voided: true }),
        ],
      }),
    );
    expect(money.paidCentavos).toBe(300000);
    expect(money.balanceCentavos).toBe(600000);
    expect(money.fullyPaid).toBe(false);
  });

  it("never goes negative", () => {
    expect(
      projectMoney(project({ payments: [payment(1000000)] })).balanceCentavos,
    ).toBe(0);
  });
});

describe("the production steps", () => {
  it("are the owner's lists, in order", () => {
    expect(PROJECT_STEPS.apparel).toEqual([
      "design",
      "pattern",
      "print",
      "heat_press",
      "tabas",
      "sewing",
      "quality_check",
      "packaging",
      "ready_to_ship",
    ]);
    expect(PROJECT_STEPS.dabztech).toEqual([
      "received",
      "diagnosing",
      "repairing",
      "testing",
      "ready_for_pickup",
    ]);
    expect(PROJECT_STEPS.printshoppe).toEqual([
      "design",
      "print",
      "finishing",
      "ready_for_pickup",
    ]);
  });

  it("each have a label", () => {
    for (const steps of Object.values(PROJECT_STEPS)) {
      for (const step of steps) expect(PROJECT_STEP_LABELS[step]).toBeTruthy();
    }
  });

  it("are the same as the database's, read from the migration", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/0022_projects.sql"),
      "utf8",
    );
    const body =
      /create or replace function public\.project_steps_for[\s\S]*?\$\$;/.exec(
        sql,
      )?.[0];
    expect(body).toBeTruthy();
    for (const [division, steps] of Object.entries(PROJECT_STEPS)) {
      const block = new RegExp(
        `when '${division}' then array\\[([^\\]]*)\\]`,
      ).exec(body!)?.[1];
      const inSql = [...(block ?? "").matchAll(/'([a-z_]+)'/g)].map(
        (m) => m[1],
      );
      expect(inSql).toEqual([...steps]);
    }
  });

  it("agree with the income categories the database accepts per division", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/0022_projects.sql"),
      "utf8",
    );
    const constraint =
      /projects_category_fits_division check \(([\s\S]*?)\n  \),/.exec(
        sql,
      )?.[1] ?? "";
    for (const [division, categories] of Object.entries(PROJECT_CATEGORIES)) {
      const block = new RegExp(
        `division = '${division}' and income_category in \\(([^)]*)\\)`,
      ).exec(constraint)?.[1];
      const inSql = [...(block ?? "").matchAll(/'([a-z_]+)'/g)]
        .map((m) => m[1])
        .sort();
      expect(inSql).toEqual(categories.map((c) => c.id).sort());
    }
  });

  it("the current step is the first with no mark, and marks out of order do not skip it", () => {
    expect(currentStep(project())).toBe("design");
    expect(currentStep(project({ steps: ["design", "pattern"] }))).toBe(
      "print",
    );
    // Sewing marked with print never done: still at print.
    expect(
      currentStep(project({ steps: ["design", "pattern", "sewing"] })),
    ).toBe("print");
  });

  it("is finished only when every step is marked", () => {
    expect(isWorkFinished(project({ steps: [...PROJECT_STEPS.apparel] }))).toBe(
      true,
    );
    expect(
      isWorkFinished(project({ steps: PROJECT_STEPS.apparel.slice(0, 8) })),
    ).toBe(false);
    expect(
      currentStep(project({ steps: [...PROJECT_STEPS.apparel] })),
    ).toBeNull();
  });

  it("labels the status: a bench, finished, released or cancelled", () => {
    expect(productionLabel(project({ steps: ["design"] }))).toBe("Pattern");
    expect(
      productionLabel(project({ steps: [...PROJECT_STEPS.apparel] })),
    ).toBe("Work finished");
    expect(productionLabel(project({ status: "released" }))).toBe("Released");
    expect(productionLabel(project({ status: "cancelled" }))).toBe("Cancelled");
  });
});

describe("starting a project", () => {
  const good: NewProjectInput = {
    division: "printshoppe",
    customerName: "Tita Baby",
    description: "Tarpaulin 4x6",
    totalCentavos: 200000,
    kind: "down",
    amountCentavos: 50000,
    dueOn: "2026-10-05",
    incomeCategory: "tarpaulin",
    paymentMethod: "cash",
    moneyGivenCentavos: 100000,
  };

  it("accepts a proper down payment", () => {
    expect(validateNewProject(good)).toEqual({});
  });

  it("accepts a full payment with no due date", () => {
    expect(
      validateNewProject({
        ...good,
        kind: "full",
        amountCentavos: 200000,
        dueOn: null,
        moneyGivenCentavos: 200000,
      }),
    ).toEqual({});
  });

  it("needs a due date for a down payment, because the balance needs chasing", () => {
    expect(validateNewProject({ ...good, dueOn: null }).dueOn).toMatch(
      /due date/,
    );
    expect(validateNewProject({ ...good, dueOn: "" }).dueOn).toMatch(
      /due date/,
    );
  });

  it("refuses a full payment that is not the whole price", () => {
    expect(
      validateNewProject({ ...good, kind: "full", amountCentavos: 50000 })
        .amount,
    ).toMatch(/whole price/);
  });

  it("refuses a down payment that is the whole price", () => {
    expect(
      validateNewProject({
        ...good,
        amountCentavos: 200000,
        moneyGivenCentavos: 200000,
      }).amount,
    ).toMatch(/full payment/);
  });

  it("refuses more than the total, and nothing paid", () => {
    expect(
      validateNewProject({ ...good, amountCentavos: 200001 }).amount,
    ).toMatch(/more than/);
    expect(validateNewProject({ ...good, amountCentavos: 0 }).amount).toMatch(
      /amount paid/,
    );
    expect(
      validateNewProject({ ...good, amountCentavos: null }).amount,
    ).toMatch(/amount paid/);
  });

  it("refuses a missing total, name and description", () => {
    const errors = validateNewProject({
      ...good,
      totalCentavos: null,
      customerName: " ",
      description: "",
    });
    expect(errors.total).toBeTruthy();
    expect(errors.customerName).toBeTruthy();
    expect(errors.description).toBeTruthy();
  });

  it("refuses a category from another division", () => {
    expect(
      validateNewProject({ ...good, division: "dabztech" }).incomeCategory,
    ).toBeTruthy();
    expect(
      validateNewProject({ ...good, division: "nonsense" }).division,
    ).toBeTruthy();
  });

  it("refuses cash that does not cover the payment", () => {
    expect(
      validateNewProject({ ...good, moneyGivenCentavos: 49999 }).moneyGiven,
    ).toBeTruthy();
    // Non-cash asks for no change.
    expect(
      validateNewProject({
        ...good,
        paymentMethod: "gcash",
        moneyGivenCentavos: null,
      }),
    ).toEqual({});
  });
});

describe("open, overdue and due this week", () => {
  const unpaid = project();
  const paidOff = project({ payments: [payment(900000)] });

  it("keeps an open project on the list even when it is paid off", () => {
    expect(isOpenProject(paidOff)).toBe(true);
  });

  it("drops a released project once it is fully paid, and keeps it while it is owed", () => {
    expect(isOpenProject({ ...paidOff, status: "released" })).toBe(false);
    expect(isOpenProject({ ...unpaid, status: "released" })).toBe(true);
  });

  it("never lists a cancelled project", () => {
    expect(isOpenProject({ ...unpaid, status: "cancelled" })).toBe(false);
  });

  it("counts days to the due date, negative when it has passed", () => {
    expect(daysUntilDue({ dueOn: "2026-10-02" }, today)).toBe(2);
    expect(daysUntilDue({ dueOn: "2026-09-28" }, today)).toBe(-2);
    expect(daysUntilDue({ dueOn: null }, today)).toBeNull();
  });

  it("is overdue only after the due date, not on it", () => {
    expect(isOverdue(project({ dueOn: "2026-09-29" }), today)).toBe(true);
    expect(isOverdue(project({ dueOn: "2026-09-30" }), today)).toBe(false);
    expect(isOverdue(project({ dueOn: null }), today)).toBe(false);
    expect(
      isOverdue(project({ dueOn: "2026-09-01", status: "cancelled" }), today),
    ).toBe(false);
  });

  it("is due this week between the week's first and last day (Monday start)", () => {
    // Wed 30 Sep 2026: the week is Mon 28 Sep - Sun 4 Oct.
    expect(
      isDueThisWeek(project({ dueOn: "2026-09-28" }), today, "monday"),
    ).toBe(true);
    expect(
      isDueThisWeek(project({ dueOn: "2026-10-04" }), today, "monday"),
    ).toBe(true);
    expect(
      isDueThisWeek(project({ dueOn: "2026-10-05" }), today, "monday"),
    ).toBe(false);
    expect(
      isDueThisWeek(project({ dueOn: "2026-09-27" }), today, "monday"),
    ).toBe(false);
    // Sunday start: Sun 27 Sep - Sat 3 Oct.
    expect(
      isDueThisWeek(project({ dueOn: "2026-09-27" }), today, "sunday"),
    ).toBe(true);
    expect(
      isDueThisWeek(project({ dueOn: "2026-10-04" }), today, "sunday"),
    ).toBe(false);
  });

  it("filters by division and by status together", () => {
    const list = [
      project({ id: "a", division: "apparel", dueOn: "2026-10-01" }),
      project({
        id: "b",
        division: "dabztech",
        dueOn: "2026-09-20",
        steps: [],
      }),
      project({
        id: "c",
        division: "printshoppe",
        dueOn: "2026-10-01",
        payments: [payment(900000)],
      }),
      project({ id: "d", status: "cancelled" }),
    ];
    const ids = (
      division: "all" | "apparel" | "dabztech" | "printshoppe",
      filter: "all" | "unpaid" | "due_week" | "overdue",
    ) =>
      filterProjects(list, {
        division,
        filter,
        today,
        weekStartsOn: "monday",
      }).map((p) => p.id);

    expect(ids("all", "all")).toEqual(["a", "b", "c"]);
    expect(ids("apparel", "all")).toEqual(["a"]);
    expect(ids("all", "unpaid")).toEqual(["a", "b"]);
    expect(ids("all", "due_week")).toEqual(["a", "c"]);
    expect(ids("all", "overdue")).toEqual(["b"]);
    expect(ids("dabztech", "overdue")).toEqual(["b"]);
    expect(ids("apparel", "overdue")).toEqual([]);
  });

  it("orders by due date with undated last", () => {
    const sorted = [
      project({ id: "x", dueOn: null }),
      project({ id: "y", dueOn: "2026-10-09" }),
      project({ id: "z", dueOn: "2026-10-01" }),
    ].sort(compareProjectsByDue);
    expect(sorted.map((p) => p.id)).toEqual(["z", "y", "x"]);
  });
});

describe("the calendar", () => {
  const list = [
    project({ id: "down", dueOn: "2026-10-12" }),
    project({
      id: "full",
      dueOn: "2026-10-12",
      payments: [payment(900000, { kind: "full" })],
    }),
    project({ id: "undated", dueOn: null }),
    project({ id: "cancelled", dueOn: "2026-10-12", status: "cancelled" }),
    project({
      id: "done",
      dueOn: "2026-10-13",
      status: "released",
      payments: [payment(900000)],
    }),
  ];

  it("puts a down-payment project and a full-payment project on their due date", () => {
    const weeks = buildMonthCalendar({
      projects: list,
      period: { year: 2026, month: 10 },
      today,
      weekStartsOn: "monday",
    });
    const day = weeks.flat().find((d) => d.date === "2026-10-12");
    expect(day?.projects.map((p) => p.id).sort()).toEqual(["down", "full"]);
  });

  it("leaves off cancelled and finished projects, and never places an undated one", () => {
    const weeks = buildMonthCalendar({
      projects: list,
      period: { year: 2026, month: 10 },
      today,
      weekStartsOn: "monday",
    });
    const placed = weeks.flat().flatMap((d) => d.projects.map((p) => p.id));
    expect(placed).not.toContain("cancelled");
    expect(placed).not.toContain("done");
    expect(placed).not.toContain("undated");
    expect(undatedProjects(list).map((p) => p.id)).toEqual(["undated"]);
  });

  it("builds whole weeks that start on the shop's week start", () => {
    const weeks = buildMonthCalendar({
      projects: [],
      period: { year: 2026, month: 10 },
      today,
      weekStartsOn: "monday",
    });
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // 1 Oct 2026 is a Thursday, so the grid begins Monday 28 Sep.
    expect(weeks[0][0].date).toBe("2026-09-28");
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][3].inMonth).toBe(true);
  });

  it("marks today", () => {
    const weeks = buildMonthCalendar({
      projects: [],
      period: { year: 2026, month: 9 },
      today,
      weekStartsOn: "monday",
    });
    expect(
      weeks
        .flat()
        .filter((d) => d.isToday)
        .map((d) => d.date),
    ).toEqual(["2026-09-30"]);
  });

  it("builds a week of seven days", () => {
    const week = buildWeekCalendar({
      projects: list,
      weekStart: { year: 2026, month: 10, day: 12 },
      today,
    });
    expect(week).toHaveLength(7);
    expect(week[0].projects.map((p) => p.id).sort()).toEqual(["down", "full"]);
    expect(week[1].projects).toEqual([]);
  });
});

describe("the down payment policy", () => {
  it("says nothing when the owner has set no percentage", () => {
    expect(
      belowDownPaymentPolicy({
        totalCentavos: 100000,
        amountCentavos: 100,
        policyPercent: null,
      }),
    ).toBe(false);
  });

  it("warns when a down payment is under the percentage, and only then", () => {
    const base = { totalCentavos: 100000, policyPercent: 50 };
    expect(belowDownPaymentPolicy({ ...base, amountCentavos: 49999 })).toBe(
      true,
    );
    expect(belowDownPaymentPolicy({ ...base, amountCentavos: 50000 })).toBe(
      false,
    );
    expect(belowDownPaymentPolicy({ ...base, amountCentavos: 70000 })).toBe(
      false,
    );
  });
});

describe("the figures on a project receipt", () => {
  // Three payments on one 9,000.00 job, oldest first.
  const down = payment(300000, {
    saleId: "s1",
    saleNumber: "S-260930-001",
    occurredAt: "2026-09-30T02:00:00Z",
    kind: "down",
  });
  const second = payment(200000, {
    saleId: "s2",
    saleNumber: "S-261005-002",
    occurredAt: "2026-10-05T03:00:00Z",
    kind: "balance",
  });
  const third = payment(400000, {
    saleId: "s3",
    saleNumber: "S-261010-001",
    occurredAt: "2026-10-10T04:00:00Z",
    kind: "balance",
  });
  const job = project({ payments: [third, down, second] });

  it("gives the first receipt its own payment, the total and what was left", () => {
    expect(projectReceiptFigures(job, "s1")).toEqual({
      totalCentavos: 900000,
      paidNowCentavos: 300000,
      paidSoFarCentavos: 300000,
      balanceCentavos: 600000,
      kind: "down",
    });
  });

  it("gives a follow-up the running total, whatever order the payments were read in", () => {
    const figures = projectReceiptFigures(job, "s2");
    expect(figures?.paidNowCentavos).toBe(200000);
    expect(figures?.paidSoFarCentavos).toBe(500000);
    expect(figures?.balanceCentavos).toBe(400000);
  });

  it("reaches a zero balance on the payment that clears it", () => {
    const figures = projectReceiptFigures(job, "s3");
    expect(figures?.paidSoFarCentavos).toBe(900000);
    expect(figures?.balanceCentavos).toBe(0);
  });

  it("does not let a later payment change an earlier receipt on a reprint", () => {
    // Reprinting the first receipt after the job is fully paid.
    expect(projectReceiptFigures(job, "s1")?.balanceCentavos).toBe(600000);
  });

  it("leaves a payment that was handed back out of the later receipts, but not its own", () => {
    const voidedSecond = { ...second, voided: true };
    const withVoid = project({ payments: [down, voidedSecond, third] });

    // The third receipt no longer counts the 2,000.00 that went back.
    expect(projectReceiptFigures(withVoid, "s3")?.paidSoFarCentavos).toBe(
      700000,
    );
    // The voided payment's own receipt still says what it said.
    expect(projectReceiptFigures(withVoid, "s2")?.paidSoFarCentavos).toBe(
      500000,
    );
  });

  it("breaks a tie on the same instant by sale number", () => {
    const a = payment(100000, {
      saleId: "a",
      saleNumber: "S-261001-001",
      occurredAt: "2026-10-01T01:00:00Z",
    });
    const b = payment(100000, {
      saleId: "b",
      saleNumber: "S-261001-002",
      occurredAt: "2026-10-01T01:00:00Z",
    });
    const both = project({ payments: [b, a] });
    expect(projectReceiptFigures(both, "a")?.paidSoFarCentavos).toBe(100000);
    expect(projectReceiptFigures(both, "b")?.paidSoFarCentavos).toBe(200000);
  });

  it("is null for a sale that is not one of the project's payments", () => {
    expect(projectReceiptFigures(job, "someone-elses-sale")).toBeNull();
  });

  it("titles a down payment as one, and every other payment as a payment", () => {
    expect(projectReceiptTitle("down")).toBe("PROJECT DOWNPAYMENT");
    expect(projectReceiptTitle("balance")).toBe("PROJECT PAYMENT");
    expect(projectReceiptTitle("full")).toBe("PROJECT PAYMENT");
  });
});
