"use server";

/**
 * Project sales (Phase 15).
 *
 * Every write here is a database function that checks the caller itself. This
 * file re-checks the permission and the figures first, because a Server Action
 * is a public endpoint - a hidden button proves nothing - and so the person
 * gets a sentence rather than a raw database error. Nothing here writes to a
 * table or to the ledger: the money is `complete_sale`, reached through
 * `create_project` and `record_project_balance`.
 */
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { getProject } from "@/lib/data/projects";
import { formatPesos, parsePesos } from "@/lib/money";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { computeCashPayment } from "@/lib/pos";
import {
  PROJECT_TYPES,
  isProjectTypeId,
  parseProjectDetails,
  projectCategory,
  projectSummary,
} from "@/lib/project-types";
import {
  PROJECT_STEPS,
  belowDownPaymentPolicy,
  isProjectDivision,
  projectMoney,
  validateNewProject,
  type NewProjectField,
} from "@/lib/projects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAYMENT_METHODS = ["cash", "gcash", "maya", "bank"];

export interface ProjectSaleState {
  error?: string;
  fieldErrors?: Partial<Record<NewProjectField, string>>;
  /** Keyed by the job field's id (`sizes` for the size breakdown). */
  detailErrors?: Record<string, string>;
  created?: {
    projectId: string;
    projectNumber: string;
    saleId: string;
    saleNumber: string;
    changeCentavos: number;
    balanceCentavos: number;
    /** Set when a down payment is under the owner's policy - a warning only. */
    policyWarning: string | null;
  };
}

/** Null for an empty box, NaN for something that is not an amount. */
function pesosOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  try {
    return parsePesos(text);
  } catch {
    return Number.NaN;
  }
}

/** What the database says, minus the plumbing, for a person to read. */
function friendly(message: string): string {
  return message.replace(/^.*?ERROR:\s*/, "");
}

function revalidateProjectScreens(projectId?: string) {
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/closing");
  revalidatePath("/ledger");
  revalidatePath("/overview");
}

