import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/lib/projects";

/*
  These test what the Server Actions DECIDE - what they refuse before touching
  the database, what they derive rather than trust, and what they hand to the
  database function. The database side (the same rules again, the sale, the
  ledger) is proved against a real PostgreSQL by 19_projects_rls.test.sql, so
  here the client is a stub that records the call.
*/
const rpc = vi.fn();
const recordAudit = vi.fn(async () => undefined);
const revalidatePath = vi.fn();
const requirePermission = vi.fn(async () => ({
  id: "user-1",
  username: "juan",
}));
const getProject = vi.fn<(id: string) => Promise<Project | null>>();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) =>
    (recordAudit as unknown as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/auth/dal", () => ({
  requirePermission: (...args: unknown[]) =>
    (requirePermission as unknown as (...a: unknown[]) => unknown)(...args),
  getSettings: async () => ({ apparelDownPaymentPercent: null }),
}));
vi.mock("@/lib/data/projects", () => ({
  getProject: (id: string) => getProject(id),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}));

const { createProjectSaleAction, recordProjectBalanceAction } = await import(
  "./actions"
);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** A complete, valid apparel downpayment; each test changes what it is about. */
const apparelSale = {
  projectType: "apparel",
  detail_uniformKind: "sublimation_jersey",
  detail_pieces: "15",
  size_S: "5",
  size_M: "7",
  size_L: "3",
  customerName: "Coach Ben",
  contact: "0917 000 0000",
  total: "9000",
  kind: "down",
  amount: "3000",
  dueOn: "2026-10-20",
  paymentMethod: "cash",
  moneyGiven: "3000",
};

const created = {
  data: [
    {
      project_id: "proj-1",
      project_number: "J-260930-001",
      sale_id: "sale-1",
      sale_number: "S-260930-004",
    },
  ],
  error: null,
};

beforeEach(() => {
  rpc.mockReset();
  recordAudit.mockClear();
  revalidatePath.mockClear();
  requirePermission.mockClear();
  getProject.mockReset();
});

