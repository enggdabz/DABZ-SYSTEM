// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