export async function createProjectSaleAction(
  _previous: ProjectSaleState,
  formData: FormData,
): Promise<ProjectSaleState> {
  const user = await requirePermission("add_sales");
  const settings = await getSettings();

  // The owner picks a TYPE; the division, the ledger category and the one-line
  // description all follow from it, so none of them is taken from the browser.
  const typeId = String(formData.get("projectType") ?? "");
  const parsed = parseProjectDetails(typeId, (name) =>
    String(formData.get(name) ?? ""),
  );
  const details = parsed.details;
  const division = isProjectTypeId(typeId) ? PROJECT_TYPES[typeId].division : "";

  const total = pesosOrNull(formData.get("total"));
  const amount = pesosOrNull(formData.get("amount"));
  const moneyGiven = pesosOrNull(formData.get("moneyGiven"));
  const paymentMethod = String(formData.get("paymentMethod") ?? "cash");

  if (Number.isNaN(total) || Number.isNaN(amount) || Number.isNaN(moneyGiven)) {
    return {
      detailErrors: parsed.errors,
      fieldErrors: {
        ...(Number.isNaN(total)
          ? { total: "Enter the price like 2500 or 2500.00." }
          : {}),
        ...(Number.isNaN(amount)
          ? { amount: "Enter the amount like 500 or 500.00." }
          : {}),
        ...(Number.isNaN(moneyGiven)
          ? { moneyGiven: "Enter the money given, like 500." }
          : {}),
      },
    };
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: "Choose how the customer is paying." };
  }

  const input = {
    division,
    customerName: String(formData.get("customerName") ?? ""),
    description: details ? projectSummary(details) : "",
    totalCentavos: total,
    kind: String(formData.get("kind") ?? ""),
    amountCentavos: amount,
    dueOn: String(formData.get("dueOn") ?? "").trim() || null,
    incomeCategory: details ? (projectCategory(details) ?? "") : "",
    paymentMethod,
    moneyGivenCentavos: moneyGiven,
  };

  const fieldErrors = validateNewProject(input);
  if (!details) {
    // The job's own errors say what is wrong; these two only restate them.
    delete fieldErrors.division;
    delete fieldErrors.description;
    delete fieldErrors.incomeCategory;
  }
  if (details && fieldErrors.incomeCategory) {
    return { error: "That kind of job cannot be filed. Choose it again." };
  }
  if (
    Object.keys(fieldErrors).length > 0 ||
    Object.keys(parsed.errors).length > 0 ||
    !details ||
    !isProjectDivision(division)
  ) {
    return { fieldErrors, detailErrors: parsed.errors };
  }

  // Both are set: validateNewProject refuses the states where either is not.
  const totalCentavos = total as number;
  const amountCentavos = amount as number;

  const changeCentavos =
    paymentMethod === "cash"
      ? computeCashPayment(amountCentavos, moneyGiven ?? 0).changeCentavos
      : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_project", {
    p_project_date: civilDateToISO(manilaToday()),
    p_division: division,
    p_customer_id: String(formData.get("customerId") ?? "").trim() || null,
    p_customer_name: input.customerName,
    p_contact: String(formData.get("contact") ?? "").trim() || null,
    p_description: input.description,
    p_total_centavos: totalCentavos,
    p_due_on: input.dueOn,
    p_income_category: input.incomeCategory,
    p_kind: input.kind,
    p_amount_centavos: amountCentavos,
    p_payment_method: paymentMethod,
    p_reference_number:
      paymentMethod === "cash"
        ? null
        : String(formData.get("referenceNumber") ?? "").trim() || null,
    p_money_given_centavos: paymentMethod === "cash" ? moneyGiven : null,
    p_change_centavos: changeCentavos,
    p_details: details,
  });

  if (error) {
    return { error: `Could not start the project: ${friendly(error.message)}` };
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.project_id) {
    return { error: "The project did not save. Nothing has been recorded." };
  }

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "projects",
    entityId: result.project_id,
    summary: `Project ${result.project_number} for ${formatPesos(totalCentavos)}, ${formatPesos(amountCentavos)} paid today (sale ${result.sale_number})`,
    after: {
      division,
      total_centavos: totalCentavos,
      paid_today_centavos: amountCentavos,
      due_on: input.dueOn,
    },
  });

  revalidateProjectScreens();

  return {
    created: {
      projectId: result.project_id,
      projectNumber: result.project_number,
      saleId: result.sale_id,
      saleNumber: result.sale_number,
      changeCentavos: changeCentavos ?? 0,
      balanceCentavos: totalCentavos - amountCentavos,
      policyWarning:
        input.kind === "down" &&
        belowDownPaymentPolicy({
          totalCentavos,
          amountCentavos,
          policyPercent: settings.apparelDownPaymentPercent,
        })
          ? `That is under the ${settings.apparelDownPaymentPercent}% down payment policy. It has been recorded - this is only a warning.`
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// The balance
// ---------------------------------------------------------------------------

export interface BalanceState {
  error?: string;
  fieldErrors?: { amount?: string; moneyGiven?: string };
  paid?: {
    projectNumber: string;
    saleId: string;
    saleNumber: string;
    changeCentavos: number;
    balanceCentavos: number;
  };
}

export async function recordProjectBalanceAction(
  _previous: BalanceState,
  formData: FormData,
): Promise<BalanceState> {
  const user = await requirePermission("add_sales");

  const projectId = String(formData.get("projectId") ?? "");
  const amount = pesosOrNull(formData.get("amount"));
  const moneyGiven = pesosOrNull(formData.get("moneyGiven"));
  const paymentMethod = String(formData.get("paymentMethod") ?? "cash");

  if (amount === null || Number.isNaN(amount) || amount <= 0) {
    return {
      fieldErrors: { amount: "Enter the amount being paid, like 500." },
    };
  }
  if (Number.isNaN(moneyGiven)) {
    return { fieldErrors: { moneyGiven: "Enter the money given, like 500." } };
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: "Choose how the customer is paying." };
  }

  // The balance is worked out HERE from the project's own sales - never the
  // one the browser showed. The database checks it again under a lock.
  const project = await getProject(projectId);
  if (!project) return { error: "That project could not be found." };
  if (project.status === "cancelled")
    return { error: "That project was cancelled." };

  const money = projectMoney(project);
  if (money.fullyPaid) return { error: "That project is already fully paid." };
  if (amount > money.balanceCentavos) {
    return {
      fieldErrors: {
        amount: `That is more than the ${formatPesos(money.balanceCentavos)} balance.`,
      },
    };
  }

  let changeCentavos: number | null = null;
  if (paymentMethod === "cash") {
    try {
      changeCentavos = computeCashPayment(
        amount,
        moneyGiven ?? 0,
      ).changeCentavos;
    } catch {
      return {
        fieldErrors: {
          moneyGiven: `That is less than the ${formatPesos(amount)} being paid.`,
        },
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_project_balance", {
    p_project_id: projectId,
    p_sale_date: civilDateToISO(manilaToday()),
    p_amount_centavos: amount,
    p_payment_method: paymentMethod,
    p_reference_number:
      paymentMethod === "cash"
        ? null
        : String(formData.get("referenceNumber") ?? "").trim() || null,
    p_money_given_centavos: paymentMethod === "cash" ? moneyGiven : null,
    p_change_centavos: changeCentavos,
  });

  if (error)
    return {
      error: `Could not record the payment: ${friendly(error.message)}`,
    };
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.sale_id)
    return { error: "The payment did not save. Nothing has been recorded." };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "create",
    entity: "projects",
    entityId: projectId,
    summary: `Payment of ${formatPesos(amount)} on project ${project.number} (sale ${result.sale_number}); balance now ${formatPesos(Number(result.balance_centavos))}`,
    after: {
      amount_centavos: amount,
      balance_centavos: Number(result.balance_centavos),
    },
  });

  revalidateProjectScreens(projectId);

  return {
    paid: {
      projectNumber: project.number,
      saleId: result.sale_id,
      saleNumber: result.sale_number,
      changeCentavos: changeCentavos ?? 0,
      balanceCentavos: Number(result.balance_centavos),
    },
  };
}

