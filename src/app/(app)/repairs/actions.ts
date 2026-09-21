"use server";

/**
 * DabzTech repair tickets (spec 9).
 *
 * There is no password anywhere in this file, and there is no field for one in
 * the database either (spec 9.3). What a ticket records is how the technician
 * gets into the unit - the customer unlocks it, it arrived unlocked, or it does
 * not need unlocking - and nothing more.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getSettings, requireOwnerOrAdmin, requirePermission } from "@/lib/auth/dal";
import { getRepairServices, getRepairTicket } from "@/lib/data/repairs";
import {
  deleteRefusal,
  deleteVanished,
  historyCheckUnavailable,
} from "@/lib/deletable";
import { MONEY_SOURCES } from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { isFunctionMissingFromApi } from "@/lib/postgrest";
import { civilDateToISO, manilaToday } from "@/lib/period";
import {
  TICKET_STATUSES,
  UNIT_INCOME_CATEGORY,
  UNIT_KINDS,
  UNLOCK_METHODS,
  formatTicketNumber,
  splitTicketPayment,
  ticketTotals,
  type TicketStatus,
  type UnitKind,
} from "@/lib/repairs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RepairState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  ticketId?: string;
}

function revalidateTicket(ticketId?: string) {
  revalidatePath("/repairs");
  if (ticketId) revalidatePath(`/repairs/${ticketId}`);
  revalidatePath("/ledger");
  revalidatePath("/overview");
}

// ---------------------------------------------------------------------------
// Taking a unit in
// ---------------------------------------------------------------------------

export async function createTicketAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requirePermission("dabztech_tickets");

  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!customerName) {
    return { fieldErrors: { customerName: "Who is leaving the unit?" } };
  }

  const problem = String(formData.get("problem") ?? "").trim();
  if (!problem) {
    return {
      fieldErrors: { problem: "What is wrong with it, in the customer's words?" },
    };
  }

  const unitKind = String(formData.get("unitKind") ?? "") as UnitKind;
  if (!UNIT_KINDS.includes(unitKind)) {
    return { fieldErrors: { unitKind: "Choose what kind of machine it is." } };
  }

  const unlockMethod = String(formData.get("unlockMethod") ?? "not_needed");
  if (!UNLOCK_METHODS.includes(unlockMethod as never)) {
    return { fieldErrors: { unlockMethod: "Choose how we get into it." } };
  }

  const supabase = await createSupabaseServerClient();
  const today = manilaToday();
  const todayISO = civilDateToISO(today);

  const { count } = await supabase
    .from("repair_tickets")
    .select("id", { count: "exact", head: true })
    .eq("received_on", todayISO);

  let sequence = (count ?? 0) + 1;
  let ticketId: string | null = null;
  let ticketNumber = "";

  // The unique constraint is allowed to reject a collision, and the next
  // number is tried - the same pattern as a receipt number.
  for (let attempt = 0; attempt < 20 && !ticketId; attempt += 1) {
    ticketNumber = formatTicketNumber({
      year: today.year,
      month: today.month,
      day: today.day,
      sequence,
    });

    const { data, error } = await supabase
      .from("repair_tickets")
      .insert({
        ticket_number: ticketNumber,
        received_on: todayISO,
        customer_id: String(formData.get("customerId") ?? "").trim() || null,
        customer_name: customerName,
        contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
        unit_kind: unitKind,
        brand: String(formData.get("brand") ?? "").trim() || null,
        model: String(formData.get("model") ?? "").trim() || null,
        serial_number: String(formData.get("serialNumber") ?? "").trim() || null,
        accessories: String(formData.get("accessories") ?? "").trim() || null,
        condition_note: String(formData.get("conditionNote") ?? "").trim() || null,
        problem,
        unlock_method: unlockMethod,
        // Left empty when nothing was promised on the spot - a real state.
        promised_on: String(formData.get("promisedOn") ?? "").trim() || null,
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (data) ticketId = data.id;
    else if (error?.code === "23505") sequence += 1;
    else return { error: `The ticket could not be saved: ${error?.message}` };
  }

  if (!ticketId) {
    return { error: "Could not find a free ticket number for today." };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "repair_ticket",
    entityId: ticketId,
    summary: `Took in ${unitKind.replace("_", " ")} ${ticketNumber} for ${customerName}`,
    after: { unit_kind: unitKind, problem },
  });

  revalidateTicket(ticketId);
  return { success: `Ticket ${ticketNumber} opened.`, ticketId };
}

export async function updateTicketAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requirePermission("dabztech_tickets");

  const ticketId = String(formData.get("ticketId") ?? "");
  const detail = await getRepairTicket(ticketId);
  if (!detail) return { error: "That ticket could not be found." };

  const unlockMethod = String(formData.get("unlockMethod") ?? "not_needed");
  if (!UNLOCK_METHODS.includes(unlockMethod as never)) {
    return { fieldErrors: { unlockMethod: "Choose how we get into it." } };
  }

  const row = {
    customer_name: String(formData.get("customerName") ?? "").trim() ||
      detail.ticket.customerName,
    customer_id: String(formData.get("customerId") ?? "").trim() || null,
    contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
    brand: String(formData.get("brand") ?? "").trim() || null,
    model: String(formData.get("model") ?? "").trim() || null,
    serial_number: String(formData.get("serialNumber") ?? "").trim() || null,
    accessories: String(formData.get("accessories") ?? "").trim() || null,
    condition_note: String(formData.get("conditionNote") ?? "").trim() || null,
    diagnosis: String(formData.get("diagnosis") ?? "").trim() || null,
    unlock_method: unlockMethod,
    promised_on: String(formData.get("promisedOn") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("repair_tickets")
    .update(row)
    .eq("id", ticketId);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "repair_ticket",
    entityId: ticketId,
    summary: `Updated repair ticket ${detail.ticket.ticketNumber}`,
    before: {
      diagnosis: detail.ticket.diagnosis,
      promised_on: detail.ticket.promisedOn,
    },
    after: row,
  });

  revalidateTicket(ticketId);
  return { success: "Saved." };
}

export async function setTicketStatusAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requirePermission("dabztech_tickets");
  const settings = await getSettings();

  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "") as TicketStatus;

  if (!TICKET_STATUSES.includes(status)) {
    return { error: "That is not a step this ticket can be at." };
  }

  const detail = await getRepairTicket(ticketId, settings.unclaimedUnitDays);
  if (!detail) return { error: "That ticket could not be found." };

  const declineReason = String(formData.get("declineReason") ?? "").trim();
  if ((status === "declined" || status === "unrepairable") && !declineReason) {
    return {
      fieldErrors: {
        declineReason:
          status === "declined"
            ? "Say what the customer decided."
            : "Say why it cannot be repaired.",
      },
    };
  }

  const todayISO = civilDateToISO(manilaToday());

  /*
    The warranty period is COPIED onto the ticket at the moment of release, from
    Settings as it stands today. Shortening the shop warranty next year must not
    quietly cancel a promise already made to this customer - the same rule as
    the daily rate copied onto a payroll week.
  */
  const row: Record<string, unknown> = {
    status,
    decline_reason:
      status === "declined" || status === "unrepairable" ? declineReason : null,
  };

  // The day it became the customer's to collect. The unclaimed count runs from
  // here, so it is set once and not moved by later steps.
  if (
    (status === "ready" || status === "declined" || status === "unrepairable") &&
    !detail.ticket.readyOn
  ) {
    row.ready_on = todayISO;
  }

  if (status === "released") {
    row.released_on = detail.ticket.releasedOn ?? todayISO;
    row.ready_on = detail.ticket.readyOn ?? todayISO;
    row.warranty_days = detail.ticket.warrantyDays ?? settings.defaultWarrantyDays;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("repair_tickets")
    .update(row)
    .eq("id", ticketId);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "repair_ticket",
    entityId: ticketId,
    summary: `Repair ${detail.ticket.ticketNumber} moved to "${status}"`,
    before: { status: detail.ticket.status },
    after: row,
  });

  revalidateTicket(ticketId);

  if (status === "released") {
    const days = detail.ticket.warrantyDays ?? settings.defaultWarrantyDays;
    const owed = detail.totals.balanceCentavos;
    return {
      success:
        owed > 0
          ? `Released with a ${days}-day warranty. ${formatPesos(
              owed,
            )} is still owed, and stays on the list until it is paid.`
          : `Released with a ${days}-day warranty.`,
    };
  }

  return { success: "Saved." };
}

