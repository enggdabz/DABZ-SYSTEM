"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { apportion } from "@/lib/apportion";
import { hasPermission, requireRole, requireUser } from "@/lib/auth";
import { insertWithDocumentNumber } from "@/lib/document-number";
import {
  MONEY_SOURCES, REPAIR_STATUSES, REPAIR_UNIT_KINDS, UNLOCK_METHODS,
  type MoneySource, type RepairStatus,
} from "@/lib/domain";
import { parsePesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => text(f, k) || null;

async function guard() {
  await requireUser();
  if (!(await hasPermission("dabztech_tickets"))) {
    return "You do not have permission to work on repairs.";
  }
  return null;
}

export async function createTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const unitKind = text(formData, "unit_kind");
  if (!REPAIR_UNIT_KINDS.includes(unitKind as never)) {
    return { error: "Choose the kind of unit.", notice: null };
  }
  const unlock = text(formData, "unlock_method") || "not_needed";
  if (!UNLOCK_METHODS.includes(unlock as never)) {
    return { error: "Choose an unlock method.", notice: null };
  }

  const customerName = text(formData, "customer_name");
  if (!customerName) return { error: "Enter the customer's name.", notice: null };

  const problem = text(formData, "problem");
  if (!problem) return { error: "Describe the problem.", notice: null };

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("default_warranty_days")
    .eq("id", 1)
    .maybeSingle();

  const receivedOn = text(formData, "received_on") || new Date().toISOString().slice(0, 10);

  const { data, error } = await insertWithDocumentNumber<{ id: string }>(supabase, {
    table: "repair_tickets",
    numberColumn: "ticket_number",
    prefix: "R",
    on: receivedOn,
    dateColumn: "received_on",
    row: {
      received_on: receivedOn,
      customer_id: opt(formData, "customer_id"),
      customer_name: customerName,
      contact_number: opt(formData, "contact_number"),
      unit_kind: unitKind,
      brand: opt(formData, "brand"),
      model: opt(formData, "model"),
      serial_number: opt(formData, "serial_number"),
      accessories: opt(formData, "accessories"),
      condition_note: opt(formData, "condition_note"),
      problem,
      unlock_method: unlock,
      status: "received",
      warranty_days: settings?.default_warranty_days ?? 30,
      note: opt(formData, "note"),
    },
  });

  if (error || !data) return { error: error ?? "Could not create the ticket.", notice: null };

  revalidatePath("/admin/repairs");
  redirect(`/admin/repairs/${data.id}`);
}

export async function setTicketStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const status = text(formData, "status") as RepairStatus;
  if (!REPAIR_STATUSES.includes(status)) {
    return { error: "Unknown status.", notice: null };
  }

  const ticketId = text(formData, "ticket_id");
  const patch: Database["public"]["Tables"]["repair_tickets"]["Update"] = {
    status,
  };

  // repair_tickets_released_has_date: a released ticket must carry its date.
  if (status === "released") patch.released_on = new Date().toISOString().slice(0, 10);
  if (status === "ready") patch.ready_on = new Date().toISOString().slice(0, 10);
  if (status === "declined") patch.decline_reason = opt(formData, "decline_reason");

  const supabase = await createClient();
  const { error } = await supabase.from("repair_tickets").update(patch).eq("id", ticketId);
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/repairs/${ticketId}`);
  return { error: null, notice: "Ticket updated." };
}

export async function addRepairLine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const ticketId = text(formData, "ticket_id");
  const price = parsePesosToCentavos(text(formData, "unit_price") || "0");
  const quantity = Number(text(formData, "quantity") || "1");

  if (price === null || price < 0) return { error: "Enter a valid price.", notice: null };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be at least one.", notice: null };
  }

  const serviceId = opt(formData, "repair_service_id");
  const supabase = await createClient();

  let name = text(formData, "name");
  let category = "laptop_repair";
  let kind = "service";

  if (serviceId) {
    const { data: service } = await supabase
      .from("repair_services")
      .select("name, income_category, is_checking_fee")
      .eq("id", serviceId)
      .maybeSingle();
    if (service) {
      name = name || service.name;
      category = service.income_category ?? category;
      if (service.is_checking_fee) kind = "checking_fee";
    }
  }
  if (!name) return { error: "Choose a service or give the line a name.", notice: null };

  const { error } = await supabase.from("repair_lines").insert({
    ticket_id: ticketId,
    kind,
    name,
    repair_service_id: serviceId,
    unit_price_centavos: price,
    quantity,
    income_category: category,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/repairs/${ticketId}`);
  return { error: null, notice: "Line added." };
}

