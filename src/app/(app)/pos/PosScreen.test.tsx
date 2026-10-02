// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

/*
  The real actions reach PostgreSQL. What these tests are about is what the
  SCREEN does with their answers, so each is stubbed and told how to answer.
*/
const actions = vi.hoisted(() => ({
  completeSaleAction: vi.fn(),
  saveCustomerAction: vi.fn(async () => ({})),
  addCounterProductAction: vi.fn(),
  reorderCounterProductsAction: vi.fn(),
  setCounterProductPhotoAction: vi.fn(),
  removeCounterProductPhotoAction: vi.fn(),
  deleteCounterProductAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

// The browser-only resize cannot run in jsdom; it is not what is under test.
vi.mock("@/lib/photo-resize", () => ({
  squarePhoto: vi.fn(async (file: File) => file),
}));

const { PosScreen } = await import("./PosScreen");
const { useCounterProducts } = await import("./useCounterProducts");

function product(id: string, name: string, priceCentavos: number | null) {
  return {
    id,
    name,
    division: "printshoppe" as const,
    priceCentavos,
    manualPrice: priceCentavos === null,
    unit: null,
    section: "other",
    incomeCategory: "other_print_jobs",
    tiers: [],
    imageUrl: null,
  };
}

const ID_PHOTO = product("11111111-1111-4111-8111-111111111111", "ID PHOTO PACKAGE", 5000);
const PRINT_BW = product("22222222-2222-4222-8222-222222222222", "Print (Black & White)", 300);
const XEROX = product("33333333-3333-4333-8333-333333333333", "Xerox", 300);
const PRODUCTS = [ID_PHOTO, PRINT_BW, XEROX];

function renderCounter(options: { canManage?: boolean } = {}) {
  return render(
    <PosScreen
      products={PRODUCTS}
      customers={[]}
      canDiscount={false}
      canManageProducts={options.canManage ?? true}
      discountLimitPercent={0}
      discountLimitCentavos={0}
    />,
  );
}

function quantityBox(name: string) {
  return screen.getByLabelText(`Quantity of ${name}`) as HTMLInputElement;
}

function completeButton() {
  return screen.getByRole("button", { name: /^Complete sale$/i }) as HTMLButtonElement;
}

beforeEach(() => {
  actions.completeSaleAction.mockImplementation(async () => ({
    completed: { saleId: "sale-1", saleNumber: "S-260921-009", changeCentavos: 0 },
  }));
  actions.reorderCounterProductsAction.mockImplementation(async () => ({}));
  actions.deleteCounterProductAction.mockImplementation(async () => ({ outcome: "deleted" }));
});

afterEach(() => {
  cleanup();
  push.mockClear();
  refresh.mockClear();
  vi.clearAllMocks();
});

describe("the saved products list", () => {
  it("shows one row per product, each with its own empty quantity box", () => {
    renderCounter();
    const rows = within(screen.getByRole("list", { name: "Saved products" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(3);
    for (const entry of PRODUCTS) expect(quantityBox(entry.name).value).toBe("");
  });

  it("works out each line and the grand total as quantities are typed", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.type(quantityBox("ID PHOTO PACKAGE"), "2");
    await user.type(quantityBox("Print (Black & White)"), "10");

    const idRow = quantityBox("ID PHOTO PACKAGE").closest("li")!;
    expect(within(idRow).getAllByText(/₱100\.00/).length).toBeGreaterThan(0);
    const printRow = quantityBox("Print (Black & White)").closest("li")!;
    expect(within(printRow).getAllByText(/₱30\.00/).length).toBeGreaterThan(0);

    // The grand total, beside the one Complete sale button.
    const footer = completeButton().closest("div.sticky") as HTMLElement;
    expect(within(footer).getByText("₱130.00")).toBeTruthy();
    expect(within(footer).getByText("12 items")).toBeTruthy();
  });

  it("will not hold a negative or a decimal quantity", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.type(quantityBox("Xerox"), "-2.5");
    expect(quantityBox("Xerox").value).toBe("25");
  });

  it("keeps Complete sale off until something has a quantity, and Clear empties every box", async () => {
    const user = userEvent.setup();
    renderCounter();

    expect(completeButton().disabled).toBe(true);
    await user.type(quantityBox("Xerox"), "4");
    expect(completeButton().disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Clear$/ }));
    expect(quantityBox("Xerox").value).toBe("");
    expect(completeButton().disabled).toBe(true);
    // Clearing saved nothing.
    expect(actions.completeSaleAction).not.toHaveBeenCalled();
  });

  it("moves to the next row's box when Enter is pressed", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.type(quantityBox("ID PHOTO PACKAGE"), "2{Enter}");
    expect(document.activeElement).toBe(quantityBox("Print (Black & White)"));
    await user.keyboard("10{Enter}");
    expect(document.activeElement).toBe(quantityBox("Xerox"));
  });

  it("sends every row with a quantity as ONE sale, then starts blank", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.type(quantityBox("ID PHOTO PACKAGE"), "2");
    await user.type(quantityBox("Xerox"), "10");
    await user.click(completeButton());

    expect(await screen.findByText("S-260921-009")).toBeTruthy();
    expect(actions.completeSaleAction).toHaveBeenCalledTimes(1);
    const form = actions.completeSaleAction.mock.calls[0][1] as FormData;
    const lines = JSON.parse(String(form.get("lines")));
    expect(lines).toEqual([
      expect.objectContaining({ name: "ID PHOTO PACKAGE", quantity: 2, unitPriceCentavos: 5000, productId: ID_PHOTO.id }),
      expect.objectContaining({ name: "Xerox", quantity: 10, unitPriceCentavos: 300, productId: XEROX.id }),
    ]);

    await user.click(screen.getByRole("button", { name: /Start the next sale/i }));
    await waitFor(() => expect(screen.queryByText("S-260921-009")).toBeNull());
    // And the counter is BLANK - the last customer's quantities did not survive.
    expect(quantityBox("ID PHOTO PACKAGE").value).toBe("");
    expect(quantityBox("Xerox").value).toBe("");
  });

  it("asks for the price of a product that has none before the sale can go", async () => {
    const user = userEvent.setup();
    render(
      <PosScreen
        products={[product("44444444-4444-4444-8444-444444444444", "Mug", null)]}
        customers={[]}
        canDiscount={false}
        canManageProducts={false}
        discountLimitPercent={0}
        discountLimitCentavos={0}
      />,
    );

    await user.type(quantityBox("Mug"), "2");
    expect(completeButton().disabled).toBe(true);
    expect(screen.getByText(/Type the price for Mug/)).toBeTruthy();

    await user.type(screen.getByLabelText("Price each for Mug"), "150");
    expect(completeButton().disabled).toBe(false);
  });
});

