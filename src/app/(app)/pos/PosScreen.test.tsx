// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

/*
  The real action reaches PostgreSQL. What this test is about is what the
  SCREEN does once a sale has been saved, so the action is stubbed to answer
  the way a completed sale does.
*/
vi.mock("./actions", () => ({
  completeSaleAction: vi.fn(async () => ({
    completed: {
      saleId: "sale-1",
      saleNumber: "S-260921-009",
      changeCentavos: 0,
    },
  })),
  saveCustomerAction: vi.fn(async () => ({})),
  saveProductAction: vi.fn(async () => ({})),
}));

const { PosScreen } = await import("./PosScreen");

const PRODUCT = {
  id: "p1",
  name: "Photocopy",
  division: "printshoppe" as const,
  priceCentavos: 200,
  manualPrice: false,
  unit: "page",
  section: "photocopy",
  incomeCategory: "photocopy",
  tiers: [],
};

function renderCounter() {
  return render(
    <PosScreen
      products={[PRODUCT]}
      customers={[]}
      canDiscount={false}
      discountLimitPercent={0}
      discountLimitCentavos={0}
    />,
  );
}

/** Tap the product button, then confirm the quantity dialog. */
async function addAProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /Photocopy/i })[0]!);
  const add = await screen.findAllByRole("button", { name: /^Add to sale$/i });
  await user.click(add[0]!);
}

afterEach(() => {
  cleanup();
  push.mockClear();
  refresh.mockClear();
});

describe("the counter after a sale is saved", () => {
  it("goes back to a blank counter when the next sale is started", async () => {
    const user = userEvent.setup();
    renderCounter();

    await addAProduct(user);
    await user.click(screen.getByRole("button", { name: /Complete sale/i }));

    // The sale is saved: the completed panel replaces the counter.
    expect(await screen.findByText("S-260921-009")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Start the next sale/i }));

    // This is the bug: the panel used to stay on screen for ever, because
    // router.refresh() does not clear the action's result.
    await waitFor(() => {
      expect(screen.queryByText("S-260921-009")).toBeNull();
    });

    // And the counter is BLANK - the last customer's line did not survive.
    expect(screen.getByRole("button", { name: /Photocopy/i })).toBeTruthy();
    expect(screen.queryByText(/Photocopy .*×/)).toBeNull();
  });
});

/**
 * The tarpaulin section only - the counter has other "Add to sale" buttons, and
 * a query across the whole screen would find whichever comes first in the DOM.
 */
function calculator() {
  const heading = screen.getByRole("heading", { name: "Tarpaulin" });
  return within(heading.closest("section")!);
}

describe("the tarpaulin calculator's custom rate", () => {
  it("prices a banner at an amount typed in by hand", async () => {
    const user = userEvent.setup();
    renderCounter();

    // The default 3 x 5 at the PHP 30 preset.
    expect(calculator().getByText("₱450.00")).toBeTruthy();

    await user.selectOptions(calculator().getByLabelText("Rate per sq ft"), "custom");
    await user.type(calculator().getByLabelText(/Amount per sq ft/), "27.50");

    // 15 sq ft x PHP 27.50.
    expect(calculator().getByText("₱412.50")).toBeTruthy();

    await user.click(calculator().getByRole("button", { name: /^Add to sale$/i }));

    // The line carries the rate that was actually agreed, because that is what
    // the customer reads off the receipt.
    expect(screen.getByText("Tarpaulin 3 × 5 ft — 15 sq ft × 27.50")).toBeTruthy();
    expect(screen.getByText("1 × ₱412.50")).toBeTruthy();
  });

  it("offers nothing to add until the amount is a real one", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.selectOptions(calculator().getByLabelText("Rate per sq ft"), "custom");

    // An empty box: no total, no button, and a warning that says which figure
    // is missing rather than blaming the measurements.
    expect(calculator().queryByRole("button", { name: /^Add to sale$/i })).toBeNull();
    expect(calculator().getByText(/Enter the amount per sq ft/)).toBeTruthy();

    await user.type(calculator().getByLabelText(/Amount per sq ft/), "0");
    expect(calculator().queryByRole("button", { name: /^Add to sale$/i })).toBeNull();
    expect(calculator().getByText(/greater than zero/)).toBeTruthy();

    // And back to a rate that is real.
    await user.clear(calculator().getByLabelText(/Amount per sq ft/));
    await user.type(calculator().getByLabelText(/Amount per sq ft/), "12");
    expect(calculator().getByText("₱180.00")).toBeTruthy();
    expect(calculator().getByRole("button", { name: /^Add to sale$/i })).toBeTruthy();
  });
});
