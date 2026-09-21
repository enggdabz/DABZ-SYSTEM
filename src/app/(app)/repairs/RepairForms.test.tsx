// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  The real actions reach PostgreSQL. What this test is about is what the
  screen does once a ticket has been opened, so they are stubbed to answer the
  way a saved ticket does.
*/
vi.mock("./actions", () => ({
  addLineAction: vi.fn(async () => ({})),
  createTicketAction: vi.fn(async () => ({
    ticketId: "ticket-1",
    success: "Ticket R-260921-004 opened.",
  })),
  fitPartAction: vi.fn(async () => ({})),
  recordPaymentAction: vi.fn(async () => ({})),
  removeLineAction: vi.fn(async () => ({})),
  setTicketStatusAction: vi.fn(async () => ({})),
  updateTicketAction: vi.fn(async () => ({})),
  voidPaymentAction: vi.fn(async () => ({})),
}));

const { NewTicketForm } = await import("./RepairForms");

/** Take one unit in, and wait for the ticket to be reported open. */
async function takeAUnitIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Take a unit in" }));
  await user.type(screen.getByLabelText("Who is leaving it"), "Marcelo Uy");
  await user.type(screen.getByLabelText(/What is wrong/i), "will not turn on");
  await user.click(screen.getByRole("button", { name: /^Open the ticket$/ }));
  await screen.findByText("Ticket R-260921-004 opened.");
}

afterEach(cleanup);

describe("taking a unit in", () => {
  it("offers a way straight into the next one", async () => {
    const user = userEvent.setup();
    render(<NewTicketForm customers={[]} today="2026-09-21" />);

    await takeAUnitIn(user);

    // Two units on the counter is an ordinary afternoon. Without this the
    // page had to be reloaded before the second one could be started.
    await user.click(screen.getByRole("button", { name: "Take another unit in" }));

    expect(screen.getByLabelText("Who is leaving it")).toBeTruthy();
    expect(screen.queryByText("Ticket R-260921-004 opened.")).toBeNull();
  });
});