export async function fitPart(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const ticketId = text(formData, "ticket_id");
  const quantity = Number(text(formData, "quantity") || "1");
  const price = parsePesosToCentavos(text(formData, "unit_price") || "0");

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be at least one.", notice: null };
  }
  if (price === null || price < 0) return { error: "Enter a valid price.", notice: null };

  const supabase = await createClient();

  // Nullable in SQL, non-nullable in the generated types; see complete_sale.
  const args = {
    p_ticket_id: ticketId,
    p_stock_item_id: opt(formData, "stock_item_id"),
    p_quantity: quantity,
    p_unit_price_centavos: price,
    p_name: opt(formData, "name"),
  };

  const { error } = await supabase.rpc(
    "fit_repair_part",
    args as unknown as Database["public"]["Functions"]["fit_repair_part"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/repairs/${ticketId}`);
  return { error: null, notice: "Part fitted." };
}

export async function takeRepairPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return { error: denied, notice: null };

  const ticketId = text(formData, "ticket_id");
  const amount = parsePesosToCentavos(text(formData, "amount"));
  if (amount === null || amount <= 0) {
    return { error: "Enter an amount above zero.", notice: null };
  }

  const source = text(formData, "source") as MoneySource;
  if (!MONEY_SOURCES.includes(source)) {
    return { error: "Choose where the money came from.", notice: null };
  }

  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("repair_lines")
    .select("unit_price_centavos, quantity, income_category")
    .eq("ticket_id", ticketId);

  // record_repair_payment rejects a split that does not add up to the payment,
  // so the shares are apportioned rather than rounded independently.
  const weights = new Map<string, number>();
  for (const line of lines ?? []) {
    const category = line.income_category ?? "laptop_repair";
    weights.set(
      category,
      (weights.get(category) ?? 0) + line.unit_price_centavos * line.quantity,
    );
  }

  const categories = [...weights.keys()];
  const ledger =
    categories.length === 0
      ? [{ amount_centavos: amount, category: "laptop_repair" }]
      : apportion(amount, categories.map((c) => weights.get(c) ?? 0))
          .map((share, index) => ({
            amount_centavos: share,
            category: categories[index],
          }))
          .filter((entry) => entry.amount_centavos > 0);

  const args = {
    p_ticket_id: ticketId,
    p_amount_centavos: amount,
    p_paid_on: text(formData, "paid_on") || new Date().toISOString().slice(0, 10),
    p_source: source,
    p_reference_number: opt(formData, "reference_number"),
    p_note: opt(formData, "note"),
    p_ledger: ledger,
  };

  const { error } = await supabase.rpc(
    "record_repair_payment",
    args as unknown as Database["public"]["Functions"]["record_repair_payment"]["Args"],
  );
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/repairs/${ticketId}`);
  return { error: null, notice: "Payment recorded." };
}

export async function voidRepairPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["owner", "admin"]);
  const reason = text(formData, "reason");
  if (!reason) return { error: "Say why the payment is being voided.", notice: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_repair_payment", {
    p_payment_id: text(formData, "payment_id"),
    p_reason: reason,
  });
  if (error) return { error: error.message, notice: null };

  revalidatePath(`/admin/repairs/${text(formData, "ticket_id")}`);
  return { error: null, notice: "Payment voided." };
}