// ---------------------------------------------------------------------------
// Production, release and cancel
// ---------------------------------------------------------------------------

export interface ProjectMoveState {
  error?: string;
  done?: string;
}

export async function projectMoveAction(
  _previous: ProjectMoveState,
  formData: FormData,
): Promise<ProjectMoveState> {
  const user = await requirePermission("add_sales");

  const projectId = String(formData.get("projectId") ?? "");
  const move = String(formData.get("move") ?? "");

  const project = await getProject(projectId);
  if (!project) return { error: "That project could not be found." };

  const supabase = await createSupabaseServerClient();
  let summary: string;
  let result: PromiseLike<{ error: { message: string } | null }>;

  switch (move) {
    case "step": {
      const step = String(formData.get("step") ?? "");
      if (!PROJECT_STEPS[project.division].includes(step)) {
        return { error: "That is not a step of this project." };
      }
      result = supabase.rpc("mark_project_step", {
        p_project_id: projectId,
        p_step: step,
      });
      summary = `Project ${project.number}: step ${step} done`;
      break;
    }
    case "undo":
      result = supabase.rpc("undo_project_step", { p_project_id: projectId });
      summary = `Project ${project.number}: last step taken back`;
      break;
    case "release":
      result = supabase.rpc("release_project", { p_project_id: projectId });
      summary = `Project ${project.number} released`;
      break;
    case "cancel": {
      const reason = String(formData.get("reason") ?? "").trim();
      if (reason === "")
        return { error: "Say why the project is being cancelled." };
      result = supabase.rpc("cancel_project", {
        p_project_id: projectId,
        p_reason: reason,
      });
      summary = `Project ${project.number} cancelled: ${reason}`;
      break;
    }
    default:
      return { error: "Nothing to do." };
  }

  const { error } = await result;
  if (error) return { error: friendly(error.message) };

  await recordAudit({
    actorId: user.id,
    actorUsername: user.username,
    action: "update",
    entity: "projects",
    entityId: projectId,
    summary,
  });

  revalidateProjectScreens(projectId);
  return { done: summary };
}
