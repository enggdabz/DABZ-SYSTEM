"use server";

/**
 * Dabz Apparel job orders (spec 8).
 *
 * A job order is a living document - sizes change, a player drops out, the
 * promised date moves - so editing one is the ordinary case, not a correction.
 * What cannot be edited is the MONEY: payments go through
 * `record_apparel_payment`, which writes the ledger in the same transaction,
 * and are voided rather than deleted.
 */
import { revalidatePath } from "next/cache";

import {
  ORDER_STATUSES,
  formatOrderNumber,
  orderTotals,
  splitPaymentByCategory,
  APPAREL_SIZES,
  sizeExtra,
  type ApparelSize,
  type OrderStatus,
} from "@/lib/apparel";
import { recordAudit } from "@/lib/audit";
import { getSettings, requireOwnerOrAdmin, requirePermission } from "@/lib/auth/dal";
import {
  deleteRefusal,
  deleteVanished,
  historyCheckUnavailable,
} from "@/lib/deletable";
import {
  getApparelOrder,
  getApparelProducts,
  getSizePrices,
} from "@/lib/data/apparel";
import { MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { isFunctionMissingFromApi } from "@/lib/postgrest";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ApparelState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  orderId?: string;
}

function revalidateOrder(orderId?: string) {
  revalidatePath("/apparel");
  if (orderId) revalidatePath(`/apparel/${orderId}`);
  revalidatePath("/ledger");
  revalidatePath("/overview");
}

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

export async function createOrderAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const teamName = String(formData.get("teamName") ?? "").trim();
  if (!teamName) {
    return { fieldErrors: { teamName: "Whose order is this? A team or a name." } };
  }

  const customerId = String(formData.get("customerId") ?? "").trim() || null;
  // Left empty when nothing was promised on the spot - a real state, never
  // filled in with a guess.
  const promisedOn = String(formData.get("promisedOn") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();
  const today = manilaToday();
  const todayISO = civilDateToISO(today);

  // The order number counts orders within the day. Two people writing one at
  // the same instant would collide, so the unique constraint is allowed to
  // reject it and the next number is tried.
  const { count } = await supabase
    .from("apparel_orders")
    .select("id", { count: "exact", head: true })
    .eq("ordered_on", todayISO);

  let sequence = (count ?? 0) + 1;
  let orderId: string | null = null;
  let orderNumber = "";

  for (let attempt = 0; attempt < 20 && !orderId; attempt += 1) {
    orderNumber = formatOrderNumber({
      year: today.year,
      month: today.month,
      day: today.day,
      sequence,
    });

    const { data, error } = await supabase
      .from("apparel_orders")
      .insert({
        order_number: orderNumber,
        ordered_on: todayISO,
        customer_id: customerId,
        team_name: teamName,
        promised_on: promisedOn,
        note,
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (data) orderId = data.id;
    else if (error?.code === "23505") sequence += 1;
    else return { error: `The order could not be saved: ${error?.message}` };
  }

  if (!orderId) {
    return { error: "Could not find a free order number for today." };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "apparel_order",
    entityId: orderId,
    summary: `Opened apparel order ${orderNumber} for ${teamName}`,
    after: { team_name: teamName, promised_on: promisedOn },
  });

  revalidateOrder(orderId);
  return { success: `Order ${orderNumber} opened.`, orderId };
}

export async function updateOrderAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That order could not be found." };

  const teamName = String(formData.get("teamName") ?? "").trim();
  if (!teamName) {
    return { fieldErrors: { teamName: "Whose order is this? A team or a name." } };
  }

  const row = {
    team_name: teamName,
    customer_id: String(formData.get("customerId") ?? "").trim() || null,
    promised_on: String(formData.get("promisedOn") ?? "").trim() || null,
    layout_note: String(formData.get("layoutNote") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_orders")
    .update(row)
    .eq("id", orderId);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "apparel_order",
    entityId: orderId,
    summary: `Updated apparel order ${detail.order.orderNumber}`,
    before: {
      team_name: detail.order.teamName,
      promised_on: detail.order.promisedOn,
    },
    after: row,
  });

  revalidateOrder(orderId);
  return { success: "Saved." };
}

