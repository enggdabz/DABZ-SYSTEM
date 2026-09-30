import "server-only";

/**
 * Reading project sales (Phase 15).
 *
 * A project's balance is never read from a column - there is none. It is the
 * total minus the live sales linked to it, added up in `src/lib/projects.ts`
 * from the rows read here. Every read is by the ordinary server client, so
 * Row Level Security decides who sees what: a person without `add_sales`
 * gets an empty list, never a list with the payments missing.
 *
 * Flat reads stitched together here rather than one embedded select: the
 * schema checker (`npm run check:schema`) reads column names out of the query
 * strings, and it cannot see inside an embed - so a misspelling in one would
 * go unnoticed until a real database was connected.
 */
import { cache } from "react";

import { readProjectDetails } from "@/lib/project-types";
import {
  isProjectDivision,
  type Project,
  type ProjectPayment,
} from "@/lib/projects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PROJECT_COLUMNS =
  "id, project_number, division, customer_name, contact, description, details, total_centavos, due_on, income_category, status, cancel_reason";
const LINK_COLUMNS = "project_id, sale_id, kind";
const SALE_COLUMNS =
  "id, sale_number, sale_date, occurred_at, total_centavos, payment_method, voided_at";
const STEP_COLUMNS = "project_id, step";

interface ProjectRow {
  id: string;
  project_number: string;
  division: string;
  customer_name: string;
  contact: string | null;
  description: string;
  details: unknown;
  total_centavos: number;
  due_on: string | null;
  income_category: string;
  status: Project["status"];
  cancel_reason: string | null;
}

interface LinkRow {
  project_id: string;
  sale_id: string;
  kind: ProjectPayment["kind"];
}

interface SaleRow {
  id: string;
  sale_number: string;
  sale_date: string;
  occurred_at: string;
  total_centavos: number;
  payment_method: string;
  voided_at: string | null;
}

interface StepRow {
  project_id: string;
  step: string;
}

/** Sale ids go in the URL, so a long list is asked for in pieces. */
const CHUNK = 100;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function readSales(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, SaleRow>> {
  const sales = new Map<string, SaleRow>();
  for (let index = 0; index < ids.length; index += CHUNK) {
    const { data, error } = await supabase
      .from("sales")
      .select(SALE_COLUMNS)
      .in("id", ids.slice(index, index + CHUNK));
    if (error) throw new Error(`Could not read the payments: ${error.message}`);
    for (const sale of (data ?? []) as SaleRow[]) sales.set(sale.id, sale);
  }
  return sales;
}

async function assemble(
  supabase: Supabase,
  rows: ProjectRow[],
): Promise<Project[]> {
  if (rows.length === 0) return [];
  const projectIds = rows.map((row) => row.id);

  const links: LinkRow[] = [];
  const steps: StepRow[] = [];
  for (let index = 0; index < projectIds.length; index += CHUNK) {
    const chunk = projectIds.slice(index, index + CHUNK);
    const [linkRead, stepRead] = await Promise.all([
      supabase
        .from("project_payments")
        .select(LINK_COLUMNS)
        .in("project_id", chunk),
      supabase
        .from("project_steps")
        .select(STEP_COLUMNS)
        .in("project_id", chunk),
    ]);
    if (linkRead.error)
      throw new Error(`Could not read the payments: ${linkRead.error.message}`);
    if (stepRead.error)
      throw new Error(`Could not read the steps: ${stepRead.error.message}`);
    links.push(...((linkRead.data ?? []) as LinkRow[]));
    steps.push(...((stepRead.data ?? []) as StepRow[]));
  }

  const sales = await readSales(supabase, [
    ...new Set(links.map((link) => link.sale_id)),
  ]);

  const projects: Project[] = [];
  for (const row of rows) {
    // A division this build does not know is skipped rather than guessed at.
    if (!isProjectDivision(row.division)) continue;

    const payments: ProjectPayment[] = [];
    for (const link of links.filter((entry) => entry.project_id === row.id)) {
      const sale = sales.get(link.sale_id);
      // A payment whose sale cannot be read is left out, not counted as zero.
      // Reading a project needs the same permission as reading its sales, so
      // this should not happen - which is exactly why it is not hidden.
      if (!sale) {
        throw new Error(
          `Project ${row.project_number} has a payment whose sale cannot be read.`,
        );
      }
      payments.push({
        saleId: sale.id,
        saleNumber: sale.sale_number,
        saleDate: sale.sale_date,
        occurredAt: sale.occurred_at,
        kind: link.kind,
        amountCentavos: Number(sale.total_centavos),
        method: sale.payment_method,
        voided: sale.voided_at !== null,
      });
    }

    projects.push({
      id: row.id,
      number: row.project_number,
      division: row.division,
      customerName: row.customer_name,
      contact: row.contact,
      description: row.description,
      details: readProjectDetails(row.details),
      totalCentavos: Number(row.total_centavos),
      dueOn: row.due_on,
      incomeCategory: row.income_category,
      status: row.status,
      cancelReason: row.cancel_reason,
      payments,
      steps: steps
        .filter((entry) => entry.project_id === row.id)
        .map((entry) => entry.step),
    });
  }
  return projects;
}

/**
 * Every project, newest number first. A failed read throws rather than
 * returning an empty list: "no projects" and "could not ask" are not the same
 * answer, and the first is the one that gets believed.
 */
export const getProjects = cache(async (): Promise<Project[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("project_number", { ascending: false });

  if (error) throw new Error(`Could not read the projects: ${error.message}`);
  return assemble(supabase, (data ?? []) as ProjectRow[]);
});

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read the project: ${error.message}`);
  if (!data) return null;
  return (await assemble(supabase, [data as ProjectRow]))[0] ?? null;
}

/**
 * The project a sale paid, or null for a regular sale - which is what a
 * receipt asks to decide whether it is a project's.
 *
 * It looks in `project_payments` rather than at the new columns on `sales` on
 * purpose. Every receipt in the shop goes through this question, and a query
 * that names a column a database does not have yet fails the whole receipt -
 * a regular sale's included. `project_payments` has existed since 0022.
 *
 * A person without `add_sales` gets null (the policies return nothing), so
 * they see the plain receipt rather than an error.
 */
export async function getProjectForSale(
  saleId: string,
): Promise<Project | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_payments")
    .select("project_id")
    .eq("sale_id", saleId)
    .maybeSingle();

  // A missing table is a database that is behind, and a regular sale's
  // receipt must not fall over because of it.
  if (error || !data) return null;
  return getProject((data as { project_id: string }).project_id);
}
