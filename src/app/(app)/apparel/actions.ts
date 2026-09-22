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
  type ApparelSize,
  type OrderStatus,
} from "@/lib/apparel";
import {
  isApparelSize,
  isUniformType,
  uniformLabel,
  type UniformType,
} from "@/lib/uniforms";
import { recordAudit } from "@/lib/audit";
import { getSettings, requireOwnerOrAdmin, requirePermission } from "@/lib/auth/dal";
import {
  deleteRefusal,
  deleteVanished,
  historyCheckUnavailable,
} from "@/lib/deletable";
import { getApparelOrder } from "@/lib/data/apparel";
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

  /*
    The project's own contact details (Phase 13). All optional: only the team
    name is required to open a project, because the alternative is a counter
    that cannot write an order down until somebody remembers a Facebook link.
  */
  const contact = {
    contact_person: String(formData.get("contactPerson") ?? "").trim() || null,
    contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    facebook_link: String(formData.get("facebookLink") ?? "").trim() || null,
  };

  /*
    The down payment usually arrives with the project, so it can be taken here.
    It goes through `record_apparel_payment` exactly like every other apparel
    payment - never as a typed figure sitting on the order - so the ledger
    entry is written in the same transaction.
  */
  const downPaymentText = String(formData.get("downPayment") ?? "").trim();
  let downPaymentCentavos: number | null = null;
  if (downPaymentText) {
    try {
      downPaymentCentavos = parsePesos(downPaymentText);
      if (downPaymentCentavos <= 0) throw new Error("not positive");
    } catch {
      return {
        fieldErrors: {
          downPayment: "Leave empty, or enter what was handed over, like 3000.",
        },
      };
    }
  }

  const downPaymentSource = String(formData.get("downPaymentSource") ?? "cash_drawer");
  if (downPaymentCentavos !== null && !MONEY_SOURCES.includes(downPaymentSource as never)) {
    return { fieldErrors: { downPaymentSource: "Choose where the money went." } };
  }

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
        ...contact,
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
    after: { team_name: teamName, promised_on: promisedOn, ...contact },
  });

  let paymentNote = "";

  if (downPaymentCentavos !== null) {
    /*
      Nothing is encoded yet, so there are no items to split the payment
      across and it lands in the apparel fallback book. That is a guess, so it
      is SAID - on the form before it is taken, and here afterwards - rather
      than left for the owner to find in a report next month. Encoding the
      people first and taking the payment on the project splits it properly.
    */
    const ledger = splitPaymentByCategory({
      lines: [],
      amountCentavos: downPaymentCentavos,
    });

    const { error: paymentError } = await supabase.rpc("record_apparel_payment", {
      p_order_id: orderId,
      p_amount_centavos: downPaymentCentavos,
      p_paid_on: todayISO,
      p_source: downPaymentSource,
      p_kind: "down_payment",
      p_reference_number:
        String(formData.get("downPaymentReference") ?? "").trim() || null,
      p_note: null,
      p_ledger: ledger.map((part) => ({
        category: part.category,
        amount_centavos: part.amountCentavos,
      })),
    });

    if (paymentError) {
      // The project IS open - refusing to say so would have staff writing it
      // twice. What failed is named, and the payment can be taken again on the
      // project itself.
      paymentNote = ` The down payment could not be recorded: ${paymentError.message} Take it again on the project.`;
    } else {
      await recordAudit({
        actorId: user.id,
        actorUsername: user.username,
        action: "create",
        entity: "apparel_payment",
        entityId: orderId,
        summary: `Took ${formatPesos(
          downPaymentCentavos,
        )} as a down payment when apparel order ${orderNumber} was opened`,
        after: {
          amount_centavos: downPaymentCentavos,
          source: downPaymentSource,
          kind: "down_payment",
        },
      });
      paymentNote = ` ${formatPesos(downPaymentCentavos)} down payment recorded.`;
    }
  }

  revalidateOrder(orderId);
  return { success: `Order ${orderNumber} opened.${paymentNote}`, orderId };
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
    contact_person: String(formData.get("contactPerson") ?? "").trim() || null,
    contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    facebook_link: String(formData.get("facebookLink") ?? "").trim() || null,
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
      contact_person: detail.order.contactPerson,
      contact_number: detail.order.contactNumber,
      address: detail.order.address,
      facebook_link: detail.order.facebookLink,
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