export async function setOrderStatusAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;

  if (!ORDER_STATUSES.includes(status)) {
    return { error: "That is not a step this order can be at." };
  }

  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That order could not be found." };

  // Cancelling is the one step that needs a reason, because it is the one that
  // ends an order with work already done.
  const cancelReason = String(formData.get("cancelReason") ?? "").trim();
  if (status === "cancelled" && !cancelReason) {
    return { fieldErrors: { cancelReason: "Say why it was cancelled." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_orders")
    .update({
      status,
      released_at: status === "released" ? new Date().toISOString() : null,
      cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
      cancel_reason: status === "cancelled" ? cancelReason : null,
    })
    .eq("id", orderId);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "apparel_order",
    entityId: orderId,
    summary: `Apparel order ${detail.order.orderNumber} moved to "${status}"`,
    before: { status: detail.order.status },
    after: { status, cancel_reason: cancelReason || null },
  });

  revalidateOrder(orderId);

  // Releasing with money still owed is allowed - a shop does let a regular
  // take the jerseys - but it is said out loud rather than passed over.
  if (status === "released" && detail.totals.balanceCentavos > 0) {
    return {
      success: `Released. ${formatPesos(
        detail.totals.balanceCentavos,
      )} is still owed, and stays on the list until it is paid.`,
    };
  }

  return { success: "Saved." };
}

// ---------------------------------------------------------------------------
// Lines and the roster
// ---------------------------------------------------------------------------