// ---------------------------------------------------------------------------
// What is being charged
// ---------------------------------------------------------------------------

export async function addLineAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requirePermission("dabztech_tickets");

  const ticketId = String(formData.get("ticketId") ?? "");
  const detail = await getRepairTicket(ticketId);
  if (!detail) return { error: "That ticket could not be found." };

  const serviceId = String(formData.get("serviceId") ?? "").trim() || null;
  const services = await getRepairServices();
  const service = services.find((entry) => entry.id === serviceId);

  const name = String(formData.get("name") ?? "").trim() || service?.name || "";
  if (!name) return { fieldErrors: { name: "What is being charged for?" } };

  // Blank price is allowed and means nobody has priced it. The line still goes
  // on the ticket, and the screen warns - a made-up price would be charged to
  // a real customer.
  const priceText = String(formData.get("unitPrice") ?? "").trim();
  let unitPriceCentavos = 0;
  if (priceText) {
    try {
      unitPriceCentavos = parsePesos(priceText);
      if (unitPriceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { unitPrice: "Leave empty, or enter a price like 500." } };
    }
  } else if (service?.priceCentavos != null) {
    unitPriceCentavos = service.priceCentavos;
  }

  const quantity = Number(String(formData.get("quantity") ?? "1"));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { fieldErrors: { quantity: "Enter a whole number, at least 1." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("repair_lines").insert({
    ticket_id: ticketId,
    kind: service?.isCheckingFee ? "checking_fee" : "service",
    name,
    repair_service_id: serviceId,
    unit_price_centavos: unitPriceCentavos,
    quantity,
    income_category:
      service?.incomeCategory ?? UNIT_INCOME_CATEGORY[detail.ticket.unitKind],
    created_by: user.id,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  revalidateTicket(ticketId);
  return { success: `${name} added.` };
}

/**
 * Charges a part and takes it off the shelf.
 *
 * One database function, because it is two facts at once: the customer is
 * charged, and the part leaves stock. As separate requests one can succeed
 * without the other, and then the stock count is wrong for a reason nobody can
 * find a month later.
 */
export async function fitPartAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requirePermission("dabztech_tickets");

  const ticketId = String(formData.get("ticketId") ?? "");
  const stockItemId = String(formData.get("stockItemId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();

  if (!stockItemId && !name) {
    return { fieldErrors: { name: "Choose a part from stock, or name one." } };
  }

  const quantity = Number(String(formData.get("quantity") ?? "1"));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { fieldErrors: { quantity: "Enter a whole number, at least 1." } };
  }

  const priceText = String(formData.get("unitPrice") ?? "").trim();
  let unitPriceCentavos = 0;
  if (priceText) {
    try {
      unitPriceCentavos = parsePesos(priceText);
      if (unitPriceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { unitPrice: "Leave empty, or enter a price like 240." } };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fit_repair_part", {
    p_ticket_id: ticketId,
    p_stock_item_id: stockItemId,
    p_quantity: quantity,
    p_unit_price_centavos: unitPriceCentavos,
    p_name: name || null,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "repair_line",
    entityId: ticketId,
    summary: `Fitted ${quantity} × ${name || "a part from stock"} to a repair`,
    after: { quantity, unit_price_centavos: unitPriceCentavos, stock_item_id: stockItemId },
  });

  revalidateTicket(ticketId);
  revalidatePath("/stocks");

  return {
    success: stockItemId
      ? "Part charged and taken off the shelf."
      : "Part charged.",
  };
}

export async function removeLineAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  await requirePermission("dabztech_tickets");

  const ticketId = String(formData.get("ticketId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("repair_lines").delete().eq("id", lineId);

  if (error) return { error: `That could not be removed: ${error.message}` };

  /*
    Removing a charge does NOT put the part back on the shelf. The stock
    movement stays, because the part did leave - if it is going back, that is a
    delivery, recorded on the Stocks screen where somebody has to say so.
  */
  revalidateTicket(ticketId);
  return { success: "Removed from the charge. Stock was not changed." };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export async function recordPaymentAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requirePermission("dabztech_tickets");

  const ticketId = String(formData.get("ticketId") ?? "");
  const detail = await getRepairTicket(ticketId);
  if (!detail) return { error: "That ticket could not be found." };

  let amountCentavos: number;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    return { fieldErrors: { amount: "Enter the amount taken, like 650." } };
  }

  const source = String(formData.get("source") ?? "cash_drawer");
  if (!MONEY_SOURCES.includes(source as never)) {
    return { fieldErrors: { source: "Choose where the money went." } };
  }

  /*
    Down payment or balance (Phase 10). A DabzTech payment says which since
    `0014`, the same as an apparel one has since `0007`.

    The form always sends one, so an empty box is a fault rather than an old
    record: null is reserved for the payments taken before the column existed,
    and inventing more of those would blur the one honest gap in the data.
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
    The split is worked out HERE, on the server, from the ticket's own lines -
    never from anything the browser sent. The database then refuses any split
    that does not add back up to the payment.
  */
  const totals = ticketTotals({ lines: detail.lines, payments: detail.payments });
  const ledger = splitTicketPayment({
    lines: totals.lines,
    amountCentavos,
    unitKind: detail.ticket.unitKind,
  });

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("record_repair_payment", {
    p_ticket_id: ticketId,
    p_amount_centavos: amountCentavos,
    p_paid_on:
      String(formData.get("paidOn") ?? "").trim() || civilDateToISO(manilaToday()),
    p_source: source,
    p_reference_number: String(formData.get("referenceNumber") ?? "").trim() || null,
    p_note: String(formData.get("note") ?? "").trim() || null,
    p_ledger: ledger.map((part) => ({
      category: part.category,
      amount_centavos: part.amountCentavos,
    })),
    p_kind: kind,
  });

  if (error) return { error: `The payment could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "repair_payment",
    entityId: ticketId,
    summary: `Took ${formatPesos(amountCentavos)} on repair ${
      detail.ticket.ticketNumber
    }`,
    after: { amount_centavos: amountCentavos, source, kind },
  });

  revalidateTicket(ticketId);

  const stillOwed = Math.max(0, totals.balanceCentavos - amountCentavos);
  return {
    success:
      stillOwed > 0
        ? `${formatPesos(amountCentavos)} recorded. ${formatPesos(
            stillOwed,
          )} still owed.`
        : `${formatPesos(amountCentavos)} recorded. Nothing owed.`,
  };
}

export async function voidPaymentAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requireOwnerOrAdmin();

  const ticketId = String(formData.get("ticketId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { fieldErrors: { reason: "Say why the payment is being taken back." } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_repair_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "void",
    entity: "repair_payment",
    entityId: paymentId,
    summary: "Voided a repair payment",
    after: { void_reason: reason },
  });

  revalidateTicket(ticketId);
  return { success: "Voided. The takings were voided with it." };
}

// ---------------------------------------------------------------------------
// The price list (Owner/Admin)
// ---------------------------------------------------------------------------

export async function saveServiceAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requireOwnerOrAdmin();

  const id = String(formData.get("serviceId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fieldErrors: { name: "Give the service a name." } };

  const unitKind = String(formData.get("unitKind") ?? "any");
  if (unitKind !== "any" && !UNIT_KINDS.includes(unitKind as UnitKind)) {
    return { fieldErrors: { unitKind: "Choose which machine it applies to." } };
  }

  // Blank stays blank: a price is a figure only the owner can know.
  const priceText = String(formData.get("price") ?? "").trim();
  let priceCentavos: number | null = null;
  if (priceText) {
    try {
      priceCentavos = parsePesos(priceText);
      if (priceCentavos < 0) throw new Error("negative");
    } catch {
      return { fieldErrors: { price: "Leave empty, or enter a price like 500." } };
    }
  }

  /*
    The checking fee is the one charge that applies even when the customer says
    no (spec 9.2), and the ticket totals keep it separate because of this flag.
    It used to arrive on a seeded row with no control anywhere, so once the
    seeded list was cleared there was no way to have a checking fee at all.
    A partial unique index (migration 0012) makes sure only one row carries it.
  */
  const isCheckingFee = formData.get("isCheckingFee") !== null;

  const row = {
    name,
    unit_kind: unitKind,
    price_centavos: priceCentavos,
    income_category: isCheckingFee
      ? "checking_fee"
      : unitKind === "any"
        ? String(formData.get("incomeCategory") ?? "laptop_repair")
        : UNIT_INCOME_CATEGORY[unitKind as UnitKind],
    is_checking_fee: isCheckingFee,
    active: formData.get("active") !== null,
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = id
    ? await supabase.from("repair_services").update(row).eq("id", id)
    : await supabase.from("repair_services").insert({ ...row, created_by: user.id });

  if (error) {
    if (error.message.includes("repair_services_one_checking_fee")) {
      return {
        error:
          "Another service is already marked as the checking fee. Take the mark off that one first - there can only be one.",
      };
    }
    return {
      error: error.message.includes("repair_services_name_idx")
        ? "There is already a service with that name for that machine."
        : `That could not be saved: ${error.message}`,
    };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: id ? "update" : "create",
    entity: "repair_service",
    entityId: id,
    summary: `${id ? "Updated" : "Added"} the repair service "${name}"`,
    after: row,
  });

  revalidatePath("/repairs/prices");
  revalidatePath("/checklist");
  return { success: `"${name}" saved.` };
}

/**
 * Removes a service from the repair price list (the owner's own request,
 * 19 Sep 2026).
 *
 * Only a service that has never been charged on a ticket. The key on
 * `repair_lines` is `on delete set null` and each line keeps its own copy of
 * the name, so an old ticket would still read correctly - but it would lose
 * the link back to what it charged for, and work the shop has actually done is
 * part of its history. That one is stopped instead ("not offered").
 */
export async function deleteServiceAction(
  _previous: RepairState,
  formData: FormData,
): Promise<RepairState> {
  const user = await requireOwnerOrAdmin();

  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const supabase = await createSupabaseServerClient();

  const { data: service } = await supabase
    .from("repair_services")
    .select("name, unit_kind, price_centavos, income_category, is_checking_fee, sort_order, active, note")
    .eq("id", serviceId)
    .maybeSingle();

  if (!service) return { error: "That service no longer exists." };

  const { data: hasHistory, error: historyError } = await supabase.rpc(
    "repair_service_has_history",
    { p_service_id: serviceId },
  );

  if (historyError) {
    return {
      error: isFunctionMissingFromApi(historyError)
        ? historyCheckUnavailable("repair_service_has_history")
        : `Could not check its tickets: ${historyError.message}`,
    };
  }

  const refusal = deleteRefusal("repair service", hasHistory === true);
  if (refusal) return { error: refusal };

  const { data: removed, error } = await supabase
    .from("repair_services")
    .delete()
    .eq("id", serviceId)
    .select("id");

  if (error) return { error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) {
    return { error: deleteVanished("repair service") };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "delete",
    entity: "repair_service",
    entityId: serviceId,
    summary: `Deleted the repair service "${service.name}"${
      service.is_checking_fee ? " - it was the checking fee" : ""
    }`,
    before: service,
  });

  revalidatePath("/repairs/prices");
  revalidatePath("/repairs");
  revalidatePath("/checklist");
  return { success: `Deleted ${service.name}.` };
}