describe("starting a project at the counter", () => {
  it("needs the permission to add sales, asked for by the action itself", async () => {
    rpc.mockResolvedValue(created);
    await createProjectSaleAction({}, form(apparelSale));
    expect(requirePermission).toHaveBeenCalledWith("add_sales");
  });

  it("records ONE sale and the project, with the job's details, in one database call", async () => {
    rpc.mockResolvedValue(created);

    const result = await createProjectSaleAction({}, form(apparelSale));

    // One call: create_project writes the project and the sale together.
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("create_project");
    expect(args).toMatchObject({
      p_division: "apparel",
      p_income_category: "sublimation_jerseys",
      p_description: "Sublimation jersey, 15 pcs, S:5 M:7 L:3",
      p_total_centavos: 900000,
      p_kind: "down",
      p_amount_centavos: 300000,
      p_payment_method: "cash",
      p_money_given_centavos: 300000,
      p_change_centavos: 0,
      p_customer_name: "Coach Ben",
      p_due_on: "2026-10-20",
      p_details: {
        type: "apparel",
        values: { uniformKind: "sublimation_jersey", pieces: 15 },
        sizes: { S: 5, M: 7, L: 3 },
      },
    });

    // What the screen needs to print the receipt and say what is owed.
    expect(result.created).toMatchObject({
      projectId: "proj-1",
      projectNumber: "J-260930-001",
      saleId: "sale-1",
      saleNumber: "S-260930-004",
      balanceCentavos: 600000,
    });
    expect(result.error).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();
  });

  it("puts the payment on the screens that count a day's sales", async () => {
    rpc.mockResolvedValue(created);
    await createProjectSaleAction({}, form(apparelSale));

    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    for (const path of ["/pos", "/sales", "/closing", "/projects"]) {
      expect(paths).toContain(path);
    }
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("works the change out on the server from what was handed over", async () => {
    rpc.mockResolvedValue(created);
    await createProjectSaleAction(
      {},
      form({ ...apparelSale, moneyGiven: "3500" }),
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_money_given_centavos: 350000,
      p_change_centavos: 50000,
    });
  });

  it("sends a GCash payment with its reference and no cash figures", async () => {
    rpc.mockResolvedValue(created);
    await createProjectSaleAction(
      {},
      form({
        ...apparelSale,
        paymentMethod: "gcash",
        moneyGiven: "",
        referenceNumber: "0012345678",
      }),
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_payment_method: "gcash",
      p_reference_number: "0012345678",
      p_money_given_centavos: null,
      p_change_centavos: null,
    });
  });

  it("derives the division and the category from the type, never from the browser", async () => {
    rpc.mockResolvedValue(created);
    await createProjectSaleAction(
      {},
      form({
        ...apparelSale,
        // What a tampered form might send alongside a tarpaulin.
        division: "dabztech",
        incomeCategory: "laptop_repair",
        description: "something else entirely",
        projectType: "tarpaulin",
        detail_widthFeet: "3",
        detail_heightFeet: "5",
        detail_quantity: "2",
      }),
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_division: "printshoppe",
      p_income_category: "tarpaulin",
      p_description: "Tarpaulin 3x5 ft x2",
    });
  });

  it("refuses sizes that do not add up to the pieces, and writes nothing", async () => {
    const short = await createProjectSaleAction(
      {},
      form({ ...apparelSale, size_L: "1" }),
    );
    expect(short.detailErrors?.sizes).toContain("2 short");
    expect(short.created).toBeUndefined();

    const over = await createProjectSaleAction(
      {},
      form({ ...apparelSale, size_XL: "4" }),
    );
    expect(over.detailErrors?.sizes).toContain("4 too many");

    expect(rpc).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("refuses an unknown project type", async () => {
    const result = await createProjectSaleAction(
      {},
      form({ ...apparelSale, projectType: "catering" }),
    );
    expect(result.detailErrors?.type).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a payment that is nothing, or negative, or not an amount", async () => {
    for (const amount of ["0", "-500", "", "abc"]) {
      const result = await createProjectSaleAction(
        {},
        form({ ...apparelSale, amount }),
      );
      expect(result.fieldErrors?.amount).toBeTruthy();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses more than the total, and the whole price as a downpayment", async () => {
    const over = await createProjectSaleAction(
      {},
      form({ ...apparelSale, amount: "9000.01" }),
    );
    expect(over.fieldErrors?.amount).toBe("That is more than the project total.");

    const everything = await createProjectSaleAction(
      {},
      form({ ...apparelSale, amount: "9000" }),
    );
    expect(everything.fieldErrors?.amount).toContain("whole price");

    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a downpayment with no due date, since that is what puts it on the calendar", async () => {
    const result = await createProjectSaleAction(
      {},
      form({ ...apparelSale, dueOn: "" }),
    );
    expect(result.fieldErrors?.dueOn).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports the database's own refusal in words, and claims nothing was saved", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "ERROR: That is more than the balance owing." },
    });
    const result = await createProjectSaleAction({}, form(apparelSale));
    expect(result.created).toBeUndefined();
    expect(result.error).toContain("That is more than the balance owing.");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("reports every problem at once, the job's and the money's together", async () => {
    const result = await createProjectSaleAction(
      {},
      form({ ...apparelSale, size_L: "1", amount: "0", customerName: "" }),
    );
    expect(result.detailErrors?.sizes).toBeTruthy();
    expect(result.fieldErrors?.amount).toBeTruthy();
    expect(result.fieldErrors?.customerName).toBeTruthy();
  });
});

function project(over: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    number: "J-260930-001",
    division: "apparel",
    customerName: "Coach Ben",
    contact: null,
    description: "15 jerseys",
    details: null,
    totalCentavos: 900000,
    dueOn: "2026-10-20",
    incomeCategory: "sublimation_jerseys",
    status: "open",
    cancelReason: null,
    payments: [
      {
        saleId: "sale-1",
        saleNumber: "S-260930-004",
        saleDate: "2026-09-30",
        occurredAt: "2026-09-30T02:00:00Z",
        kind: "down",
        amountCentavos: 800000,
        method: "cash",
        voided: false,
      },
    ],
    steps: [],
    ...over,
  };
}

describe("a follow-up payment on a project found at the counter", () => {
  const followUp = {
    projectId: "proj-1",
    amount: "500",
    paymentMethod: "cash",
    moneyGiven: "500",
  };
  const paid = {
    data: [{ sale_id: "sale-2", sale_number: "S-261005-001", balance_centavos: 50000 }],
    error: null,
  };

  it("takes an amount up to the balance as a new payment on that project", async () => {
    getProject.mockResolvedValue(project());
    rpc.mockResolvedValue(paid);

    const result = await recordProjectBalanceAction({}, form(followUp));

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("record_project_balance");
    expect(args).toMatchObject({
      p_project_id: "proj-1",
      p_amount_centavos: 50000,
      p_payment_method: "cash",
    });
    // The balance the screen shows afterwards is the database's, not a guess.
    expect(result.paid).toMatchObject({
      saleId: "sale-2",
      saleNumber: "S-261005-001",
      projectNumber: "J-260930-001",
      balanceCentavos: 50000,
    });
  });

  it("accepts exactly the balance, which is what makes a project fully paid", async () => {
    getProject.mockResolvedValue(project());
    rpc.mockResolvedValue({
      data: [{ sale_id: "sale-2", sale_number: "S-2", balance_centavos: 0 }],
      error: null,
    });
    const result = await recordProjectBalanceAction(
      {},
      form({ ...followUp, amount: "1000", moneyGiven: "1000" }),
    );
    expect(result.paid?.balanceCentavos).toBe(0);
  });

  it("refuses an overpayment, working the balance out itself from the project's own sales", async () => {
    getProject.mockResolvedValue(project()); // 9,000 - 8,000 = 1,000 owing
    const result = await recordProjectBalanceAction(
      {},
      form({ ...followUp, amount: "1000.01", moneyGiven: "2000" }),
    );
    expect(result.fieldErrors?.amount).toContain("₱1,000.00 balance");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not count a payment that was handed back when working out what is owed", async () => {
    getProject.mockResolvedValue(
      project({
        payments: [
          {
            saleId: "sale-1",
            saleNumber: "S-1",
            saleDate: "2026-09-30",
            occurredAt: "2026-09-30T02:00:00Z",
            kind: "down",
            amountCentavos: 800000,
            method: "cash",
            voided: true,
          },
        ],
      }),
    );
    rpc.mockResolvedValue(paid);
    // With the 8,000 voided the whole 9,000 is owing again.
    const result = await recordProjectBalanceAction(
      {},
      form({ ...followUp, amount: "9000", moneyGiven: "9000" }),
    );
    expect(result.fieldErrors).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses nothing-paid, negative and unreadable amounts", async () => {
    getProject.mockResolvedValue(project());
    for (const amount of ["0", "-5", "", "abc"]) {
      const result = await recordProjectBalanceAction(
        {},
        form({ ...followUp, amount }),
      );
      expect(result.fieldErrors?.amount).toBeTruthy();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a project that is already fully paid, or was cancelled", async () => {
    getProject.mockResolvedValue(
      project({
        payments: [
          {
            saleId: "sale-1",
            saleNumber: "S-1",
            saleDate: "2026-09-30",
            occurredAt: "2026-09-30T02:00:00Z",
            kind: "full",
            amountCentavos: 900000,
            method: "cash",
            voided: false,
          },
        ],
      }),
    );
    expect((await recordProjectBalanceAction({}, form(followUp))).error).toContain(
      "fully paid",
    );

    getProject.mockResolvedValue(project({ status: "cancelled" }));
    expect((await recordProjectBalanceAction({}, form(followUp))).error).toContain(
      "cancelled",
    );

    getProject.mockResolvedValue(null);
    expect((await recordProjectBalanceAction({}, form(followUp))).error).toContain(
      "could not be found",
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses cash that does not cover the payment", async () => {
    getProject.mockResolvedValue(project());
    const result = await recordProjectBalanceAction(
      {},
      form({ ...followUp, moneyGiven: "100" }),
    );
    expect(result.fieldErrors?.moneyGiven).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});
