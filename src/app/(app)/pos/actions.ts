"use server";

/**
 * The counter (spec 6, 7).
 *
 * The figures are worked out by src/lib/pos.ts, which is tested on its own.
 * These actions check the permission, re-derive the totals on the server -
 * never trusting what the browser sends - and hand the writing to a database
 * function so the sale, its lines and its takings move together.
 */
import { revalidatePath } from "next/cache";

import { orderTotals, splitPaymentByCategory } from "@/lib/apparel";
import { diffFields, recordAudit } from "@/lib/audit";
import {
  getSettings,
  requireOwnerOrAdmin,
  requirePermission,
  requireUser,
  type SignedInUser,
} from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { checkPaymentAmount } from "@/lib/collections";
import { checkCategoryName, checkNewProduct, checkProductEdit } from "@/lib/counter-list";
import { getApparelOrder } from "@/lib/data/apparel";
import type { ProductCategory } from "@/lib/data/pos";
import {
  removePhotoFile,
  removeProduct,
  uploadProductPhoto,
} from "@/lib/data/product-photos";
import { getRepairTicket } from "@/lib/data/repairs";
import { DIVISION_IDS, type DivisionId } from "@/lib/divisions";
import { MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { productImageUrl } from "@/lib/online/storage";
import { isColumnMissingFromApi, isFunctionMissingFromApi } from "@/lib/postgrest";
import { splitTicketPayment } from "@/lib/repairs";
import {
  computeCashPayment,
  computeSale,
  totalsByDivision,
  type SaleDiscount,
  type SaleLineInput,
} from "@/lib/pos";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { discountNeedsApproval } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PosState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the sale went through, so the screen can open the receipt. */
  completed?: { saleId: string; saleNumber: string; changeCentavos: number };
}

/** What the browser sends for each line. Re-checked here, never trusted. */
interface IncomingLine {
  name: string;
  quantity: number;
  unitPriceCentavos: number;
  division: string;
  productId?: string | null;
  incomeCategory?: string;
}

