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

import { recordAudit } from "@/lib/audit";
import { getSettings, requirePermission, requireUser } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { DIVISION_IDS, type DivisionId } from "@/lib/divisions";
import { formatPesos, parsePesos } from "@/lib/money";
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
  revalidatePath("/");

  return {
    completed: {
      saleId: result.sale_id,
      saleNumber: result.sale_number,
      changeCentavos: changeCentavos ?? 0,
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
