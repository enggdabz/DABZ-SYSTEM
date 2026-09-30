/**
 * Project sales (owner's request, 30 September 2026).
 *
 * WHAT THIS IS
 * A project is a job for one of the three divisions that is taken at the
 * Counter: a customer, a description, a total price, a due date, and a down
 * payment (or the full price) paid today. The Counter records only what was
 * paid today, as a real sale. The unpaid balance stays HERE, on the project.
 *
 * NOTHING DERIVED IS STORED
 * The balance is the total minus the live (unvoided) sales linked to the
 * project. "Fully paid" is that balance being zero. The production status is
 * the first step of the division's list that has no row. So voiding a payment
 * puts the balance back by itself, and no stored figure can disagree with the
 * sales it was built from - the same rule as a payslip, a receipt and an
 * apparel order total.
 *
 * WHY THE CALENDAR SHOWS THE DUE DATE ITSELF
 * The Apparel calendar puts a job a day before its promised date and carries
 * unfinished work forward. This one does not: the owner asked for a project to
 * sit "on its due date", so it does. What is late is listed separately
 * (`overdue`), not moved.
 */
import type { DivisionId } from "./divisions";
import { computeCashPayment } from "./pos";
import {
  addDays,
  civilDateToISO,
  compareCivilDates,
  daysBetween,
  daysInMonth,
  parseISODate,
  startOfWeek,
  type CivilDate,
  type Period,
  type WeekStart,
} from "./period";
import { sumCentavos, type Centavos } from "./money";
import type { ProjectDetails } from "./project-types";

// ---------------------------------------------------------------------------
// Divisions, in the owner's words
// ---------------------------------------------------------------------------

/** The order the Counter's Division dropdown offers them in. */
export const PROJECT_DIVISIONS: readonly DivisionId[] = [
  "apparel",
  "dabztech",
  "printshoppe",
];

export const PROJECT_DIVISION_LABELS: Record<DivisionId, string> = {
  apparel: "Apparel (Dabz Apparel)",
  dabztech: "Repair (DabzTech Solutions)",
  printshoppe: "Printing (Dabz Printshoppe)",
};

/** Short forms for a chip or a table cell. */
export const PROJECT_DIVISION_SHORT: Record<DivisionId, string> = {
  apparel: "Apparel",
  dabztech: "Repair",
  printshoppe: "Printing",
};

