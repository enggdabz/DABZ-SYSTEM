// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FindableProject } from "@/lib/project-find";

/*
  The real actions reach PostgreSQL. This test is about what the SCREEN does:
  what it offers, what it previews, what it sends, and what it says once the
  money is taken - so both actions are stubbed. What the actions decide is
  tested in projects/actions.test.ts.
*/
const createProjectSaleAction = vi.fn<
  (previous: unknown, formData: FormData) => Promise<unknown>
>();
const recordProjectBalanceAction = vi.fn<
  (previous: unknown, formData: FormData) => Promise<unknown>
>();

const createdResult = {
  created: {
    projectId: "proj-1",
    projectNumber: "J-260930-001",
    saleId: "sale-1",
    saleNumber: "S-260930-004",
    changeCentavos: 0,
    balanceCentavos: 150000,
    policyWarning: null,
  },
};

vi.mock("../projects/actions", () => ({
  createProjectSaleAction: (previous: unknown, formData: FormData) =>
    createProjectSaleAction(previous, formData),
  recordProjectBalanceAction: (previous: unknown, formData: FormData) =>
    recordProjectBalanceAction(previous, formData),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { ProjectSaleForm } = await import("./ProjectSaleForm");
const { CounterMode } = await import("./CounterMode");

beforeEach(() => {
  createProjectSaleAction.mockReset();
  createProjectSaleAction.mockResolvedValue(createdResult);
  recordProjectBalanceAction.mockReset();
});
afterEach(cleanup);

const falcons: FindableProject = {
  id: "proj-9",
  number: "J-260930-009",
  customerName: "Team Falcons",
  contact: "Messenger: Falcons",
  typeLabel: "Apparel",
  lines: ["Sublimation jersey, 15 pcs, S:5 M:7 L:3"],
  totalCentavos: 900000,
  paidCentavos: 300000,
  balanceCentavos: 600000,
  dueOn: "2026-10-20",
};
const tita: FindableProject = {
  id: "proj-8",
  number: "J-260929-002",
  customerName: "Tita Baby",
  contact: null,
  typeLabel: "Tarpaulin",
  lines: ["Tarpaulin 3x5 ft x2"],
  totalCentavos: 100000,
  paidCentavos: 50000,
  balanceCentavos: 50000,
  dueOn: null,
};

function renderForm(
  over: Partial<Parameters<typeof ProjectSaleForm>[0]> = {},
) {
  return render(
    <ProjectSaleForm customers={[]} downPaymentPercent={null} {...over} />,
  );
}

describe("the Counter's Project mode", () => {
  it("offers Regular sale and Project, and keeps the regular cart mounted", async () => {
    const user = userEvent.setup();
    render(
      <CounterMode
        regular={<input aria-label="cart note" defaultValue="" />}
        project={<p>project form</p>}
      />,
    );

    const cart = screen.getByLabelText("cart note");
    await user.type(cart, "half built");

    await user.click(screen.getByRole("radio", { name: "Project" }));
    expect(
      screen
        .getByRole("radio", { name: "Project" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText("project form").parentElement?.hidden).toBe(false);

    await user.click(screen.getByRole("radio", { name: "Regular sale" }));
    // Nothing typed was lost by looking at the other mode.
    expect((screen.getByLabelText("cart note") as HTMLInputElement).value).toBe(
      "half built",
    );
  });
});

describe("the job", () => {
  it("offers the four project types, in the owner's order, and no division to choose", () => {
    renderForm();
    const options = within(screen.getByLabelText("Project type"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Choose a type…",
      "Tarpaulin",
      "Apparel",
      "Printing",
      "Repair",
    ]);
    expect(screen.queryByLabelText("Division")).toBeNull();
    expect(screen.queryByLabelText(/Kind of job/)).toBeNull();
  });

  it("asks for nothing about the job until a type is chosen", () => {
    renderForm();
    expect(screen.getByText(/Choose a type to see what to fill in/)).toBeTruthy();
    expect(screen.queryByLabelText("Number of pieces")).toBeNull();
  });

  it("asks a tarpaulin for its size and quantity", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Project type"), "tarpaulin");

    expect(screen.getByLabelText("Width (ft)")).toBeTruthy();
    expect(screen.getByLabelText("Height (ft)")).toBeTruthy();
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect(screen.queryByLabelText("Number of pieces")).toBeNull();
  });

  it("asks apparel for the kind of uniform, the pieces and a size breakdown", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Project type"), "apparel");

    expect(
      within(screen.getByLabelText("Kind of uniform"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Choose…",
      "Sublimation jersey",
      "DTF shirt",
      "Jacket",
      "Long sleeve",
      "Other",
    ]);
    expect(screen.getByLabelText("Number of pieces")).toBeTruthy();
    for (const size of ["XS", "S", "M", "L", "XL", "2XL", "3XL"]) {
      expect(screen.getByLabelText(size)).toBeTruthy();
    }
  });

  it("asks printing for an item, a quantity and specs", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Project type"), "printing");
    expect(screen.getByLabelText("Item")).toBeTruthy();
    expect(screen.getByLabelText("Quantity")).toBeTruthy();
    expect(screen.getByLabelText("Specs")).toBeTruthy();
  });

  it("asks repair for a device, a brand or model and the problem", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Project type"), "repair");
    expect(screen.getByLabelText("Device type")).toBeTruthy();
    expect(screen.getByLabelText("Brand / model")).toBeTruthy();
    expect(screen.getByLabelText("Problem")).toBeTruthy();
  });

  it("starts the next type from empty boxes rather than carrying a value across", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Project type"), "printing");
    await user.type(screen.getByLabelText("Quantity"), "100");

    await user.selectOptions(screen.getByLabelText("Project type"), "tarpaulin");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("tells staff, with an icon and words, how far the sizes are from the pieces", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Project type"), "apparel");
    await user.type(screen.getByLabelText("Number of pieces"), "15");
    await user.type(screen.getByLabelText("S"), "5");
    await user.type(screen.getByLabelText("M"), "7");

    expect(screen.getByText(/Sizes add up to 12 of 15 pieces - 3 short/)).toBeTruthy();

    await user.type(screen.getByLabelText("L"), "5");
    expect(
      screen.getByText(/Sizes add up to 17 of 15 pieces - 2 too many/),
    ).toBeTruthy();

    await user.clear(screen.getByLabelText("L"));
    await user.type(screen.getByLabelText("L"), "3");
    expect(screen.getByText(/Sizes add up to 15 of 15 pieces/)).toBeTruthy();
    expect(screen.queryByText(/short|too many/)).toBeNull();
  });
});

describe("the payment", () => {
  it("works out the balance as the total minus what is paid now", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Total project price/), "2500");
    await user.type(screen.getByLabelText(/Amount paid now/), "1000");

    expect(
      screen.getByText(/Balance \(total minus paid now\)/).parentElement
        ?.textContent,
    ).toContain("₱1,500.00");
  });

  it("warns, with an icon and words, when more than the total is paid", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Total project price/), "1000");
    await user.type(screen.getByLabelText(/Amount paid now/), "1500");

    expect(screen.getByText(/More than the total/)).toBeTruthy();
  });

  it("makes a full payment the whole price, with nothing to type and nothing owing", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Total project price/), "2500");
    await user.selectOptions(screen.getByLabelText("Payment type"), "full");

    const amount = screen.getByLabelText(/Amount paid now/);
    expect((amount as HTMLInputElement).value).toBe("2500");
    expect(amount.hasAttribute("readonly")).toBe(true);
    expect(
      screen.getByText(/Balance \(total minus paid now\)/).parentElement
        ?.textContent,
    ).toContain("₱0.00");
  });

  it("offers the same ways of paying as a regular sale, and asks for cash or a reference", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(
      within(screen.getByLabelText("Paying with"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Cash", "GCash", "Maya", "Bank"]);
    expect(screen.getByLabelText("Money given")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Paying with"), "gcash");
    expect(screen.queryByLabelText("Money given")).toBeNull();
    expect(screen.getByLabelText(/Reference number/)).toBeTruthy();
  });

  it("shows the change for cash, and a shortfall with an icon and words", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Total project price/), "5000");
    await user.type(screen.getByLabelText(/Amount paid now/), "1000");

    await user.type(screen.getByLabelText("Money given"), "1500");
    expect(screen.getByText("Change: ₱500.00")).toBeTruthy();

    await user.clear(screen.getByLabelText("Money given"));
    await user.type(screen.getByLabelText("Money given"), "800");
    expect(screen.getByText(/₱200\.00 short/)).toBeTruthy();
  });

  it("asks for the due date as required with a down payment, and optional otherwise", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByText(/required with a down payment/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Payment type"), "full");
    expect(screen.queryByText(/required with a down payment/i)).toBeNull();
    expect(screen.getByText(/Optional\. If you give one/)).toBeTruthy();
  });

  it("warns when a down payment is under the owner's policy, and stays quiet without one", async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm({ downPaymentPercent: 50 });
    await user.type(screen.getByLabelText(/Total project price/), "1000");
    await user.type(screen.getByLabelText(/Amount paid now/), "100");
    expect(screen.getByText(/under the 50% down payment policy/i)).toBeTruthy();
    unmount();

    renderForm({ downPaymentPercent: null });
    await user.type(screen.getByLabelText(/Total project price/), "1000");
    await user.type(screen.getByLabelText(/Amount paid now/), "100");
    expect(screen.queryByText(/down payment policy/i)).toBeNull();
  });

  it("ends in the same button a regular sale ends in", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Complete sale & print" }),
    ).toBeTruthy();
  });
});

