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
import { recordAudit } from "@/lib/audit";
import { getSettings, requirePermission, requireUser } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { checkPaymentAmount } from "@/lib/collections";
import { getApparelOrder } from "@/lib/data/apparel";
import { getRepairTicket } from "@/lib/data/repairs";
import { DIVISION_IDS, type DivisionId } from "@/lib/divisions";
import { MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
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
    try {
      moneyGivenCentavos = parsePesos(String(formData.get("moneyGiven") ?? "0"));
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
export async function saveProductAction(
  _previous: PosState,
  formData: FormData,
): Promise<PosState> {
  const user = await requirePermission("add_sales");

  const name = String(formData.get("name") ?? "").trim();
  if (name === "") return { fieldErrors: { name: "Give the product a name." } };

  const division = String(formData.get("division") ?? "printshoppe");
  if (!(DIVISION_IDS as readonly string[]).includes(division)) {
    return { fieldErrors: { division: "Choose a division." } };
  }

  let priceCentavos: number | null = null;
  const rawPrice = String(formData.get("price") ?? "").trim();
  if (rawPrice !== "") {
    try {
      priceCentavos = parsePesos(rawPrice);
      if (priceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { price: "Enter a price like 25 or 25.00." } };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").insert({
    name,
    division,
    price_centavos: priceCentavos,
    // No price means the counter asks for it every time.
    manual_price: priceCentavos === null,
    section: "other",
    created_by: user.id,
  });

  if (error) return { error: `Could not save the product: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "products",
    summary: `Saved a new product "${name}"${
      priceCentavos === null ? " with no fixed price" : ` at ${formatPesos(priceCentavos)}`
    }`,
    after: { name, division, price_centavos: priceCentavos },
  });

  revalidatePath("/pos");
  revalidatePath("/products");

  return {};
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