export function isProjectDivision(value: string): value is DivisionId {
  return (PROJECT_DIVISIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// What the money is filed as
// ---------------------------------------------------------------------------

/**
 * The ledger categories a project may be filed under, per division. The
 * database refuses a category that does not fit the division
 * (`projects_category_fits_division`), and a test reads the migration to make
 * sure this list and that constraint agree.
 */
export const PROJECT_CATEGORIES: Record<
  DivisionId,
  readonly { id: string; label: string }[]
> = {
  printshoppe: [
    { id: "tarpaulin", label: "Tarpaulin" },
    { id: "stickers", label: "Stickers" },
    { id: "mugs_souvenirs", label: "Mugs and souvenirs" },
    { id: "document_printing", label: "Document printing" },
    { id: "lamination", label: "Lamination" },
    { id: "photocopy", label: "Photocopy" },
    { id: "other_print_jobs", label: "Other printing" },
  ],
  apparel: [
    { id: "sublimation_jerseys", label: "Sublimation jerseys" },
    { id: "shirts", label: "Shirts" },
    { id: "jackets", label: "Jackets" },
    { id: "long_sleeves", label: "Long sleeves" },
    { id: "dtf_prints", label: "DTF prints" },
    { id: "other_apparel", label: "Other apparel" },
  ],
  dabztech: [
    { id: "laptop_repair", label: "Laptop repair" },
    { id: "desktop_repair", label: "Desktop repair" },
    { id: "epson_printer_repair", label: "Epson printer repair" },
    { id: "parts_sold", label: "Parts sold" },
  ],
};

export function isCategoryForDivision(
  division: DivisionId,
  category: string,
): boolean {
  return PROJECT_CATEGORIES[division].some((entry) => entry.id === category);
}

// ---------------------------------------------------------------------------
// Production steps
// ---------------------------------------------------------------------------

/**
 * The steps each division works through, in the order the work happens.
 * `0022_projects.sql` has the same lists in `project_steps_for`; a test reads
 * the migration and fails if the two ever disagree.
 */
export const PROJECT_STEPS: Record<DivisionId, readonly string[]> = {
  apparel: [
    "design",
    "pattern",
    "print",
    "heat_press",
    "tabas",
    "sewing",
    "quality_check",
    "packaging",
    "ready_to_ship",
  ],
  dabztech: [
    "received",
    "diagnosing",
    "repairing",
    "testing",
    "ready_for_pickup",
  ],
  printshoppe: ["design", "print", "finishing", "ready_for_pickup"],
};

/** Sentence case, like every other label here. */
export const PROJECT_STEP_LABELS: Record<string, string> = {
  design: "Design",
  pattern: "Pattern",
  print: "Print",
  heat_press: "Heat press",
  tabas: "Tabas",
  sewing: "Sewing",
  quality_check: "Quality checking",
  packaging: "Packaging",
  ready_to_ship: "Ready to ship",
  received: "Received",
  diagnosing: "Diagnosing",
  repairing: "Repairing",
  testing: "Testing",
  ready_for_pickup: "Ready for pickup",
  finishing: "Finishing",
};

/** The permission that lets somebody tick a step, per division. */
export const PROJECT_STEP_PERMISSION = {
  apparel: "apparel_job_orders",
  dabztech: "dabztech_tickets",
  printshoppe: "add_sales",
} as const;

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type ProjectStatus = "open" | "released" | "cancelled";
export type ProjectPaymentKind = "down" | "full" | "balance";

export const PROJECT_PAYMENT_KIND_LABELS: Record<ProjectPaymentKind, string> = {
  down: "Down payment",
  full: "Full payment",
  balance: "Balance",
};

/** One sale that paid the project, as read back. */
export interface ProjectPayment {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  /** The moment it was rung up, so a receipt can say what was owed THEN. */
  occurredAt: string;
  kind: ProjectPaymentKind;
  /** The sale's own total - never a copy held on the project. */
  amountCentavos: Centavos;
  method: string;
  voided: boolean;
}

export interface Project {
  id: string;
  number: string;
  division: DivisionId;
  customerName: string;
  contact: string | null;
  description: string;
  /** The job as structured data. Null on a project started before 0024. */
  details: ProjectDetails | null;
  totalCentavos: Centavos;
  /** A date with no time, "2026-10-05". Null only for an undated full payment. */
  dueOn: string | null;
  incomeCategory: string;
  status: ProjectStatus;
  cancelReason: string | null;
  payments: readonly ProjectPayment[];
  /** Steps marked done, in any order. */
  steps: readonly string[];
}

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

export interface ProjectMoney {
  paidCentavos: Centavos;
  /** Total minus paid. Never negative: the database refuses an overpayment. */
  balanceCentavos: Centavos;
  fullyPaid: boolean;
}

/** Live payments only: a voided sale is money handed back. */
export function projectMoney(
  project: Pick<Project, "totalCentavos" | "payments">,
): ProjectMoney {
  const paidCentavos = sumCentavos(
    project.payments
      .filter((payment) => !payment.voided)
      .map((payment) => payment.amountCentavos),
  );
  const balanceCentavos = Math.max(0, project.totalCentavos - paidCentavos);
  return { paidCentavos, balanceCentavos, fullyPaid: balanceCentavos === 0 };
}

// ---------------------------------------------------------------------------
// What a receipt says
// ---------------------------------------------------------------------------

export interface ProjectReceiptFigures {
  totalCentavos: Centavos;
  /** This payment alone. */
  paidNowCentavos: Centavos;
  /** Every live payment up to and including this one. */
  paidSoFarCentavos: Centavos;
  balanceCentavos: Centavos;
  kind: ProjectPaymentKind;
}

/**
 * The figures printed on ONE payment's receipt: what the project stood at when
 * that payment was taken, not what it stands at today.
 *
 * A reprint has to read exactly like the slip the customer already holds - a
 * later payment must not quietly change the balance on an earlier receipt. So
 * only payments taken at or before this one count, and a payment that was
 * later voided is left out of the earlier ones' history (the money was handed
 * back), while the receipt of the voided payment itself still shows what it
 * said. Null when the sale is not one of the project's payments.
 */
export function projectReceiptFigures(
  project: Pick<Project, "totalCentavos" | "payments">,
  saleId: string,
): ProjectReceiptFigures | null {
  const thisPayment = project.payments.find((entry) => entry.saleId === saleId);
  if (!thisPayment) return null;

  const upToHere = project.payments.filter(
    (entry) =>
      entry.saleId === saleId ||
      (!entry.voided &&
        (entry.occurredAt < thisPayment.occurredAt ||
          // Same instant: the sale number is the tie-break, as it is on the till.
          (entry.occurredAt === thisPayment.occurredAt &&
            entry.saleNumber < thisPayment.saleNumber))),
  );
  const paidSoFarCentavos = sumCentavos(
    upToHere.map((entry) => entry.amountCentavos),
  );

  return {
    totalCentavos: project.totalCentavos,
    paidNowCentavos: thisPayment.amountCentavos,
    paidSoFarCentavos,
    balanceCentavos: Math.max(0, project.totalCentavos - paidSoFarCentavos),
    kind: thisPayment.kind,
  };
}

/** The header printed on a project receipt. */
export function projectReceiptTitle(kind: ProjectPaymentKind): string {
  return kind === "down" ? "PROJECT DOWNPAYMENT" : "PROJECT PAYMENT";
}

// ---------------------------------------------------------------------------
// Production status
// ---------------------------------------------------------------------------

/** The step the work is at: the first with no mark. Null when every step is done. */
export function currentStep(
  project: Pick<Project, "division" | "steps">,
): string | null {
  return (
    PROJECT_STEPS[project.division].find(
      (step) => !project.steps.includes(step),
    ) ?? null
  );
}

export function stepsDone(
  project: Pick<Project, "division" | "steps">,
): number {
  // Only steps that belong to the division count - a stray one is nothing.
  return PROJECT_STEPS[project.division].filter((step) =>
    project.steps.includes(step),
  ).length;
}

export function isWorkFinished(
  project: Pick<Project, "division" | "steps">,
): boolean {
  return currentStep(project) === null;
}

/**
 * What to print in a status column: the bench the work is at, or that it is
 * done. A cancelled or released project says so instead - that is the shop's
 * last word on it.
 */
export function productionLabel(
  project: Pick<Project, "division" | "steps" | "status">,
): string {
  if (project.status === "cancelled") return "Cancelled";
  if (project.status === "released") return "Released";
  const step = currentStep(project);
  if (step === null) return "Work finished";
  return PROJECT_STEP_LABELS[step] ?? step;
}

/** The payment half of a status: "Fully paid", or what is still owed. */
export function paymentLabel(
  money: ProjectMoney,
  formatPesos: (c: Centavos) => string,
): string {
  return money.fullyPaid
    ? "Fully paid"
    : `Balance ${formatPesos(money.balanceCentavos)}`;
}

// ---------------------------------------------------------------------------
// Starting a project (what the Counter asks for)
// ---------------------------------------------------------------------------

export interface NewProjectInput {
  division: string;
  customerName: string;
  description: string;
  totalCentavos: number | null;
  kind: string;
  amountCentavos: number | null;
  dueOn: string | null;
  incomeCategory: string;
  paymentMethod: string;
  /** Cash only: what the customer handed over. */
  moneyGivenCentavos: number | null;
}

export type NewProjectField =
  | "division"
  | "customerName"
  | "description"
  | "total"
  | "kind"
  | "amount"
  | "dueOn"
  | "incomeCategory"
  | "moneyGiven";

/**
 * The rules a new project has to meet. Run in the browser to help, and again
 * on the server, because a Server Action is a public endpoint - the database
 * repeats every one of these a third time.
 */
export function validateNewProject(
  input: NewProjectInput,
): Partial<Record<NewProjectField, string>> {
  const errors: Partial<Record<NewProjectField, string>> = {};

  if (!isProjectDivision(input.division)) {
    errors.division = "Choose a division.";
  }
  if (input.customerName.trim() === "")
    errors.customerName = "Enter the customer's name.";
  if (input.description.trim() === "") errors.description = "Describe the job.";

  if (input.totalCentavos === null || input.totalCentavos <= 0) {
    errors.total = "Enter the total price for the whole project.";
  }
  if (input.kind !== "down" && input.kind !== "full") {
    errors.kind = "Choose a down payment or a full payment.";
  }

  if (input.amountCentavos === null || input.amountCentavos <= 0) {
    errors.amount = "Enter the amount paid now.";
  } else if (input.totalCentavos !== null && input.totalCentavos > 0) {
    if (input.amountCentavos > input.totalCentavos) {
      errors.amount = "That is more than the project total.";
    } else if (
      input.kind === "full" &&
      input.amountCentavos !== input.totalCentavos
    ) {
      errors.amount =
        "A full payment is the whole price. Choose down payment for less.";
    } else if (
      input.kind === "down" &&
      input.amountCentavos === input.totalCentavos
    ) {
      errors.amount = "That is the whole price - choose full payment.";
    }
  }

  // A balance needs a day to be chased.
  if (input.kind === "down" && (input.dueOn === null || input.dueOn === "")) {
    errors.dueOn = "A project with a down payment needs a due date.";
  } else if (input.dueOn && parseISODate(input.dueOn) === null) {
    errors.dueOn = "Enter the due date as a date.";
  }

  if (
    isProjectDivision(input.division) &&
    !isCategoryForDivision(input.division, input.incomeCategory)
  ) {
    errors.incomeCategory = "Choose what kind of job this is.";
  }

  if (
    input.paymentMethod === "cash" &&
    input.amountCentavos &&
    input.amountCentavos > 0
  ) {
    try {
      computeCashPayment(input.amountCentavos, input.moneyGivenCentavos ?? 0);
    } catch {
      errors.moneyGiven = "That is less than the amount being paid.";
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Open, overdue, due this week
// ---------------------------------------------------------------------------

/**
 * On the list while it is the shop's to do, AND while it is still owed money.
 * A released project with a balance stays: a regular is allowed to take the
 * work, and a project that disappears is a project nobody chases.
 */
export function isOpenProject(
  project: Pick<Project, "status" | "totalCentavos" | "payments">,
): boolean {
  if (project.status === "cancelled") return false;
  if (project.status === "open") return true;
  return !projectMoney(project).fullyPaid;
}

/** Days from today to the due date: negative when it has passed. Null with no date. */
export function daysUntilDue(
  project: Pick<Project, "dueOn">,
  today: CivilDate,
): number | null {
  const due = project.dueOn ? parseISODate(project.dueOn) : null;
  return due ? daysBetween(today, due) : null;
}

export function isOverdue(
  project: Pick<Project, "status" | "dueOn" | "totalCentavos" | "payments">,
  today: CivilDate,
): boolean {
  if (!isOpenProject(project)) return false;
  const days = daysUntilDue(project, today);
  return days !== null && days < 0;
}

export function isDueThisWeek(
  project: Pick<Project, "status" | "dueOn" | "totalCentavos" | "payments">,
  today: CivilDate,
  weekStartsOn: WeekStart,
): boolean {
  if (!isOpenProject(project) || !project.dueOn) return false;
  const due = parseISODate(project.dueOn);
  if (!due) return false;
  const start = startOfWeek(today, weekStartsOn);
  const end = addDays(start, 6);
  return compareCivilDates(due, start) >= 0 && compareCivilDates(due, end) <= 0;
}

export type ProjectFilter = "all" | "unpaid" | "due_week" | "overdue";

export const PROJECT_FILTER_LABELS: Record<ProjectFilter, string> = {
  all: "All open",
  unpaid: "Unpaid balance",
  due_week: "Due this week",
  overdue: "Overdue",
};

export function isProjectFilter(value: string): value is ProjectFilter {
  return value in PROJECT_FILTER_LABELS;
}

/** Division and status filter together; both are optional and combine. */
export function filterProjects(
  projects: readonly Project[],
  options: {
    division: DivisionId | "all";
    filter: ProjectFilter;
    today: CivilDate;
    weekStartsOn: WeekStart;
  },
): Project[] {
  return projects.filter((project) => {
    if (!isOpenProject(project)) return false;
    if (options.division !== "all" && project.division !== options.division)
      return false;
    switch (options.filter) {
      case "unpaid":
        return !projectMoney(project).fullyPaid;
      case "due_week":
        return isDueThisWeek(project, options.today, options.weekStartsOn);
      case "overdue":
        return isOverdue(project, options.today);
      default:
        return true;
    }
  });
}

/** Earliest due date first; undated last; ties by project number. */
export function compareProjectsByDue(a: Project, b: Project): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.number.localeCompare(b.number);
}

// ---------------------------------------------------------------------------
// The calendar
// ---------------------------------------------------------------------------

export interface ProjectCalendarDay {
  /** "2026-10-05" */
  date: string;
  day: number;
  /** False for the days either side that only fill the grid out. */
  inMonth: boolean;
  isToday: boolean;
  projects: Project[];
}

function groupByDueDate(projects: readonly Project[]): Map<string, Project[]> {
  const byDay = new Map<string, Project[]>();
  for (const project of projects) {
    // Every project with a due date is on the calendar, down payment or full,
    // for as long as it is open. Nothing is moved: it sits on its due date.
    if (!project.dueOn || !isOpenProject(project)) continue;
    const bucket = byDay.get(project.dueOn) ?? [];
    bucket.push(project);
    byDay.set(project.dueOn, bucket);
  }
  for (const bucket of byDay.values()) bucket.sort(compareProjectsByDue);
  return byDay;
}

function makeDay(
  date: CivilDate,
  inMonth: boolean,
  today: CivilDate,
  byDay: Map<string, Project[]>,
): ProjectCalendarDay {
  const iso = civilDateToISO(date);
  return {
    date: iso,
    day: date.day,
    inMonth,
    isToday: compareCivilDates(date, today) === 0,
    projects: byDay.get(iso) ?? [],
  };
}

/** The month as whole weeks, starting on the day the shop counts a week from. */
export function buildMonthCalendar(options: {
  projects: readonly Project[];
  period: Period;
  today: CivilDate;
  weekStartsOn: WeekStart;
}): ProjectCalendarDay[][] {
  const { period, today, weekStartsOn } = options;
  const byDay = groupByDueDate(options.projects);

  const first: CivilDate = { year: period.year, month: period.month, day: 1 };
  const last: CivilDate = {
    year: period.year,
    month: period.month,
    day: daysInMonth(period),
  };
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd = addDays(startOfWeek(last, weekStartsOn), 6);
  const span = daysBetween(gridStart, gridEnd) + 1;

  const weeks: ProjectCalendarDay[][] = [];
  for (let index = 0; index < span; index += 1) {
    const date = addDays(gridStart, index);
    const inMonth = date.year === period.year && date.month === period.month;
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(makeDay(date, inMonth, today, byDay));
  }
  return weeks;
}

/** Seven days from `weekStart`. */
export function buildWeekCalendar(options: {
  projects: readonly Project[];
  weekStart: CivilDate;
  today: CivilDate;
}): ProjectCalendarDay[] {
  const byDay = groupByDueDate(options.projects);
  return Array.from({ length: 7 }, (_, index) =>
    makeDay(addDays(options.weekStart, index), true, options.today, byDay),
  );
}

/** Open projects with no due date: they cannot be placed, so they are listed. */
export function undatedProjects(projects: readonly Project[]): Project[] {
  return projects.filter((project) => !project.dueOn && isOpenProject(project));
}

// ---------------------------------------------------------------------------
// The down payment policy
// ---------------------------------------------------------------------------

/**
 * Is a down payment under the shop's policy?
 *
 * A WARNING and nothing more, exactly as at the Apparel counter: the owner may
 * have agreed to take less, and a counter that turned the customer away would
 * be wrong more often than right. With no policy set (null) there is nothing
 * to be under - the percentage is the owner's to say, never a default here.
 */
export function belowDownPaymentPolicy(options: {
  totalCentavos: Centavos;
  amountCentavos: Centavos;
  policyPercent: number | null;
}): boolean {
  if (options.policyPercent === null || options.policyPercent <= 0)
    return false;
  return (
    options.amountCentavos * 100 < options.totalCentavos * options.policyPercent
  );
}
