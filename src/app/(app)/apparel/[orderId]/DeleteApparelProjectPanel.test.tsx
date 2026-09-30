// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  deleteApparelProjectWithMoneyAction: vi.fn(async () => ({})),
}));

import { DeleteApparelProjectPanel } from "./DeleteApparelProjectPanel";

afterEach(cleanup);

const props = { orderId: "order-1", orderNumber: "A-261001-001" };

describe("DeleteApparelProjectPanel", () => {
  it("asks the refund question when a payment is live, with nothing ticked", async () => {
    const user = userEvent.setup();
    render(<DeleteApparelProjectPanel {...props} paidLabel="₱1,000.00" />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    const dialog = screen.getByRole("dialog");
    const refund = within(dialog).getByRole("radio", { name: /Refund ₱1,000\.00/ }) as HTMLInputElement;
    const keep = within(dialog).getByRole("radio", { name: /Keep the money/ }) as HTMLInputElement;
    expect(refund.checked).toBe(false);
    expect(keep.checked).toBe(false);
    expect(refund.required).toBe(true);
  });

  it("does not ask when every payment was already handed back", async () => {
    const user = userEvent.setup();
    render(<DeleteApparelProjectPanel {...props} paidLabel={null} />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(within(screen.getByRole("dialog")).queryByRole("radio")).toBeNull();
  });

  it("requires a reason and says nothing is erased", async () => {
    const user = userEvent.setup();
    render(<DeleteApparelProjectPanel {...props} paidLabel="₱1,000.00" />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/why is it being deleted/i) as HTMLTextAreaElement).required,
    ).toBe(true);
    expect(within(dialog).getByText(/Nothing is erased/)).toBeTruthy();
  });

  it("closes with Keep it", async () => {
    const user = userEvent.setup();
    render(<DeleteApparelProjectPanel {...props} paidLabel="₱1,000.00" />);

    await user.click(screen.getByRole("button", { name: "Delete project" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