describe("completing a new project", () => {
  async function fillApparelJob(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(screen.getByLabelText("Project type"), "apparel");
    await user.selectOptions(
      screen.getByLabelText("Kind of uniform"),
      "sublimation_jersey",
    );
    await user.type(screen.getByLabelText("Number of pieces"), "15");
    await user.type(screen.getByLabelText("S"), "5");
    await user.type(screen.getByLabelText("M"), "7");
    await user.type(screen.getByLabelText("L"), "3");
    await user.type(screen.getByLabelText("Customer name"), "Coach Ben");
    await user.type(screen.getByLabelText(/Total project price/), "9000");
    await user.type(screen.getByLabelText(/Amount paid now/), "3000");
    await user.type(screen.getByLabelText("Money given"), "3000");
  }

  it("sends the job, the customer and the payment in one form", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillApparelJob(user);
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(createProjectSaleAction).toHaveBeenCalledTimes(1);
    const sent = createProjectSaleAction.mock.calls[0][1];
    expect(Object.fromEntries(sent.entries())).toMatchObject({
      projectType: "apparel",
      detail_uniformKind: "sublimation_jersey",
      detail_pieces: "15",
      size_S: "5",
      size_M: "7",
      size_L: "3",
      customerName: "Coach Ben",
      total: "9000",
      kind: "down",
      amount: "3000",
      paymentMethod: "cash",
      moneyGiven: "3000",
    });
  });

  it("finishes like a regular sale: the sale number, what is owed, and the receipt", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillApparelJob(user);
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(await screen.findByText("S-260930-004")).toBeTruthy();
    expect(screen.getByText("Project J-260930-001")).toBeTruthy();
    expect(screen.getByText(/₱1,500\.00 is still owed/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Print the receipt" })
        .getAttribute("href"),
    ).toBe("/sales/sale-1/receipt");
    expect(
      screen
        .getByRole("link", { name: "Open the project" })
        .getAttribute("href"),
    ).toBe("/projects/proj-1");
    // The form is gone, so nothing can be submitted twice by a second tap.
    expect(screen.queryByRole("button", { name: "Complete sale & print" })).toBeNull();
  });

  it("shows the change to give back", async () => {
    createProjectSaleAction.mockResolvedValue({
      created: { ...createdResult.created, changeCentavos: 50000 },
    });
    const user = userEvent.setup();
    renderForm();
    await fillApparelJob(user);
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(await screen.findByText("₱500.00")).toBeTruthy();
    expect(screen.getByText("Change")).toBeTruthy();
  });

  it("says fully paid, not a balance, when the whole price was taken", async () => {
    createProjectSaleAction.mockResolvedValue({
      created: { ...createdResult.created, balanceCentavos: 0 },
    });
    const user = userEvent.setup();
    renderForm();
    await fillApparelJob(user);
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(await screen.findByText(/The project is fully paid/)).toBeTruthy();
  });

  it("shows the server's refusals against the boxes that caused them", async () => {
    createProjectSaleAction.mockResolvedValue({
      detailErrors: { sizes: "The sizes add up to 12, but 15 pieces were ordered - 3 short." },
      fieldErrors: { amount: "That is more than the project total." },
    });
    const user = userEvent.setup();
    renderForm();
    await fillApparelJob(user);
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(await screen.findByText(/add up to 12, but 15 pieces/)).toBeTruthy();
    expect(screen.getByText("That is more than the project total.")).toBeTruthy();
    // Still the form, with what was typed still in it.
    expect((screen.getByLabelText("S") as HTMLInputElement).value).toBe("5");
    expect(
      (screen.getByLabelText("Customer name") as HTMLInputElement).value,
    ).toBe("Coach Ben");
  });
});

