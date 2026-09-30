import { describe, expect, it } from "vitest";

import {
  FIND_LIMIT,
  payableProjects,
  searchProjects,
  toFindable,
  type FindableProject,
} from "./project-find";
import type { Project, ProjectPayment } from "./projects";

function payment(amountCentavos: number, over: Partial<ProjectPayment> = {}) {
  return {
    saleId: `sale-${amountCentavos}-${Math.random()}`,
    saleNumber: "S-1",
    saleDate: "2026-09-30",
    occurredAt: "2026-09-30T02:00:00Z",
    kind: "down",
    amountCentavos,
    method: "cash",
    voided: false,
    ...over,
  } as ProjectPayment;
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

describe("what a follow-up payment shows about a project", () => {
  it("works the figures out from the payments, not from anything stored", () => {
    const found = toFindable(
      project({ payments: [payment(300000), payment(100000, { voided: true })] }),
    );
    // The voided 1,000.00 was handed back, so it is not paid.
    expect(found.totalCentavos).toBe(900000);
    expect(found.paidCentavos).toBe(300000);
    expect(found.balanceCentavos).toBe(600000);
  });

  it("words the job from its details, and falls back to the description for an older project", () => {
    const withDetails = toFindable(
      project({
        details: {
          type: "apparel",
          values: { uniformKind: "sublimation_jersey", pieces: 15 },
          sizes: { S: 5, M: 7, L: 3 },
        },
      }),
    );
    expect(withDetails.typeLabel).toBe("Apparel");
    expect(withDetails.lines).toEqual([
      "Sublimation jersey, 15 pcs, S:5 M:7 L:3",
    ]);

    const older = toFindable(project({ details: null }));
    expect(older.typeLabel).toBe("Apparel");
    expect(older.lines).toEqual(["15 jerseys"]);
  });
});

describe("which projects can take a payment", () => {
  it("leaves out one that is fully paid, one that is cancelled, and keeps one owing money", () => {
    const owing = project({ id: "owing", number: "J-1" });
    const paid = project({
      id: "paid",
      number: "J-2",
      payments: [payment(900000)],
    });
    const cancelled = project({ id: "gone", number: "J-3", status: "cancelled" });
    // Released with a balance still owed stays: a regular may take the work.
    const released = project({ id: "released", number: "J-4", status: "released" });

    expect(
      payableProjects([owing, paid, cancelled, released]).map((p) => p.id),
    ).toEqual(["released", "owing"]);
  });

  it("puts the newest project number first", () => {
    const list = payableProjects([
      project({ id: "a", number: "J-260929-001" }),
      project({ id: "b", number: "J-260930-002" }),
      project({ id: "c", number: "J-260930-001" }),
    ]);
    expect(list.map((p) => p.number)).toEqual([
      "J-260930-002",
      "J-260930-001",
      "J-260929-001",
    ]);
  });
});

describe("searching for a project", () => {
  const make = (number: string, customerName: string): FindableProject =>
    toFindable(project({ id: number, number, customerName }));
  const list = [
    make("J-260930-001", "Team Falcons"),
    make("J-260930-002", "Tita Baby"),
    make("J-261001-003", "Falcons Juniors"),
  ];

  it("finds nothing until something is typed", () => {
    expect(searchProjects(list, "")).toEqual([]);
    expect(searchProjects(list, "   ")).toEqual([]);
    // A stray dash is not a search - it would match every number.
    expect(searchProjects(list, "-")).toEqual([]);
  });

  it("matches a customer, ignoring case and partial words", () => {
    expect(searchProjects(list, "FALC").map((p) => p.number)).toEqual([
      "J-260930-001",
      "J-261001-003",
    ]);
    expect(searchProjects(list, "baby").map((p) => p.number)).toEqual([
      "J-260930-002",
    ]);
  });

  it("matches a project number as written, or without the dashes", () => {
    expect(searchProjects(list, "J-260930-002").map((p) => p.customerName)).toEqual(
      ["Tita Baby"],
    );
    expect(searchProjects(list, "260930002").map((p) => p.customerName)).toEqual([
      "Tita Baby",
    ]);
    expect(searchProjects(list, "j260930002").map((p) => p.customerName)).toEqual([
      "Tita Baby",
    ]);
  });

  it("narrows with every word typed", () => {
    expect(searchProjects(list, "falcons juniors").map((p) => p.number)).toEqual([
      "J-261001-003",
    ]);
    expect(searchProjects(list, "falcons baby")).toEqual([]);
  });

  it("shows no more than the screen has room for", () => {
    const many = Array.from({ length: FIND_LIMIT + 4 }, (_, index) =>
      make(`J-260930-${String(index + 1).padStart(3, "0")}`, "Team Falcons"),
    );
    expect(searchProjects(many, "falcons")).toHaveLength(FIND_LIMIT);
  });

  it("finds nothing for a name that is not there", () => {
    expect(searchProjects(list, "nobody")).toEqual([]);
  });
});