export async function addLineAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That order could not be found." };

  const productId = String(formData.get("productId") ?? "").trim() || null;
  const products = await getApparelProducts();
  const product = products.find((entry) => entry.id === productId);

  const name = String(formData.get("name") ?? "").trim() || product?.name || "";
  if (!name) return { fieldErrors: { name: "What is being made?" } };

  // Blank price is allowed and means nobody has priced it. The line still goes
  // on the order, and the screen warns - a made-up price would be quoted to a
  // real customer.
  const priceText = String(formData.get("unitPrice") ?? "").trim();
  let unitPriceCentavos = 0;
  if (priceText) {
    try {
      unitPriceCentavos = parsePesos(priceText);
      if (unitPriceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { unitPrice: "Leave empty, or enter a price like 650." } };
    }
  } else if (product?.basePriceCentavos != null) {
    unitPriceCentavos = product.basePriceCentavos;
  }

  const quantity = Number(String(formData.get("quantity") ?? "1"));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { fieldErrors: { quantity: "Enter a whole number, at least 1." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("apparel_order_lines").insert({
    order_id: orderId,
    name,
    apparel_product_id: productId,
    fabric: String(formData.get("fabric") ?? "").trim() || null,
    collar: String(formData.get("collar") ?? "").trim() || null,
    unit_price_centavos: unitPriceCentavos,
    quantity,
    income_category: product?.incomeCategory ?? "sublimation_jerseys",
    created_by: user.id,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  revalidateOrder(orderId);
  return { success: `${name} added.` };
}

export async function removeLineAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_order_lines")
    .delete()
    .eq("id", lineId);

  if (error) return { error: `That could not be removed: ${error.message}` };

  revalidateOrder(orderId);
  return { success: "Removed." };
}

/**
 * Adds players to a line.
 *
 * Takes the whole roster as pasted text - one player per line, "name, number,
 * size" - because a team captain sends a list, and typing fifteen names into
 * fifteen little forms is how a shop ends up keeping the list on paper instead.
 */
export async function addRosterAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  const text = String(formData.get("roster") ?? "").trim();

  if (!text) {
    return { fieldErrors: { roster: "Paste the list, one player per line." } };
  }

  const sizes = await getSizePrices();
  const rows: {
    line_id: string;
    player_name: string | null;
    player_number: string | null;
    size: ApparelSize;
    size_extra_centavos: number;
    sort_order: number;
    created_by: string;
  }[] = [];

  const problems: string[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const parts = trimmed.split(",").map((part) => part.trim());
    const size = (parts[parts.length - 1] ?? "").toUpperCase() as ApparelSize;

    if (!APPAREL_SIZES.includes(size)) {
      problems.push(`Line ${index + 1}: "${trimmed}" does not end in a size.`);
      return;
    }

    rows.push({
      line_id: lineId,
      player_name: parts[0] || null,
      player_number: parts.length >= 3 ? parts[1] || null : null,
      size,
      // Copied now, so a later price rise never rewrites this quote. An unset
      // surcharge counts as nothing extra HERE because the order has to total
      // something - the screen warns that the size has no price set.
      size_extra_centavos: sizeExtra(sizes, size) ?? 0,
      sort_order: rows.length + 1,
      created_by: user.id,
    });
  });

  if (rows.length === 0) {
    return {
      fieldErrors: {
        roster: problems[0] ?? "Nothing was read. Use: name, number, size",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("apparel_order_names").insert(rows);

  if (error) return { error: `That could not be saved: ${error.message}` };

  revalidateOrder(orderId);

  return {
    success:
      problems.length > 0
        ? `${rows.length} added. ${problems.length} line${
            problems.length === 1 ? "" : "s"
          } skipped: ${problems[0]}`
        : `${rows.length} added.`,
  };
}

export async function removeRosterEntryAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_order_names")
    .delete()
    .eq("id", entryId);

  if (error) return { error: `That could not be removed: ${error.message}` };

  revalidateOrder(orderId);
  return { success: "Removed." };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export async function recordPaymentAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");
  const settings = await getSettings();

  const orderId = String(formData.get("orderId") ?? "");
  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That order could not be found." };

  let amountCentavos: number;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    return { fieldErrors: { amount: "Enter the amount taken, like 1000." } };
  }

  const source = String(formData.get("source") ?? "cash_drawer");
  if (!MONEY_SOURCES.includes(source as never)) {
    return { fieldErrors: { source: "Choose where the money went." } };
  }

  /*
    Down payment or balance is now CHOSEN rather than worked out (Phase 10).

    It used to be derived - the first payment was a down payment, everything
    after it a balance - which is the right default and the wrong rule: a
    customer can hand over a second down payment on a job that has not started
    yet, and the books would have called it a balance. The form starts on the
    old answer and lets whoever is at the counter say otherwise.
  */
  const kind = String(formData.get("paymentKind") ?? "");
  if (kind !== "down_payment" && kind !== "balance") {
    return {
      fieldErrors: {
        paymentKind: "Say whether this is a down payment or a balance.",
      },
    };
  }

  /*
    The split is worked out HERE, on the server, from the order's own lines -
    never from anything the browser sent. The database then refuses any split
    that does not add back up to the payment, so the ledger and the order can
    never disagree about what was taken.
  */
  const totals = orderTotals({
    lines: detail.lines,
    roster: detail.roster,
    payments: detail.payments,
  });
  const ledger = splitPaymentByCategory({ lines: totals.lines, amountCentavos });

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("record_apparel_payment", {
    p_order_id: orderId,
    p_amount_centavos: amountCentavos,
    p_paid_on:
      String(formData.get("paidOn") ?? "").trim() ||
      civilDateToISO(manilaToday()),
    p_source: source,
    p_kind: kind,
    p_reference_number: String(formData.get("referenceNumber") ?? "").trim() || null,
    p_note: String(formData.get("note") ?? "").trim() || null,
    p_ledger: ledger.map((part) => ({
      category: part.category,
      amount_centavos: part.amountCentavos,
    })),
  });

  if (error) return { error: `The payment could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "apparel_payment",
    entityId: orderId,
    summary: `Took ${formatPesos(amountCentavos)} on apparel order ${
      detail.order.orderNumber
    }`,
    after: { amount_centavos: amountCentavos, source, kind },
  });

  revalidateOrder(orderId);

  const stillOwed = Math.max(0, totals.balanceCentavos - amountCentavos);

  return {
    success:
      stillOwed > 0
        ? `${formatPesos(amountCentavos)} recorded. ${formatPesos(
            stillOwed,
          )} still owed.`
        : settings.apparelDownPaymentPercent === null
          ? `${formatPesos(amountCentavos)} recorded. Nothing owed.`
          : `${formatPesos(amountCentavos)} recorded. Fully paid.`,
  };
}

export async function voidPaymentAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requireOwnerOrAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { fieldErrors: { reason: "Say why the payment is being taken back." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_apparel_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "void",
    entity: "apparel_payment",
    entityId: paymentId,
    summary: "Voided an apparel payment",
    after: { void_reason: reason },
  });

  revalidateOrder(orderId);
  return { success: "Voided. The takings were voided with it." };
}

// ---------------------------------------------------------------------------
// The price list (Owner/Admin)
// ---------------------------------------------------------------------------

export async function saveApparelProductAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requireOwnerOrAdmin();

  const id = String(formData.get("productId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: "Give the item a name." } };

  // Blank stays blank: a price is a figure only the owner can know.
  const priceText = String(formData.get("basePrice") ?? "").trim();
  let basePriceCentavos: number | null = null;
  if (priceText) {
    try {
      basePriceCentavos = parsePesos(priceText);
      if (basePriceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { basePrice: "Leave empty, or enter a price like 650." } };
    }
  }

  const row = {
    name,
    base_price_centavos: basePriceCentavos,
    income_category: String(formData.get("incomeCategory") ?? "sublimation_jerseys"),
    active: formData.get("active") !== null,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = id
    ? await supabase.from("apparel_products").update(row).eq("id", id)
    : await supabase
        .from("apparel_products")
        .insert({ ...row, created_by: user.id });

  if (error) {
    return {
      error: error.message.includes("apparel_products_name_idx")
        ? "There is already an item with that name."
        : `That could not be saved: ${error.message}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: id ? "update" : "create",
    entity: "apparel_product",
    entityId: id,
    summary: `${id ? "Updated" : "Added"} the apparel item "${name}"`,
    after: row,
  });

  revalidatePath("/apparel/prices");
  revalidatePath("/checklist");
  return { success: `"${name}" saved.` };
}

