// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  The real action reaches PostgreSQL. This test is about what the SCREEN does:
  what it offers, the balance it previews, and what it says once a project has
  been saved - so the action is stubbed.
*/
const createProjectSaleAction = vi.fn(async () => ({
  created: {
    projectId: "proj-1",
    projectNumber: "J-260930-001",
    saleId: "sale-1",
    saleNumber: "S-260930-004",
    changeCentavos: 0,
    balanceCentavos: 150000,
    policyWarning: null,
  },
}));

vi.mock("../projects/actions", () => ({
  createProjectSaleAction: (...args: unknown[]) =>
    (createProjectSaleAction as unknown as (...a: unknown[]) => unknown)(
      ...args,
    ),
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

afterEach(cleanup);

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

  it("names the three divisions in the owner's words", () => {
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);
    const division = screen.getByLabelText("Division");
    const options = within(division)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual([
      "Choose a division…",
      "Apparel (Dabz Apparel)",
      "Repair (DabzTech Solutions)",
      "Printing (Dabz Printshoppe)",
    ]);
  });

  it("only offers kinds of job that belong to the chosen division", async () => {
    const user = userEvent.setup();
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);

    const kind = screen.getByLabelText(/Kind of job/);
    expect((kind as HTMLSelectElement).disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText("Division"), "printshoppe");
    expect(
      within(kind).getByRole("option", { name: "Tarpaulin" }),
    ).toBeTruthy();
    expect(
      within(kind).queryByRole("option", { name: "Laptop repair" }),
    ).toBeNull();

    await user.selectOptions(screen.getByLabelText("Division"), "dabztech");
    expect(
      within(kind).getByRole("option", { name: "Laptop repair" }),
    ).toBeTruthy();
    expect(
      within(kind).queryByRole("option", { name: "Tarpaulin" }),
    ).toBeNull();
  });

  it("works out the balance as the total minus what is paid now", async () => {
    const user = userEvent.setup();
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);

    await user.type(screen.getByLabelText(/Total project price/), "2500");
    await user.type(screen.getByLabelText(/Amount paid now/), "1000");

    expect(
      screen.getByText(/Balance \(total minus paid now\)/).parentElement
        ?.textContent,
    ).toContain("₱1,500.00");
  });

  it("warns, with an icon and words, when more than the total is paid", async () => {
    const user = userEvent.setup();
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);

    await user.type(screen.getByLabelText(/Total project price/), "1000");
    await user.type(screen.getByLabelText(/Amount paid now/), "1500");

    expect(screen.getByText(/More than the total/)).toBeTruthy();
  });

  it("makes a full payment the whole price, with nothing to type and nothing owing", async () => {
    const user = userEvent.setup();
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);

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

  it("asks for the due date as required with a down payment, and optional otherwise", async () => {
    const user = userEvent.setup();
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);

    expect(screen.getByText(/required with a down payment/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Payment type"), "full");
    expect(screen.queryByText(/required with a down payment/i)).toBeNull();
    expect(screen.getByText(/Optional\. If you give one/)).toBeTruthy();
  });

  it("warns when a down payment is under the owner's policy, and stays quiet without one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ProjectSaleForm customers={[]} downPaymentPercent={50} />,
    );
    await user.type(screen.getByLabelText(/Total project price/), "1000");
    await user.type(screen.getByLabelText(/Amount paid now/), "100");
    expect(screen.getByText(/under the 50% down payment policy/i)).toBeTruthy();
    unmount();

    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);
    await user.type(screen.getByLabelText(/Total project price/), "1000");
    await user.type(screen.getByLabelText(/Amount paid now/), "100");
    expect(screen.queryByText(/down payment policy/i)).toBeNull();
  });

  it("says what was saved and where the balance lives once the project is started", async () => {
    const user = userEvent.setup();
    render(<ProjectSaleForm customers={[]} downPaymentPercent={null} />);

    await user.type(screen.getByLabelText(/Total project price/), "2500");
    await user.type(screen.getByLabelText(/Amount paid now/), "1000");
    await user.click(
      screen.getByRole("button", { name: "Complete project sale" }),
    );

    expect(
      await screen.findByText("Project J-260930-001 started"),
    ).toBeTruthy();
    expect(screen.getByText(/stays on the project/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open the project" })
        .getAttribute("href"),
    ).toBe("/projects/proj-1");
    expect(
      screen
        .getByRole("link", { name: "Print the receipt" })
        .getAttribute("href"),
    ).toBe("/sales/sale-1/receipt");
  });
});