export async function completeSaleAction(
  _previous: PosState,
  formData: FormData,
): Promise<PosState> {
  const user = await requirePermission("add_sales");
  const settings = await getSettings();

  let incoming: IncomingLine[];
  try {
    incoming = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Could not read the sale. Please add the items again." };
  }

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { error: "Add at least one item before completing the sale." };
  }

  // Validate every line rather than trusting the browser: a sale is money.
  const lines: SaleLineInput[] = [];
  for (const line of incoming) {
    const quantity = Number(line.quantity);
    const unitPriceCentavos = Number(line.unitPriceCentavos);
    const name = String(line.name ?? "").trim();

    if (name === "") return { error: "One of the items has no name." };
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: `Quantity for "${name}" must be a whole number of 1 or more.` };
    }
    if (!Number.isInteger(unitPriceCentavos) || unitPriceCentavos < 0) {
      return { error: `The price for "${name}" is not a valid amount.` };
    }
    if (!(DIVISION_IDS as readonly string[]).includes(String(line.division))) {
      return { error: `"${name}" is not tagged to a division.` };
    }

    lines.push({
      name,
      quantity,
      unitPriceCentavos,
      division: line.division as DivisionId,
      productId: line.productId ?? null,
    });
  }

  // The discount.
  const discountKind = String(formData.get("discountKind") ?? "none");
  let discount: SaleDiscount = { kind: "none" };

  if (discountKind === "amount") {
    try {
      const centavos = parsePesos(String(formData.get("discountValue") ?? "0"));
      if (centavos > 0) discount = { kind: "amount", centavos };
    } catch {
      return { fieldErrors: { discount: "Enter a discount like 50 or 50.00." } };
    }
  } else if (discountKind === "percent") {
    const percent = Number(formData.get("discountValue") ?? 0);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { fieldErrors: { discount: "Enter a percentage from 0 to 100." } };
    }
    if (percent > 0) discount = { kind: "percent", percent };
  }

  const totals = computeSale({ lines, discount });

  // Spec 6: giving a discount needs the permission, and staying inside the
  // limit in Settings. Owner and Admin are not limited.
  if (totals.discountCentavos > 0 && !isOwnerOrAdmin(user)) {
    if (!user.permissions.includes("give_discounts")) {
      return {
        error:
          "You do not have permission to give discounts. Ask the owner, or remove the discount.",
      };
    }

    const needsApproval =
      discount.kind === "percent"
        ? discountNeedsApproval(
            { kind: "percent", percent: discount.percent, subtotal: totals.subtotalCentavos },
            settings,
          )
        : discountNeedsApproval(
            { kind: "amount", centavos: totals.discountCentavos },
            settings,
          );

    if (needsApproval) {
      return {
        error: `That discount is over your limit of ${settings.staffDiscountLimitPercent}% or ${formatPesos(
          settings.staffDiscountLimitCentavos,
        )}. Ask the owner to ring it up.`,
      };
    }
  }

  // The payment.
  const paymentMethod = String(formData.get("paymentMethod") ?? "cash");
  if (!["cash", "gcash", "maya", "bank"].includes(paymentMethod)) {
    return { error: "Choose how the customer is paying." };
  }

  let moneyGivenCentavos: number | null = null;
  let changeCentavos: number | null = null;
  let referenceNumber: string | null = null;

  if (paymentMethod === "cash") {
    /*
      A blank "Money given" means the customer handed over the exact amount
      (the owner's request, 2 Oct 2026: type the quantities, press Complete
      sale). Recorded as exactly the total with no change, which is what
      happened - it is not a guess at a figure, and the drawer is counted from
      the sale totals either way.
    */
    const rawGiven = String(formData.get("moneyGiven") ?? "").trim();
    try {
      moneyGivenCentavos = rawGiven === "" ? totals.totalCentavos : parsePesos(rawGiven);
    } catch {
      return { fieldErrors: { moneyGiven: "Enter the money given, like 500." } };
    }

    try {
      changeCentavos = computeCashPayment(
        totals.totalCentavos,
        moneyGivenCentavos,
      ).changeCentavos;
    } catch {
      return {
        fieldErrors: {
          moneyGiven: `That is less than the ${formatPesos(totals.totalCentavos)} total.`,
        },
      };
    }
  } else {
    referenceNumber = String(formData.get("referenceNumber") ?? "").trim() || null;
  }

  // The customer, if one was chosen. A walk-in has none (spec 5).
  const customerId = String(formData.get("customerId") ?? "").trim() || null;

  /*
    Split the sale between the divisions here, in tested code, rather than in
    SQL. `totalsByDivision` shares the discount out in proportion and makes the
    parts add back up to the total exactly - otherwise an odd discount would
    leave a one-centavo hole in the daily figures.
  */
  const byDivision = totalsByDivision(totals);

  // Each division's takings are grouped by what they were for, so the ledger
  // shows "photocopy" and "tarpaulin" rather than one lump.
  const categoryByLine = new Map<string, string>();
  for (const line of incoming) {
    categoryByLine.set(
      `${line.division}:${line.name}`,
      String(line.incomeCategory ?? "other_print_jobs"),
    );
  }

  const ledger = (Object.keys(byDivision) as DivisionId[])
    .filter((division) => byDivision[division] > 0)
    .map((division) => {
      const firstLine = lines.find((line) => line.division === division);
      return {
        division,
        category:
          categoryByLine.get(`${division}:${firstLine?.name ?? ""}`) ??
          "other_print_jobs",
        amount_centavos: byDivision[division],
      };
    });

  const supabase = await createSupabaseServerClient();
  const saleDate = manilaToday();

  const { data, error } = await supabase.rpc("complete_sale", {
    p_sale_date: civilDateToISO(saleDate),
    p_customer_id: customerId,
    p_subtotal_centavos: totals.subtotalCentavos,
    p_discount_centavos: totals.discountCentavos,
    p_discount_kind: discount.kind,
    p_discount_percent: discount.kind === "percent" ? discount.percent : null,
    p_total_centavos: totals.totalCentavos,
    p_payment_method: paymentMethod,
    p_reference_number: referenceNumber,
    p_money_given_centavos: moneyGivenCentavos,
    p_change_centavos: changeCentavos,
    p_lines: lines.map((line, index) => ({
      name: line.name,
      product_id: line.productId,
      division: line.division,
      quantity: line.quantity,
      unit_price_centavos: line.unitPriceCentavos,
      line_total_centavos: totals.lines[index].lineTotalCentavos,
      income_category: incoming[index]?.incomeCategory ?? "other_print_jobs",
    })),
    p_ledger: ledger,
  });

  if (error) {
    return { error: `Could not complete the sale: ${error.message}` };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.sale_id) {
    return { error: "The sale did not save. Nothing has been recorded." };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "sales",
    entityId: result.sale_id,
    summary: `Sale ${result.sale_number} for ${formatPesos(totals.totalCentavos)} (${paymentMethod})`,
    after: {
      total_centavos: totals.totalCentavos,
      discount_centavos: totals.discountCentavos,
      payment_method: paymentMethod,
      items: lines.length,
    },
  });

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/ledger");
  revalidatePath("/overview");

  return {
    completed: {
      saleId: result.sale_id,
      saleNumber: result.sale_number,
      changeCentavos: changeCentavos ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Taking an Apparel or DabzTech payment, without leaving the counter (Phase 10)
// ---------------------------------------------------------------------------

export interface OrderPaymentState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the payment went through, so the dialog can offer the receipt. */
  taken?: {
    paymentId: string;
    receiptHref: string;
    amountCentavos: number;
    balanceCentavos: number;
    message: string;
  };
}

/**
 * Takes a payment on a job order or a repair ticket, from the counter.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not write a payment row and it does not write a ledger entry. It
 * calls `record_apparel_payment` or `record_repair_payment` - the same two
 * database functions the Apparel and DabzTech screens have always used - so
 * there is exactly one way money reaches the ledger from each division, and
 * this screen is a second door onto it rather than a second path.
 *
 * Three checks happen on the way, and all three are on the server:
 *   1. The permission. A Server Action is a public endpoint: the button being
 *      hidden proves nothing. `add_sales` alone gives neither division.
 *   2. The amount, against a balance worked out here from the order's own rows
 *      - never the balance the browser sent.
 *   3. The split across income categories, worked out here too, which the
 *      database then refuses if it does not add back up to the payment.
 */
export async function takeOrderPaymentAction(
  _previous: OrderPaymentState,
  formData: FormData,
): Promise<OrderPaymentState> {
  const jobKind = String(formData.get("jobKind") ?? "");
  if (jobKind !== "apparel_order" && jobKind !== "repair_ticket") {
    return { error: "Choose an order or a ticket to pay against." };
  }

  // The permission belongs to the DIVISION, not to the counter. This matches
  // the policies that already exist; nothing here widens them.
  const user = await requirePermission(
    jobKind === "apparel_order" ? "apparel_job_orders" : "dabztech_tickets",
  );

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (jobId === "") return { error: "Choose an order or a ticket to pay against." };

  let amountCentavos: number;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
  } catch {
    return { fieldErrors: { amount: "Enter the amount taken, like 500." } };
  }

  const kind = String(formData.get("paymentKind") ?? "");
  if (kind !== "down_payment" && kind !== "balance") {
    return { fieldErrors: { paymentKind: "Say whether this is a down payment or a balance." } };
  }

  const source = String(formData.get("source") ?? "cash_drawer");
  if (!(MONEY_SOURCES as readonly string[]).includes(source)) {
    return { fieldErrors: { source: "Choose how the customer is paying." } };
  }

  const referenceNumber =
    String(formData.get("referenceNumber") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const paidOn = civilDateToISO(manilaToday());

  const supabase = await createSupabaseServerClient();

  if (jobKind === "apparel_order") {
    const detail = await getApparelOrder(jobId);
    if (!detail) return { error: "That job order could not be found." };
    if (detail.order.status === "cancelled") {
      return { error: "That order was cancelled, so no money is owed on it." };
    }

    // The balance is recomputed from the order's own lines and roster. The
    // browser's figure is a preview and is never the thing that is checked.
    const totals = orderTotals({
      lines: detail.lines,
      roster: detail.roster,
      payments: detail.payments,
    });

    const check = checkPaymentAmount({
      amountCentavos,
      balanceCentavos: totals.balanceCentavos,
    });
    if (!check.ok) return { fieldErrors: { amount: check.error ?? "" } };

    const ledger = splitPaymentByCategory({ lines: totals.lines, amountCentavos });

    const { data, error } = await supabase.rpc("record_apparel_payment", {
      p_order_id: jobId,
      p_amount_centavos: amountCentavos,
      p_paid_on: paidOn,
      p_source: source,
      p_kind: kind,
      p_reference_number: referenceNumber,
      p_note: note,
      p_ledger: ledger.map((part) => ({
        category: part.category,
        amount_centavos: part.amountCentavos,
      })),
    });

    if (error) return { error: `The payment could not be saved: ${error.message}` };

    const paymentId = String(data);
    const stillOwed = totals.balanceCentavos - amountCentavos;

    await recordAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: "create",
      entity: "apparel_payment",
      entityId: jobId,
      summary: `Took ${formatPesos(amountCentavos)} at the counter on apparel order ${detail.order.orderNumber}`,
      after: { amount_centavos: amountCentavos, source, kind, from: "counter" },
    });

    revalidatePath("/pos");
    revalidatePath("/sales");
    revalidatePath("/apparel");
    revalidatePath(`/apparel/${jobId}`);
    revalidatePath("/ledger");
    revalidatePath("/overview");
    revalidatePath("/closing");

    return {
      taken: {
        paymentId,
        receiptHref: `/apparel/${jobId}/payment/${paymentId}/receipt`,
        amountCentavos,
        balanceCentavos: stillOwed,
        message: `${formatPesos(amountCentavos)} taken on ${detail.order.orderNumber}. ${
          stillOwed > 0 ? `${formatPesos(stillOwed)} still owed.` : "Nothing owed."
        }`,
      },
    };
  }

  const detail = await getRepairTicket(jobId);
  if (!detail) return { error: "That repair ticket could not be found." };

  const check = checkPaymentAmount({
    amountCentavos,
    balanceCentavos: detail.totals.balanceCentavos,
  });
  if (!check.ok) return { fieldErrors: { amount: check.error ?? "" } };

  const ledger = splitTicketPayment({
    lines: detail.totals.lines,
    amountCentavos,
    unitKind: detail.ticket.unitKind,
  });

  const { data, error } = await supabase.rpc("record_repair_payment", {
    p_ticket_id: jobId,
    p_amount_centavos: amountCentavos,
    p_paid_on: paidOn,
    p_source: source,
    p_reference_number: referenceNumber,
    p_note: note,
    p_ledger: ledger.map((part) => ({
      category: part.category,
      amount_centavos: part.amountCentavos,
    })),
    p_kind: kind,
  });

  if (error) return { error: `The payment could not be saved: ${error.message}` };

  const paymentId = String(data);
  const stillOwed = detail.totals.balanceCentavos - amountCentavos;

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "repair_payment",
    entityId: jobId,
    summary: `Took ${formatPesos(amountCentavos)} at the counter on repair ${detail.ticket.ticketNumber}`,
    after: { amount_centavos: amountCentavos, source, kind, from: "counter" },
  });

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/repairs");
  revalidatePath(`/repairs/${jobId}`);
  revalidatePath("/ledger");
  revalidatePath("/overview");
  revalidatePath("/closing");

  return {
    taken: {
      paymentId,
      receiptHref: `/repairs/${jobId}/payment/${paymentId}/receipt`,
      amountCentavos,
      balanceCentavos: stillOwed,
      message: `${formatPesos(amountCentavos)} taken on ${detail.ticket.ticketNumber}. ${
        stillOwed > 0 ? `${formatPesos(stillOwed)} still owed.` : "Nothing owed."
      }`,
    },
  };
}

