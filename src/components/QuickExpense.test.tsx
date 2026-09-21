// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  The real action reaches PostgreSQL. What this test is about is what the
  POP-UP does after an expense has been saved, so the action is stubbed to
  answer the way a recorded expense does.
*/
vi.mock("@/app/(app)/expenses/actions", () => ({
  recordExpenseAction: vi.fn(async () => ({ success: "PHP 5.00 recorded." })),
}));

const { QuickExpense } = await import("./QuickExpense");

const PRESET = {
  id: "preset-1",
  label: "Fuel",
  category: "fuel_transportation" as const,
  tag: "whole_shop" as const,
  defaultAmountCentavos: 5000,
  supplierId: null,
  sortOrder: 1,
  active: true,
};

function renderTopBarButton() {
  return render(<QuickExpense presets={[PRESET]} approvalHint={null} />);
}

/** The amount box, as a value this test can compare. */
function amountBox() {
  return (screen.getByLabelText("Amount") as HTMLInputElement).value;
}

/** Open the pop-up, type an amount, save it, and wait for the answer. */
async function recordAnExpense(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Record an expense|Expense/i }));
  await user.type(screen.getByLabelText("Amount"), "5");
  await user.click(screen.getByRole("button", { name: /^Record expense$/ }));
  await screen.findByText("PHP 5.00 recorded.");
}

afterEach(cleanup);

describe("the expense pop-up after one is recorded", () => {
  it("opens blank the next time, not on the last expense's answer", async () => {
    const user = userEvent.setup();
    renderTopBarButton();

    await recordAnExpense(user);
    await user.click(screen.getByRole("button", { name: /^Done$/ }));
    await user.click(screen.getByRole("button", { name: /Record an expense|Expense/i }));

    // The answer from last time is gone, and the form is back with an empty box.
    expect(screen.queryByText("PHP 5.00 recorded.")).toBeNull();
    expect(amountBox()).toBe("");
  });

  it("goes back to an empty form when 'Add another' is tapped", async () => {
    const user = userEvent.setup();
    renderTopBarButton();

    await recordAnExpense(user);
    await user.click(screen.getByRole("button", { name: /^Add another$/ }));

    expect(screen.queryByText("PHP 5.00 recorded.")).toBeNull();
    expect(amountBox()).toBe("");
  });

  it("forgets the quick pick that filled the last one", async () => {
    const user = userEvent.setup();
    renderTopBarButton();

    await user.click(screen.getByRole("button", { name: /Record an expense|Expense/i }));
    await user.click(screen.getByRole("button", { name: /Fuel/ }));
    expect(amountBox()).toBe("50.00");

    await user.click(screen.getByRole("button", { name: /^Record expense$/ }));
    await screen.findByText("PHP 5.00 recorded.");
    await user.click(screen.getByRole("button", { name: /^Add another$/ }));

    expect(
      screen.getByRole("button", { name: /Fuel/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(amountBox()).toBe("");
  });
});