/**
 * Fabric and collar on an item (Phase 13).
 *
 * Items are no longer ADDED by hand: they follow from the encoding table - one
 * item per uniform type, created by `save_apparel_encoding`. What is still
 * chosen per item is what it is made of, because that is a property of the
 * batch and not of a person.
 */
export async function updateLineAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That project could not be found." };

  const line = detail.lines.find((entry) => entry.id === lineId);
  if (!line) return { error: "That item is no longer on this project." };

  const row = {
    fabric: String(formData.get("fabric") ?? "").trim() || null,
    collar: String(formData.get("collar") ?? "").trim() || null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("apparel_order_lines")
    .update(row)
    .eq("id", lineId);

  if (error) return { error: `That could not be saved: ${error.message}` };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "apparel_order_line",
    entityId: lineId,
    summary: `Set the fabric and collar on "${line.name}" (order ${detail.order.orderNumber})`,
    before: { fabric: line.fabric, collar: line.collar },
    after: row,
  });

  revalidateOrder(orderId);
  return { success: "Saved." };
}

/**
 * Removing an item.
 *
 * Only an item nobody is left on. Deleting one that still holds people would
 * take those people with it (`on delete cascade`) and the table above would
 * silently lose a third of a team - so it refuses and says where to do it
 * instead. Emptying the table is how an item goes; this is for the ones the
 * encoding could not tidy away by itself.
 */