describe("what staff see", () => {
  it("has no drag handle, no bin and no photo button", () => {
    renderCounter({ canManage: false });
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    expect(screen.queryByRole("button", { name: /photo of/i })).toBeNull();
  });
});

describe("deleting a product", () => {
  it("asks first, then takes the row away at once", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.click(screen.getByRole("button", { name: "Delete Xerox" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Xerox?" });
    expect(within(dialog).getByText("This cannot be undone.")).toBeTruthy();

    // Cancel leaves it alone.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Quantity of Xerox")).toBeTruthy();
    expect(actions.deleteCounterProductAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Xerox" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete Xerox?" })).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(screen.queryByLabelText("Quantity of Xerox")).toBeNull();
    expect(actions.deleteCounterProductAction).toHaveBeenCalledWith(XEROX.id);
  });

  it("puts the row and its quantity back if the delete fails", async () => {
    actions.deleteCounterProductAction.mockImplementation(async () => ({
      error: "Only the owner or an admin can remove a product.",
    }));
    const user = userEvent.setup();
    renderCounter();

    await user.type(quantityBox("Xerox"), "7");
    await user.click(screen.getByRole("button", { name: "Delete Xerox" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete Xerox?" })).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(await screen.findByText(/Xerox was not deleted/)).toBeTruthy();
    expect(quantityBox("Xerox").value).toBe("7");
  });

  it("says so when a sold product was hidden rather than erased", async () => {
    actions.deleteCounterProductAction.mockImplementation(async () => ({ outcome: "archived" }));
    const user = userEvent.setup();
    renderCounter();

    await user.click(screen.getByRole("button", { name: "Delete Xerox" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete Xerox?" })).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(await screen.findByText(/hidden rather than erased/)).toBeTruthy();
    expect(screen.queryByLabelText("Quantity of Xerox")).toBeNull();
  });
});

describe("adding a product", () => {
  it("refuses an empty name, a zero price and a name already in the list", async () => {
    const user = userEvent.setup();
    renderCounter();

    await user.click(screen.getByRole("button", { name: "+ New product" }));
    const dialog = screen.getByRole("dialog", { name: "New product" });

    await user.click(within(dialog).getByRole("button", { name: "Save product" }));
    expect(within(dialog).getByText("Give the product a name.")).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/Product name/), "xerox");
    await user.type(within(dialog).getByLabelText(/Price each/), "0");
    await user.click(within(dialog).getByRole("button", { name: "Save product" }));
    expect(within(dialog).getByText(/"xerox" is already in the list/)).toBeTruthy();
    expect(within(dialog).getByText("Enter a price greater than zero.")).toBeTruthy();

    expect(actions.addCounterProductAction).not.toHaveBeenCalled();
  });

  it("puts the new product at the bottom without clearing typed quantities", async () => {
    const lamination = product("55555555-5555-4555-8555-555555555555", "Lamination", 2500);
    actions.addCounterProductAction.mockImplementation(async () => ({ product: lamination }));
    const user = userEvent.setup();
    renderCounter();

    await user.type(quantityBox("ID PHOTO PACKAGE"), "3");
    await user.click(screen.getByRole("button", { name: "+ New product" }));
    const dialog = screen.getByRole("dialog", { name: "New product" });
    await user.type(within(dialog).getByLabelText(/Product name/), "Lamination");
    await user.type(within(dialog).getByLabelText(/Price each/), "25");
    await user.click(within(dialog).getByRole("button", { name: "Save product" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const boxes = screen.getAllByLabelText(/^Quantity of /);
    expect(boxes.at(-1)).toBe(quantityBox("Lamination"));
    expect(quantityBox("ID PHOTO PACKAGE").value).toBe("3");
  });

  it("refuses a photo of the wrong type or over 5 MB, with a clear message", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderCounter();

    await user.click(screen.getByRole("button", { name: "+ New product" }));
    const dialog = screen.getByRole("dialog", { name: "New product" });
    const picker = dialog.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(picker, new File(["gif"], "a.gif", { type: "image/gif" }));
    expect(within(dialog).getByText(/Choose a JPG, PNG or WebP photo/)).toBeTruthy();

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await user.upload(picker, big);
    expect(within(dialog).getByText(/over 5 MB/)).toBeTruthy();
  });
});

describe("a product's photo", () => {
  it("opens the picker from the placeholder and refuses a wrong file type", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderCounter();

    const row = quantityBox("Xerox").closest("li")!;
    expect(within(row).getByRole("button", { name: "Add a photo of Xerox" })).toBeTruthy();
    const picker = row.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(picker, new File(["%PDF"], "menu.pdf", { type: "application/pdf" }));
    expect(within(row).getByText(/Choose a JPG, PNG or WebP photo/)).toBeTruthy();
    expect(actions.setCounterProductPhotoAction).not.toHaveBeenCalled();
  });

  it("keeps the old photo and every typed quantity when an upload fails", async () => {
    actions.setCounterProductPhotoAction.mockImplementation(async () => ({
      error: "The photo could not be stored: bucket offline",
    }));
    const user = userEvent.setup();
    render(
      <PosScreen
        products={[{ ...XEROX, imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/counter/x.webp" }, ID_PHOTO]}
        customers={[]}
        canDiscount={false}
        canManageProducts
        discountLimitPercent={0}
        discountLimitCentavos={0}
      />,
    );

    await user.type(quantityBox("ID PHOTO PACKAGE"), "4");
    await user.click(screen.getByRole("button", { name: "Change the photo of Xerox" }));
    const menu = screen.getByRole("dialog", { name: "Photo of Xerox" });
    expect(within(menu).getByRole("button", { name: "Remove photo" })).toBeTruthy();
    const picker = menu.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(picker, new File(["jpg"], "new.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText(/The old photo was kept/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change the photo of Xerox" })).toBeTruthy();
    expect(quantityBox("ID PHOTO PACKAGE").value).toBe("4");
  });
});

describe("putting the products in order", () => {
  it("keeps every quantity with its own product when a row moves", async () => {
    const { result } = renderHook(() => useCounterProducts(PRODUCTS));

    act(() => {
      result.current.setQuantity(ID_PHOTO.id, "2");
      result.current.setQuantity(XEROX.id, "10");
    });
    await act(() => result.current.reorder(XEROX.id, ID_PHOTO.id));

    expect(result.current.items.map((entry) => entry.name)).toEqual([
      "Xerox",
      "ID PHOTO PACKAGE",
      "Print (Black & White)",
    ]);
    expect(result.current.quantities[XEROX.id]).toBe("10");
    expect(result.current.quantities[ID_PHOTO.id]).toBe("2");
    expect(actions.reorderCounterProductsAction).toHaveBeenCalledWith([
      XEROX.id,
      ID_PHOTO.id,
      PRINT_BW.id,
    ]);
  });

  it("puts the row back and says so when the new order is not saved", async () => {
    actions.reorderCounterProductsAction.mockImplementation(async () => ({
      error: "The new order was not saved: offline.",
    }));
    const { result } = renderHook(() => useCounterProducts(PRODUCTS));

    act(() => result.current.setQuantity(XEROX.id, "5"));
    await act(() => result.current.reorder(XEROX.id, ID_PHOTO.id));

    expect(result.current.items.map((entry) => entry.id)).toEqual(PRODUCTS.map((p) => p.id));
    expect(result.current.notice?.text).toMatch(/put back/);
    expect(result.current.quantities[XEROX.id]).toBe("5");
  });
});

/**
 * The tarpaulin section only - the counter has other buttons, and a query
 * across the whole screen would find whichever comes first in the DOM.
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
    // And it can be sold on its own, with no product row chosen.
    expect(completeButton().disabled).toBe(false);
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