/** Saves a product from the counter (spec 7.2). */
// ---------------------------------------------------------------------------
// The Counter's product list (the owner's request, 2 Oct 2026)
// ---------------------------------------------------------------------------

/** A product as the Counter's list shows it - sent back after an add. */
export interface CounterProductPayload {
  id: string;
  name: string;
  division: DivisionId;
  priceCentavos: number | null;
  manualPrice: boolean;
  unit: string | null;
  section: string;
  incomeCategory: string;
  tiers: { minQuantity: number; unitPriceCentavos: number }[];
  imageUrl: string | null;
  categoryId: string | null;
}

export interface AddCounterProductResult {
  error?: string;
  fieldErrors?: { name?: string; price?: string; photo?: string; category?: string };
  product?: CounterProductPayload;
  /** A category made on the way, from "+ New category" in the form. */
  createdCategory?: ProductCategory;
  /** The product was saved but its photo was not. */
  photoError?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The photo in a form, if one was attached. */
function photoFrom(formData: FormData): File | null {
  const value = formData.get("photo");
  return value instanceof File && value.size > 0 ? value : null;
}

type CategoryChoice =
  | { ok: true; given: false }
  | { ok: true; given: true; categoryId: string | null; created?: ProductCategory }
  | { ok: false; error: string };

/**
 * The category a product form chose (0027).
 *
 * `categoryId` is "" for none, an id, or "new" with the name in
 * `newCategory`. A form that sends no `categoryId` at all leaves the
 * product's category alone - that is how the Counter behaves while the
 * database is still waiting for 0027.
 *
 * Making a category is Owner/Admin (the table's insert policy says so too);
 * putting a product into one that exists is open to whoever may save the
 * product.
 */
async function categoryFromForm(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: SignedInUser,
  formData: FormData,
): Promise<CategoryChoice> {
  if (!formData.has("categoryId")) return { ok: true, given: false };
  const choice = String(formData.get("categoryId") ?? "");

  if (choice === "") return { ok: true, given: true, categoryId: null };

  if (choice === "new") {
    if (!isOwnerOrAdmin(user)) {
      return { ok: false, error: "Only the owner or an admin can make a new category." };
    }
    const created = await createCategory(supabase, user, String(formData.get("newCategory") ?? ""));
    return created.ok
      ? { ok: true, given: true, categoryId: created.category.id, created: created.category }
      : { ok: false, error: created.error };
  }

  if (!UUID.test(choice)) return { ok: false, error: "Choose a category from the list." };
  const { data } = await supabase
    .from("product_categories")
    .select("id")
    .eq("id", choice)
    .maybeSingle();
  if (!data) return { ok: false, error: "That category no longer exists. Choose another." };
  return { ok: true, given: true, categoryId: choice };
}

async function createCategory(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: SignedInUser,
  rawName: string,
): Promise<{ ok: true; category: ProductCategory } | { ok: false; error: string }> {
  const { data: existing, error: readError } = await supabase
    .from("product_categories")
    .select("name");
  if (readError) return { ok: false, error: `Could not read the categories: ${readError.message}` };

  const checked = checkCategoryName(rawName, (existing ?? []).map((row) => row.name as string));
  if (!checked.ok) return { ok: false, error: checked.error };

  const { data, error } = await supabase
    .from("product_categories")
    .insert({ name: checked.name, created_by: user.id })
    .select("id, name")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.code === "23505"
          ? `There is already a category called "${checked.name}".`
          : `Could not make the category: ${error?.message ?? "nothing came back"}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "product_categories",
    entityId: data.id,
    summary: `Made the product category "${checked.name}"`,
    after: { name: checked.name },
  });

  return { ok: true, category: { id: data.id, name: data.name } };
}

/**
 * "+ New product" on the Counter: a name, a price, and an optional photo.
 *
 * Anybody who may sell may add one (spec 7.2, and `products_insert` says the
 * same). A photo is an Owner/Admin thing, because the bucket's write policy
 * is: a staff member's form has no photo box, and a photo sent anyway is
 * refused rather than silently dropped.
 *
 * The product goes to the BOTTOM of the list - one past the highest position
 * in use - and comes back to the screen so it can appear without a reload.
 */
export async function addCounterProductAction(
  formData: FormData,
): Promise<AddCounterProductResult> {
  const user = await requirePermission("add_sales");
  const supabase = await createSupabaseServerClient();

  const photo = photoFrom(formData);
  if (photo && !isOwnerOrAdmin(user)) {
    return { fieldErrors: { photo: "Only the owner or an admin can add a photo." } };
  }

  // The duplicate check is against the products the Counter shows. A hidden
  // product with the same name is not "in the list".
  const { data: existing, error: readError } = await supabase
    .from("products")
    .select("name, sort_order")
    .eq("active", true);
  if (readError) return { error: `Could not read the product list: ${readError.message}` };

  const checked = checkNewProduct(
    { name: String(formData.get("name") ?? ""), price: String(formData.get("price") ?? "") },
    (existing ?? []).map((row) => row.name as string),
  );
  if (!checked.ok) return { fieldErrors: checked.fieldErrors };

  const category = await categoryFromForm(supabase, user, formData);
  if (!category.ok) return { fieldErrors: { category: category.error } };

  const { data: last } = await supabase
    .from("products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  // sort_order is a smallint; a list that has somehow reached the top stays there.
  const sortOrder = Math.min(Number(last?.sort_order ?? 0) + 1, 32767);

  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
      name: checked.name,
      division: "printshoppe",
      price_centavos: checked.priceCentavos,
      manual_price: false,
      section: "other",
      sort_order: sortOrder,
      created_by: user.id,
      // Only when the form picked a category - a database without 0027 has no such column.
      ...(category.given ? { category_id: category.categoryId } : {}),
    })
    .select("id, name, division, price_centavos, manual_price, unit, section, income_category")
    .single();

  if (error || !inserted) {
    return { error: `Could not save the product: ${error?.message ?? "nothing came back"}` };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "products",
    entityId: inserted.id,
    summary: `Added "${checked.name}" at ${formatPesos(checked.priceCentavos)} from the counter`,
    after: { name: checked.name, price_centavos: checked.priceCentavos, sort_order: sortOrder },
  });

  // The product is saved whatever happens to its photo: the owner's typing is
  // not thrown away because a picture would not upload.
  let imageUrl: string | null = null;
  let photoError: string | undefined;
  if (photo) {
    const stored = await attachPhoto(user, inserted.id, checked.name, photo, null);
    if (stored.error) photoError = stored.error;
    else imageUrl = stored.imageUrl ?? null;
  }

  revalidatePath("/pos");
  revalidatePath("/products");

  return {
    photoError,
    createdCategory: category.given ? category.created : undefined,
    product: {
      id: inserted.id,
      name: inserted.name,
      division: inserted.division as DivisionId,
      priceCentavos: inserted.price_centavos === null ? null : Number(inserted.price_centavos),
      manualPrice: inserted.manual_price,
      unit: inserted.unit,
      section: inserted.section,
      incomeCategory: inserted.income_category,
      tiers: [],
      imageUrl,
      categoryId: category.given ? category.categoryId : null,
    },
  };
}

export interface UpdateCounterProductResult {
  error?: string;
  fieldErrors?: { name?: string; price?: string; category?: string };
  product?: {
    id: string;
    name: string;
    priceCentavos: number | null;
    manualPrice: boolean;
    /** Undefined when the form did not touch the category. */
    categoryId?: string | null;
  };
  createdCategory?: ProductCategory;
}

/**
 * The pencil on a Counter row: rename or reprice a product.
 *
 * Owner/Admin only - `products_update` already says so, and this re-checks
 * because a Server Action is a public endpoint. Past sales are untouched:
 * every sale line keeps its own copy of the name and the price it was sold
 * at, so a new price applies from the next sale on.
 */
export async function updateCounterProductAction(
  formData: FormData,
): Promise<UpdateCounterProductResult> {
  const user = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "");
  if (!UUID.test(productId)) return { error: "That product could not be found." };

  const supabase = await createSupabaseServerClient();
  // The category is read only when the form sends one: a database without
  // 0027 has no such column, and asking for it would fail the whole edit.
  const { data: rows, error: readError } = formData.has("categoryId")
    ? await supabase
        .from("products")
        .select("id, name, price_centavos, manual_price, category_id")
        .eq("active", true)
    : await supabase
        .from("products")
        .select("id, name, price_centavos, manual_price")
        .eq("active", true);
  if (readError) return { error: `Could not read the product list: ${readError.message}` };

  const before = (rows ?? []).find((row) => row.id === productId) as
    | { id: string; name: string; price_centavos: number | null; manual_price: boolean; category_id?: string | null }
    | undefined;
  if (!before) return { error: "That product is no longer in the list." };

  const checked = checkProductEdit(
    { name: String(formData.get("name") ?? ""), price: String(formData.get("price") ?? "") },
    (rows ?? []).filter((row) => row.id !== productId).map((row) => row.name as string),
  );
  if (!checked.ok) return { fieldErrors: checked.fieldErrors };

  const category = await categoryFromForm(supabase, user, formData);
  if (!category.ok) return { fieldErrors: { category: category.error } };

  const values: Record<string, unknown> = {
    name: checked.name,
    price_centavos: checked.priceCentavos,
    // No price means the counter asks for it each time - the same pairing
    // the Products screen writes.
    manual_price: checked.priceCentavos === null,
    ...(category.given ? { category_id: category.categoryId } : {}),
  };

  const { data: updated, error } = await supabase
    .from("products")
    .update(values)
    .eq("id", productId)
    .select("id");

  if (error) return { error: `Could not save the change: ${error.message}` };
  if (!updated || updated.length === 0) {
    return { error: "Nothing was saved. Only the owner or an admin can change a product." };
  }

  const changed = diffFields(
    {
      name: before.name,
      price_centavos: before.price_centavos === null ? null : Number(before.price_centavos),
      manual_price: before.manual_price,
      ...(category.given ? { category_id: before.category_id ?? null } : {}),
    } as Record<string, unknown>,
    values,
  );

  if (changed.changedKeys.length > 0) {
    await recordAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: "update",
      entity: "products",
      entityId: productId,
      summary: changed.changedKeys.includes("price_centavos")
        ? `Changed "${checked.name}" to ${
            checked.priceCentavos === null ? "ask the price each time" : formatPesos(checked.priceCentavos)
          } from the counter`
        : changed.changedKeys.includes("name")
          ? `Renamed "${before.name}" to "${checked.name}" from the counter`
          : `Moved "${checked.name}" to ${
              category.given && category.categoryId ? "another category" : "no category"
            } from the counter`,
      before: changed.before,
      after: changed.after,
    });
  }

  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/checklist");

  return {
    product: {
      id: productId,
      name: checked.name,
      priceCentavos: checked.priceCentavos,
      manualPrice: checked.priceCentavos === null,
      categoryId: category.given ? category.categoryId : undefined,
    },
    createdCategory: category.given ? category.created : undefined,
  };
}

// ---------------------------------------------------------------------------
// Product categories (0027)
// ---------------------------------------------------------------------------

/**
 * Makes a category, or renames one (with `id`). Owner/Admin - the table's
 * policies refuse anybody else, and this re-checks first.
 */
export async function saveProductCategoryAction(
  formData: FormData,
): Promise<{ error?: string; category?: ProductCategory }> {
  const user = await requireOwnerOrAdmin();
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");

  if (id === "") {
    const created = await createCategory(supabase, user, name);
    if (!created.ok) return { error: created.error };
    revalidatePath("/pos");
    return { category: created.category };
  }

  if (!UUID.test(id)) return { error: "That category could not be found." };

  const { data: all, error: readError } = await supabase
    .from("product_categories")
    .select("id, name");
  if (readError) return { error: `Could not read the categories: ${readError.message}` };

  const before = (all ?? []).find((row) => row.id === id);
  if (!before) return { error: "That category no longer exists." };

  const checked = checkCategoryName(
    name,
    (all ?? []).filter((row) => row.id !== id).map((row) => row.name as string),
  );
  if (!checked.ok) return { error: checked.error };

  const { data: updated, error } = await supabase
    .from("product_categories")
    .update({ name: checked.name })
    .eq("id", id)
    .select("id");

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `There is already a category called "${checked.name}".`
          : `Could not rename it: ${error.message}`,
    };
  }
  if (!updated || updated.length === 0) {
    return { error: "Nothing was saved. Only the owner or an admin can rename a category." };
  }

  if (before.name !== checked.name) {
    await recordAudit({
      actorId: user.id,
      actorUsername: user.username,
      action: "update",
      entity: "product_categories",
      entityId: id,
      summary: `Renamed the product category "${before.name}" to "${checked.name}"`,
      before: { name: before.name },
      after: { name: checked.name },
    });
  }

  revalidatePath("/pos");
  return { category: { id, name: checked.name } };
}

/**
 * Deletes a category. Its products are NOT deleted - they go back to having
 * none (`on delete set null`, 0027), which the confirmation says. A category
 * is a label, not a record of money, so there is no "has history" rule here.
 */
export async function deleteProductCategoryAction(id: string): Promise<{ error?: string }> {
  const user = await requireOwnerOrAdmin();
  if (typeof id !== "string" || !UUID.test(id)) return { error: "That category could not be found." };

  const supabase = await createSupabaseServerClient();
  const { data: category } = await supabase
    .from("product_categories")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!category) return { error: "That category no longer exists." };

  const { data: members } = await supabase
    .from("products")
    .select("id, name")
    .eq("category_id", id);

  const { data: removed, error } = await supabase
    .from("product_categories")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) {
    return { error: "Nothing was deleted. Only the owner or an admin can delete a category." };
  }

  // Which products it held, so the category could be put back together from
  // the log - afterwards nothing else remembers.
  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "delete",
    entity: "product_categories",
    entityId: id,
    summary: `Deleted the product category "${category.name}"${
      members && members.length > 0
        ? `; its ${members.length} product${members.length === 1 ? "" : "s"} now have no category`
        : ""
    }`,
    before: { name: category.name, products: members ?? [] },
  });

  revalidatePath("/pos");
  return {};
}

/**
 * Saves the Counter's product order after a row is dropped.
 *
 * The whole list, in one database statement (`reorder_products`, 0026), so
 * the order is never half saved. Owner/Admin only - the function checks that
 * itself, and its update runs under the ordinary products policy.
 */
export async function reorderCounterProductsAction(
  ids: string[],
): Promise<{ error?: string }> {
  await requireOwnerOrAdmin();

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 32000) {
    return { error: "The new order could not be read." };
  }
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return { error: "The new order could not be read." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_products", { p_ids: ids });

  if (error) {
    return {
      error: isFunctionMissingFromApi(error)
        ? "The database is behind: the new order cannot be saved until migration 0026 is applied (npm run db:push)."
        : `The new order was not saved: ${error.message}`,
    };
  }

  revalidatePath("/pos");
  revalidatePath("/products");
  return {};
}

/**
 * Puts a new photo on a product, then removes the one it replaces. In that
 * order: if anything fails before the product points at the new file, the
 * old photo is still there and still shown.
 */
async function attachPhoto(
  user: SignedInUser,
  productId: string,
  productName: string,
  photo: File,
  previousPath: string | null,
): Promise<{ error?: string; imageUrl?: string }> {
  const supabase = await createSupabaseServerClient();

  const uploaded = await uploadProductPhoto(supabase, productId, photo);
  if (!uploaded.ok) return { error: uploaded.error };

  const { data: updated, error } = await supabase
    .from("products")
    .update({ image_path: uploaded.path })
    .eq("id", productId)
    .select("id");

  if (error || !updated || updated.length === 0) {
    await removePhotoFile(supabase, uploaded.path);
    return {
      error: error && isColumnMissingFromApi(error)
        ? "The database is behind: photos can be saved once migration 0026 is applied (npm run db:push)."
        : `The photo was not saved${error ? `: ${error.message}` : "."}`,
    };
  }

  await removePhotoFile(supabase, previousPath);

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "products",
    entityId: productId,
    summary: `${previousPath ? "Replaced" : "Added"} the photo of "${productName}"`,
    before: { image_path: previousPath },
    after: { image_path: uploaded.path },
  });

  return { imageUrl: productImageUrl(uploaded.path) ?? undefined };
}

/** Adds or replaces a product's photo, from its thumbnail on the Counter. */
export async function setCounterProductPhotoAction(
  formData: FormData,
): Promise<{ error?: string; imageUrl?: string }> {
  const user = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "");
  if (!UUID.test(productId)) return { error: "That product could not be found." };

  const photo = photoFrom(formData);
  if (!photo) return { error: "Choose a photo first." };

  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("name, image_path")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    return {
      error: isColumnMissingFromApi(error)
        ? "The database is behind: photos can be saved once migration 0026 is applied (npm run db:push)."
        : `Could not read the product: ${error.message}`,
    };
  }
  if (!product) return { error: "That product no longer exists." };

  const result = await attachPhoto(user, productId, product.name, photo, product.image_path);
  if (!result.error) {
    revalidatePath("/pos");
  }
  return result;
}

/** Takes a product's photo off, back to the placeholder. */
export async function removeCounterProductPhotoAction(
  productId: string,
): Promise<{ error?: string }> {
  const user = await requireOwnerOrAdmin();
  if (typeof productId !== "string" || !UUID.test(productId)) {
    return { error: "That product could not be found." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: product } = await supabase
    .from("products")
    .select("name, image_path")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return { error: "That product no longer exists." };
  if (!product.image_path) return {};

  const { data: updated, error } = await supabase
    .from("products")
    .update({ image_path: null })
    .eq("id", productId)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return { error: `The photo was not removed${error ? `: ${error.message}` : "."}` };
  }

  await removePhotoFile(supabase, product.image_path);

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "products",
    entityId: productId,
    summary: `Removed the photo of "${product.name}"`,
    before: { image_path: product.image_path },
    after: { image_path: null },
  });

  revalidatePath("/pos");
  return {};
}

/**
 * The bin on a Counter row.
 *
 * A product that has never been sold is deleted, photo and all. One that has
 * been sold cannot be (0011's delete policy) and is hidden instead, keeping
 * its photo - it can be shown again from the Products screen. Either way old
 * sales are untouched: every sale line keeps its own name and price.
 */
export async function deleteCounterProductAction(
  productId: string,
): Promise<{ error?: string; outcome?: "deleted" | "archived" }> {
  const user = await requireOwnerOrAdmin();
  if (typeof productId !== "string" || !UUID.test(productId)) {
    return { error: "That product could not be found." };
  }

  const result = await removeProduct(user, productId, "archive");
  if (!result.ok) {
    return { error: "error" in result ? result.error : "That product could not be removed." };
  }

  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/checklist");
  return { outcome: result.outcome };
}

/** Adds a customer from the pop-up at the counter (spec 5). */
export async function saveCustomerAction(
  _previous: { error?: string; customerId?: string },
  formData: FormData,
): Promise<{ error?: string; customerId?: string }> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (name === "") return { error: "Enter the customer's name." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name,
      contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      facebook_name: String(formData.get("facebookName") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: `Could not save: ${error?.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "customers",
    entityId: data.id,
    summary: `Added the customer "${name}"`,
  });

  revalidatePath("/pos");
  revalidatePath("/customers");

  return { customerId: data.id };
}