export async function removeLineAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That project could not be found." };

  const line = detail.lines.find((entry) => entry.id === lineId);
  if (!line) return { error: "That item is no longer on this project." };

  const people = detail.roster.filter((entry) => entry.lineId === lineId);
  if (people.length > 0) {
    return {
      error: `"${line.name}" still has ${people.length} ${
        people.length === 1 ? "person" : "people"
      } on it. Take their rows off the table above and save; the item goes with them.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: removed, error } = await supabase
    .from("apparel_order_lines")
    .delete()
    .eq("id", lineId)
    .select("id");

  if (error) return { error: `That could not be removed: ${error.message}` };
  if (!removed || removed.length === 0) {
    // A DELETE that matches no policy raises nothing, so `.select()` is how a
    // refusal is told apart from a success.
    return {
      error:
        "Nothing was removed. Either somebody else removed it first, or your account may not change this project.",
    };
  }

  // The whole row, because its bench marks cascade away with it and there is
  // nothing left to reconstruct them from afterwards.
  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "delete",
    entity: "apparel_order_line",
    entityId: lineId,
    summary: `Removed "${line.name}" from apparel order ${detail.order.orderNumber}`,
    before: {
      name: line.name,
      uniform_type: line.uniformType,
      fabric: line.fabric,
      collar: line.collar,
      unit_price_centavos: line.unitPriceCentavos,
      quantity: line.quantity,
      retired_at: line.retiredAt,
    },
  });

  revalidateOrder(orderId);
  revalidatePath(`/production/${orderId}`);
  return { success: `Removed ${line.name}.` };
}

/** One row of the encoding table, as the browser sends it. */
interface EncodingInput {
  id?: string | null;
  uniformType?: string | null;
  customTypeName?: string | null;
  playerName?: string | null;
  playerNumber?: string | null;
  size?: string | null;
  shortSize?: string | null;
  shortName?: string | null;
  /** In pesos, as typed. Empty means nobody has priced this row. */
  price?: string | null;
  note?: string | null;
  quantity?: string | number | null;
  upperIncluded?: boolean | null;
}

/** What goes to the database, and what goes in the audit log. */
interface EncodingRow {
  id: string | null;
  uniform_type: UniformType;
  custom_type_name: string | null;
  player_name: string | null;
  player_number: string | null;
  size: ApparelSize | null;
  short_size: ApparelSize | null;
  short_name: string | null;
  price_centavos: number | null;
  note: string | null;
  quantity: number;
  upper_included: boolean;
}

/**
 * Saves the whole encoding table for a project (Phase 13).
 *
 * THE WHOLE TABLE, in one call and one transaction. Thirty people sent as
 * thirty requests can fail halfway and leave half a team encoded, so the
 * database does it all or none of it - `save_apparel_encoding` in `0019`,
 * which also creates the one item per uniform type the rows imply and tidies
 * up an item nobody is left on.
 *
 * Nothing is guessed on the way through. A row with an empty price box is
 * saved with NO price and shown with a warning; a row with no size is saved
 * with no size. The only things refused are the two that cannot mean anything:
 * a row with no type of uniform, and a Custom row nobody named.
 */
export async function saveEncodingAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  const user = await requirePermission("apparel_job_orders");

  const orderId = String(formData.get("orderId") ?? "");
  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That project could not be found." };

  let input: EncodingInput[];
  try {
    const parsed = JSON.parse(String(formData.get("rows") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("not a list");
    input = parsed as EncodingInput[];
  } catch {
    return { error: "The table could not be read. Reload the project and try again." };
  }

  const rows: EncodingRow[] = [];

  for (const [index, raw] of input.entries()) {
    const at = `Row ${index + 1}`;

    const type = String(raw.uniformType ?? "").trim();
    if (!type) return { error: `${at} has no type of uniform.` };
    if (!isUniformType(type)) {
      return { error: `${at} has a type of uniform this system does not know.` };
    }

    const customName =
      type === "custom" ? String(raw.customTypeName ?? "").trim() : "";
    if (type === "custom" && !customName) {
      return { error: `${at} is Custom, so type in what the uniform is.` };
    }

    const size = String(raw.size ?? "").trim().toUpperCase();
    if (size && !isApparelSize(size)) {
      return { error: `${at} has a size that is not on the ladder: "${size}".` };
    }

    const shortSize = String(raw.shortSize ?? "").trim().toUpperCase();
    if (shortSize && !isApparelSize(shortSize)) {
      return { error: `${at} has a short size that is not on the ladder: "${shortSize}".` };
    }

    // Blank stays blank. A price is a figure only the shop can know, and a
    // row with none is a real state that the screen warns about.
    const priceText = String(raw.price ?? "").trim();
    let priceCentavos: number | null = null;
    if (priceText) {
      try {
        priceCentavos = parsePesos(priceText);
        if (priceCentavos < 0) throw new Error("negative");
      } catch {
        return { error: `${at} has a price that could not be read: "${priceText}".` };
      }
    }

    const quantity = Number(raw.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: `${at} needs a whole number of pieces, at least 1.` };
    }

    const upperIncluded = raw.upperIncluded !== false;
    if (!upperIncluded && !shortSize) {
      return {
        error: `${at} is shorts only, so it needs a short size - otherwise it is nothing at all.`,
      };
    }

    rows.push({
      id: String(raw.id ?? "").trim() || null,
      uniform_type: type,
      custom_type_name: customName || null,
      player_name: String(raw.playerName ?? "").trim() || null,
      player_number: String(raw.playerNumber ?? "").trim() || null,
      size: size ? (size as ApparelSize) : null,
      short_size: shortSize ? (shortSize as ApparelSize) : null,
      short_name: String(raw.shortName ?? "").trim() || null,
      price_centavos: priceCentavos,
      note: String(raw.note ?? "").trim() || null,
      quantity,
      upper_included: upperIncluded,
    });
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("save_apparel_encoding", {
    p_order_id: orderId,
    p_rows: rows.map((row) => ({ ...row })),
  });

  if (error) {
    /*
      Named separately because the fix is different and the raw message reads
      like a bug: the app deploys the moment a branch merges, while
      `npm run db:push` is run by hand afterwards, so for a while this screen
      exists and the function it saves through does not.
    */
    return {
      error: isFunctionMissingFromApi(error)
        ? "The system could not reach save_apparel_encoding, so nothing was saved. Show this to the owner: migration 0019 has not been applied - run npm run db:push. If it HAS been applied, run notify pgrst, 'reload schema'; in the Supabase SQL editor."
        : `The table could not be saved: ${error.message}`,
    };
  }

  /*
    Before and after, both. A row that was changed or taken off the table is
    the one thing on this screen with no other record of it - the rows
    themselves are overwritten - so the audit log carries what the table said
    before this save and what it says now.
  */
  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "apparel_encoding",
    entityId: orderId,
    summary: `Encoded ${rows.length} row${
      rows.length === 1 ? "" : "s"
    } on apparel order ${detail.order.orderNumber}`,
    before: detail.roster.map(auditShape),
    after: rows.map((row) => ({
      name: row.player_name,
      number: row.player_number,
      type: uniformLabel(row.uniform_type, row.custom_type_name),
      size: row.size,
      short_size: row.short_size,
      short_name: row.short_name,
      price_centavos: row.price_centavos,
      quantity: row.quantity,
      note: row.note,
    })),
  });

  revalidateOrder(orderId);
  revalidatePath(`/production/${orderId}`);
  revalidatePath("/production");

  const counts = (data ?? {}) as Record<string, number>;
  const parts: string[] = [];
  if (counts.rows_added) parts.push(`${counts.rows_added} added`);
  if (counts.rows_updated) parts.push(`${counts.rows_updated} changed`);
  if (counts.rows_removed) parts.push(`${counts.rows_removed} removed`);
  if (counts.items_retired) {
    // Said out loud: an item nobody is left on, kept because the shop floor
    // has marked its benches and those marks are somebody's work.
    parts.push(
      `${counts.items_retired} item${
        counts.items_retired === 1 ? "" : "s"
      } kept for their bench marks`,
    );
  }

  return {
    success: parts.length > 0 ? `Saved: ${parts.join(", ")}.` : "Saved.",
  };
}

/** What a row looked like before a save, for the audit log. */
function auditShape(entry: {
  playerName: string | null;
  playerNumber: string | null;
  uniformType: UniformType | null;
  customTypeName: string | null;
  size: string | null;
  shortSize: string | null;
  shortName: string | null;
  priceCentavos: number | null;
  quantity: number;
  note: string | null;
}) {
  return {
    name: entry.playerName,
    number: entry.playerNumber,
    type: uniformLabel(entry.uniformType, entry.customTypeName),
    size: entry.size,
    short_size: entry.shortSize,
    short_name: entry.shortName,
    price_centavos: entry.priceCentavos,
    quantity: entry.quantity,
    note: entry.note,
  };
}

/**
 * Deleting a whole project (owner's request, 22 September 2026).
 *
 * `0007` gave `apparel_orders` no delete policy at all, because an order is
 * cancelled with a reason and never erased - the customer may be holding the
 * job order sheet. That reason still holds for a real job. What it did not
 * cover is the project written by MISTAKE: a wrong team name, a duplicate, a
 * test entry, which sat on the list as "cancelled" for ever.
 *
 * So the gap is exactly the width of the mistake, and it is the rule the rest
 * of the catalogue already follows: delete only where nothing has happened.
 * `0021` is the boundary; this checks the same question first so the screen
 * and the database cannot disagree, and writes the WHOLE project to the audit
 * log before anything goes - every person and every item, because they cascade
 * away with it and afterwards there is nothing left to reconstruct them from.
 */
export async function deleteApparelOrderAction(
  _previous: ApparelState,
  formData: FormData,
): Promise<ApparelState> {
  // Owner/Admin only. Deleting a whole project is not counter work - a staff
  // member cancels it, the same shape as "staff add sales, Owner/Admin void".
  const user = await requireOwnerOrAdmin();

  const orderId = String(formData.get("orderId") ?? "").trim();
  const detail = await getApparelOrder(orderId);
  if (!detail) return { error: "That project no longer exists." };

  const supabase = await createSupabaseServerClient();

  const { data: hasHistory, error: historyError } = await supabase.rpc(
    "apparel_order_has_history",
    { p_order_id: orderId },
  );

  if (historyError) {
    return {
      error: isFunctionMissingFromApi(historyError)
        ? historyCheckUnavailable("apparel_order_has_history")
        : `Could not check what has happened to it: ${historyError.message}`,
    };
  }

  const refusal = deleteRefusal("apparel project", hasHistory === true);
  if (refusal) return { error: refusal };

  /*
    The whole project, written down BEFORE it goes: the order, every item and
    every person on it. All of that cascades away with the order, so this is
    the only record that will exist afterwards - the same rule as a deleted
    product writing its bulk price rules.
  */
  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "delete",
    entity: "apparel_order",
    entityId: orderId,
    summary: `Deleted apparel project ${detail.order.orderNumber}${
      detail.order.teamName ? ` (${detail.order.teamName})` : ""
    } - ${detail.roster.length} ${
      detail.roster.length === 1 ? "person" : "people"
    } and ${detail.lines.length} item${detail.lines.length === 1 ? "" : "s"}`,
    before: {
      order: {
        order_number: detail.order.orderNumber,
        ordered_on: detail.order.orderedOn,
        team_name: detail.order.teamName,
        status: detail.order.status,
        promised_on: detail.order.promisedOn,
        contact_person: detail.order.contactPerson,
        contact_number: detail.order.contactNumber,
        address: detail.order.address,
        facebook_link: detail.order.facebookLink,
        layout_note: detail.order.layoutNote,
        note: detail.order.note,
        cancel_reason: detail.order.cancelReason,
      },
      items: detail.lines.map((line) => ({
        name: line.name,
        uniform_type: line.uniformType,
        custom_type_name: line.customTypeName,
        fabric: line.fabric,
        collar: line.collar,
        unit_price_centavos: line.unitPriceCentavos,
        quantity: line.quantity,
        income_category: line.incomeCategory,
      })),
      people: detail.roster.map((row) => ({
        name: row.playerName,
        number: row.playerNumber,
        type: uniformLabel(row.uniformType, row.customTypeName),
        size: row.size,
        short_size: row.shortSize,
        short_name: row.shortName,
        price_centavos: row.priceCentavos,
        quantity: row.quantity,
        note: row.note,
      })),
    },
  });

  // `.select()` so a delete the policy silently refused can be told apart from
  // one that worked: a DELETE matching no policy removes nothing and raises
  // nothing.
  const { data: removed, error } = await supabase
    .from("apparel_orders")
    .delete()
    .eq("id", orderId)
    .select("id");

  if (error) return { error: `Could not delete it: ${error.message}` };
  if (!removed || removed.length === 0) {
    return { error: deleteVanished("apparel project") };
  }

  revalidateOrder(orderId);
  revalidatePath("/production");
  revalidatePath(`/production/${orderId}`);
  revalidatePath("/apparel/calendar");

  return {
    success: `Deleted ${detail.order.orderNumber}. Its ${detail.roster.length} ${
      detail.roster.length === 1 ? "person" : "people"
    } went with it, and the whole project is in Activity.`,
  };
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

  /*
    Which of the six uniform types this priced item is (Phase 13). Optional,
    and null is the honest default: guessing "Jersey" from the words
    "Sublimation jersey set" would have the encoding table pre-filling a price
    for something the owner never said it was. Untagged simply means the
    encoding table asks for the price instead.
  */
  const taggedType = String(formData.get("uniformType") ?? "").trim();
  if (taggedType && !isUniformType(taggedType)) {
    return { fieldErrors: { uniformType: "Choose one of the six, or leave it." } };
  }

  const row = {
    name,
    base_price_centavos: basePriceCentavos,
    income_category: String(formData.get("incomeCategory") ?? "sublimation_jerseys"),
    active: formData.get("active") !== null,
    note: String(formData.get("note") ?? "").trim() || null,
    uniform_type: taggedType || null,
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