describe("Find project", () => {
  it("lists nothing until something is typed, and says how many are waiting", () => {
    renderForm({ openProjects: [falcons, tita] });
    expect(screen.getByText(/2 projects are waiting on a payment/)).toBeTruthy();
    expect(screen.queryByText("J-260930-009")).toBeNull();
  });

  it("finds a project by customer name", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons, tita] });
    await user.type(screen.getByLabelText(/Customer or project number/), "falc");

    expect(screen.getByText("J-260930-009")).toBeTruthy();
    expect(screen.queryByText("J-260929-002")).toBeNull();
    expect(screen.getByText(/Balance ₱6,000\.00/)).toBeTruthy();
  });

  it("finds a project by number, with or without the dashes", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons, tita] });
    const box = screen.getByLabelText(/Customer or project number/);

    await user.type(box, "J-260929-002");
    expect(screen.getByText(/Tita Baby/)).toBeTruthy();

    await user.clear(box);
    await user.type(box, "260929002");
    expect(screen.getByText(/Tita Baby/)).toBeTruthy();
  });

  it("says so, in words, when nothing matches", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await user.type(
      screen.getByLabelText(/Customer or project number/),
      "nobody",
    );
    expect(screen.getByText(/No project waiting on a payment matches/)).toBeTruthy();
  });

  it("says the list could not be loaded, and still lets a new project be started", () => {
    renderForm({ projectsUnavailable: true });
    expect(screen.getByText("The project list could not be loaded")).toBeTruthy();
    expect(screen.getByLabelText("Project type")).toBeTruthy();
  });

  async function pickFalcons(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/Customer or project number/), "falc");
    await user.click(screen.getByRole("button", { name: /J-260930-009/ }));
  }

  // The new-project form stays mounted (hidden) underneath, so a payment on a
  // found project is looked at through its own form.
  const followUp = () =>
    within(screen.getByRole("form", { name: "Payment on a started project" }));

  it("fills the job in read-only and asks only for the amount and how it is paid", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await pickFalcons(user);

    // The job, read-only: its lines are text, not boxes.
    expect(screen.getByText("Sublimation jersey, 15 pcs, S:5 M:7 L:3")).toBeTruthy();
    expect(screen.getAllByText("Team Falcons").length).toBeGreaterThan(0);
    expect(followUp().queryByLabelText("Project type")).toBeNull();
    expect(followUp().queryByLabelText(/Total project price/)).toBeNull();
    expect(followUp().queryByLabelText("Customer name")).toBeNull();

    // The figures, worked out from the project.
    expect(screen.getByText("Total price").nextElementSibling?.textContent).toBe(
      "₱9,000.00",
    );
    expect(screen.getByText("Paid so far").nextElementSibling?.textContent).toBe(
      "₱3,000.00",
    );
    expect(
      screen.getByText(/Balance due/).nextElementSibling?.textContent,
    ).toBe("₱6,000.00");

    // What is asked.
    expect(followUp().getByLabelText(/Amount paid now/)).toBeTruthy();
    expect(followUp().getByLabelText("Paying with")).toBeTruthy();
  });

  it("warns, with an icon and words, when the amount is more than the balance", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await pickFalcons(user);

    await user.type(followUp().getByLabelText(/Amount paid now/), "6000.01");
    expect(screen.getByText(/More than the balance/)).toBeTruthy();

    await user.clear(followUp().getByLabelText(/Amount paid now/));
    await user.type(followUp().getByLabelText(/Amount paid now/), "2000");
    expect(screen.getByText(/₱4,000\.00 would still be owed/)).toBeTruthy();
  });

  it("can fill in the whole balance, and says that clears the project", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await pickFalcons(user);

    await user.click(
      followUp().getByRole("button", { name: "Pay the whole balance" }),
    );
    expect(
      (followUp().getByLabelText(/Amount paid now/) as HTMLInputElement).value,
    ).toBe("6000.00");
    expect(screen.getByText(/marks the project fully paid/)).toBeTruthy();
  });

  it("sends the project and the amount, and finishes with the receipt and the new balance", async () => {
    recordProjectBalanceAction.mockResolvedValue({
      paid: {
        projectNumber: "J-260930-009",
        saleId: "sale-7",
        saleNumber: "S-261005-003",
        changeCentavos: 0,
        balanceCentavos: 400000,
      },
    });
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await pickFalcons(user);

    await user.type(followUp().getByLabelText(/Amount paid now/), "2000");
    await user.type(followUp().getByLabelText("Money given"), "2000");
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(recordProjectBalanceAction).toHaveBeenCalledTimes(1);
    expect(createProjectSaleAction).not.toHaveBeenCalled();
    const sent = recordProjectBalanceAction.mock.calls[0][1];
    expect(Object.fromEntries(sent.entries())).toMatchObject({
      projectId: "proj-9",
      amount: "2000",
      paymentMethod: "cash",
      moneyGiven: "2000",
    });

    expect(await screen.findByText("S-261005-003")).toBeTruthy();
    expect(screen.getByText(/₱4,000\.00 is still owed/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Print the receipt" })
        .getAttribute("href"),
    ).toBe("/sales/sale-7/receipt");
  });

  it("says fully paid when the payment clears the balance", async () => {
    recordProjectBalanceAction.mockResolvedValue({
      paid: {
        projectNumber: "J-260930-009",
        saleId: "sale-7",
        saleNumber: "S-261005-003",
        changeCentavos: 0,
        balanceCentavos: 0,
      },
    });
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await pickFalcons(user);
    await user.click(
      followUp().getByRole("button", { name: "Pay the whole balance" }),
    );
    await user.type(followUp().getByLabelText("Money given"), "6000");
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(await screen.findByText(/The project is fully paid/)).toBeTruthy();
  });

  it("shows the server's refusal against the amount", async () => {
    recordProjectBalanceAction.mockResolvedValue({
      fieldErrors: { amount: "That is more than the ₱6,000.00 balance." },
    });
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });
    await pickFalcons(user);
    await user.type(followUp().getByLabelText(/Amount paid now/), "7000");
    await user.type(followUp().getByLabelText("Money given"), "7000");
    await user.click(
      screen.getByRole("button", { name: "Complete sale & print" }),
    );

    expect(
      await screen.findByText("That is more than the ₱6,000.00 balance."),
    ).toBeTruthy();
  });

  it("goes back to a new project when asked, with what was typed for it still there", async () => {
    const user = userEvent.setup();
    renderForm({ openProjects: [falcons] });

    // Half a new project, then a look at an existing one.
    await user.type(screen.getByLabelText("Customer name"), "Coach Ben");
    await pickFalcons(user);
    expect(
      screen.getByRole("form", { name: "Payment on a started project" }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Start a new project instead" }),
    );
    expect(
      screen.queryByRole("form", { name: "Payment on a started project" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Customer name") as HTMLInputElement).value,
    ).toBe("Coach Ben");
  });
});