export async function saveSizePriceAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requireOwnerOrAdmin();

  const size = String(formData.get("size") ?? "") as ApparelSize;
  if (!APPAREL_SIZES.includes(size)) {
    return { error: "That is not one of the sizes." };
  }

  // Blank stays blank. Zero would be a promise that the size costs nothing
  // extra to make, which is a different statement from "not set yet".
  const text = String(formData.get("extra") ?? "").trim();
  let extraCentavos: number | null = null;
  if (text) {
    try {
      extraCentavos = parsePesos(text);
      if (extraCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { [size]: "Leave empty, or enter an amount like 50." } };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_size_prices")
    .update({ extra_centavos: extraCentavos })
    .eq("size", size);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "apparel_size_price",
    entityId: size,
    summary: `Set the ${size} surcharge to ${
      extraCentavos === null ? "not set" : formatPesos(extraCentavos)
    }`,
    after: { size, extra_centavos: extraCentavos },
  });

  revalidatePath("/apparel/prices");
  revalidatePath("/checklist");
  return { success: `${size} saved.` };
}

export async function saveApparelOptionAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requireOwnerOrAdmin();

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "fabric" && kind !== "collar") {
    return { error: "Choose fabric or collar." };
  }

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { fieldErrors: { label: "Give the choice a name." } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_options")
    .insert({ kind, label, created_by: user.id });

  if (error) {
    return {
      error: error.message.includes("apparel_options_one_per_label")
        ? "That choice is already on the list."
        : `That could not be saved: ${error.message}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "apparel_option",
    summary: `Added the ${kind} "${label}"`,
    after: { kind, label },
  });

  revalidatePath("/apparel/prices");
  revalidatePath("/apparel");
  return { success: `"${label}" added.` };
}

/**
 * Removes an apparel item from the price list (the owner's own request,
 * 19 Sep 2026).
 *
 * Only an item that has never been put on a job order. The key on
 * `apparel_order_lines` is `on delete set null` and each line keeps its own
 * copy of the name, so an old job order sheet would still read correctly - but
 * it would lose the link back to what it was charging for, and an item the
 * shop has actually made is part of its history. That one is stopped instead
 * ("not offered"), which takes it off new orders and leaves the old ones be.
 */
export async function deleteApparelProductAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requireOwnerOrAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const supabase = await createSupabaseServerClient();

  // The whole row: once it is gone, the audit log is the only record of it.
  const { data: product } = await supabase
    .from("apparel_products")
    .select("name, base_price_centavos, income_category, sort_order, active, note")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return { error: "That item no longer exists." };

  const { data: hasHistory, error: historyError } = await supabase.rpc(
    "apparel_product_has_history",
    { p_product_id: productId },
  );

  if (historyError) {
    return {
      error: isFunctionMissingFromApi(historyError)
        ? historyCheckUnavailable("apparel_product_has_history")
        : `Could not check its job orders: ${historyError.message}`,
    };
  }

  const refusal = deleteRefusal("apparel item", hasHistory === true);
  if (refusal) return { error: refusal };

  // `.select()` so a delete the policy silently refused can be told apart from
  // one that worked: a DELETE that matches no policy raises nothing.
  const { data: removed, error } = await supabase
    .from("apparel_products")
    .delete()
    .eq("id", productId)
    .select("id");

  if (error) return { error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) {
    return { error: deleteVanished("apparel item") };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "delete",
    entity: "apparel_product",
    entityId: productId,
    summary: `Deleted the apparel item "${product.name}"`,
    before: product,
  });

  revalidatePath("/apparel/prices");
  revalidatePath("/apparel");
  revalidatePath("/checklist");
  return { success: `Deleted ${product.name}.` };
}
