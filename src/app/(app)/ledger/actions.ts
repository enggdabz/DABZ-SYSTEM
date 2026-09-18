"use server";

/**
 * The ledger: adding an entry by hand, and voiding one (spec 10).
 *
 * Most entries are created automatically by other modules. These actions cover
 * the cases that have no module yet - money the owner puts in, a loan drawn
 * down, a withdrawal - and correcting a mistake.
 *
 * A mistake is VOIDED, never deleted (spec 2.1). The row stays, marked, with a
 * reason, so the trail shows what happened rather than hiding it.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { DIVISION_IDS } from "@/lib/divisions";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MONEY_SOURCES,
  type LedgerCategory,
  type MoneySource,
} from "@/lib/ledger";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday, parseISODate } from "@/lib/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LedgerActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

const VALID_TAGS = [...DIVISION_IDS, "whole_shop"] as const;

export async function addLedgerEntryAction(
  _previous: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const actor = await requireOwnerOrAdmin();

  const direction = String(formData.get("direction") ?? "");
  if (direction !== "in" && direction !== "out") {
    return { error: "Choose whether money came in or went out." };
  }

  const fieldErrors: Record<string, string> = {};

  let amountCentavos = 0;
  try {
    amountCentavos = parsePesos(String(formData.get("amount") ?? ""));
    if (amountCentavos <= 0) throw new Error("not positive");
  } catch {
    fieldErrors.amount = "Enter an amount like 500 or 500.50.";
  }

  const category = String(formData.get("category") ?? "") as LedgerCategory;
  const allowed = direction === "in" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!(allowed as readonly string[]).includes(category)) {
    fieldErrors.category = "Choose a category that matches the direction.";
  }

  const tag = String(formData.get("tag") ?? "");
  if (!(VALID_TAGS as readonly string[]).includes(tag)) {
    fieldErrors.tag = "Choose which division this belongs to.";
  }

  const source = String(formData.get("source") ?? "") as MoneySource;
  if (!(MONEY_SOURCES as readonly string[]).includes(source)) {
    fieldErrors.source = "Choose where the money came from or went.";
  }

  const occurredOn =
    parseISODate(String(formData.get("occurredOn") ?? "")) ?? manilaToday();

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // Only the owner may take money out of the shop for themselves (spec 10.2).
  if (category === "owner_withdrawal" && actor.role !== "owner") {
    return { error: "Only the owner can record an owner withdrawal." };
  }

  const supabase = await createSupabaseServerClient();
  const note = String(formData.get("note") ?? "").trim() || null;

  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      // Stored with the Manila offset so it lands on the right day.
      occurred_at: `${civilDateToISO(occurredOn)}T12:00:00+08:00`,
      direction,
      amount_centavos: amountCentavos,
      tag,
      category,
      source,
      note,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: `Could not save the entry: ${error?.message}` };
  }

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "create",
    entity: "ledger_entries",
    entityId: data.id,
    summary: `Recorded ${formatPesos(amountCentavos)} ${
      direction === "in" ? "in" : "out"
    } - ${CATEGORY_LABELS[category] ?? category}`,
    after: { direction, amount_centavos: amountCentavos, category, tag, source },
  });

  revalidatePath("/ledger");
  revalidatePath("/");

  return {
    success: `Recorded ${formatPesos(amountCentavos)} ${direction === "in" ? "in" : "out"}.`,
  };
}

export async function voidLedgerEntryAction(
  _previous: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const actor = await requireOwnerOrAdmin();

  const entryId = String(formData.get("entryId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason === "") {
    return { fieldErrors: { reason: "Say why, so the trail makes sense later." } };
  }

  const supabase = await createSupabaseServerClient();

  const { data: entry } = await supabase
    .from("ledger_entries")
    .select("amount_centavos, direction, category, voided_at, source_table")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) return { error: "That entry no longer exists." };
  if (entry.voided_at) return { error: "That entry is already voided." };

  // An entry created by another module should be undone where it came from, so
  // the record that created it is undone too.
  if (entry.source_table === "bill_payments") {
    return {
      error:
        "This entry came from marking a bill paid. Undo it on the Bills screen instead, so the bill and the loan are put right as well.",
    };
  }

  const { error } = await supabase
    .from("ledger_entries")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: actor.id,
      void_reason: reason,
    })
    .eq("id", entryId);

  if (error) return { error: `Could not void it: ${error.message}` };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "void",
    entity: "ledger_entries",
    entityId: entryId,
    summary: `Voided ${formatPesos(Number(entry.amount_centavos))} ${
      entry.direction === "in" ? "in" : "out"
    } - ${reason}`,
    before: { voided: false },
    after: { voided: true, reason },
  });

  revalidatePath("/ledger");
  revalidatePath("/");

  return { success: "The entry is voided. It stays in the list, marked." };
}
