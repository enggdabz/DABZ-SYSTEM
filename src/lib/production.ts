/**
 * The production report (owner's request, 21 September 2026).
 *
 * WHAT THE OWNER ASKED FOR
 *
 *   "Another category for Production Report, for every project, we can open it
 *    and we can put a status of that item whether it is already OK in design,
 *    Color Test, pattern, print, Heatpress, Fabric Cutting, sewing, quality
 *    checking, Packaging, ready! And from this project it will sum up all
 *    status per item to create a final status of this project."
 *
 * So there are two things here and they are not the same:
 *
 *   an ITEM'S status  - which of the ten benches that item has passed, marked
 *                       by whoever did the work;
 *   the PROJECT'S     - worked out from its items, never typed in by anybody.
 *
 * THE SUM
 *
 * A project is only as far along as its LEAST advanced item. Eighteen jerseys
 * printed and a jacket still waiting on its pattern is a project at "Pattern",
 * not a project at "Print" - because the customer collects all of it at once,
 * and the jacket is what they will be waiting for. So the roll-up is a
 * minimum, never an average: an average would read as good progress while one
 * item had not been started.
 *
 * NOTHING HERE IS STORED. There is no "project stage" column: the status is
 * worked out from the marks every time the screen is opened, exactly as an
 * order's total is added up from its lines and a payslip from its days. A
 * stored stage and a set of ticks can disagree, and then nothing says which
 * one is lying.
 *
 * A SKIPPED BENCH IS SHOWN, NEVER ASSUMED
 *
 * Ticking "Sewing" says the sewing is done. It says nothing at all about the
 * printing. Counting everything below a tick as done would be the system
 * deciding, on no evidence, that a bench nobody marked had finished - and the
 * bench it invented could be the colour test on a job that is about to be
 * printed wrong. So the run of benches marked FROM THE START is what the
 * project rolls up on, and anything ticked past a gap is reported as exactly
 * what it is.
 */

// ---------------------------------------------------------------------------
// The ten benches
// ---------------------------------------------------------------------------

/**
 * The benches a Dabz Apparel item passes, in the order the owner listed them -
 * which is the order the work happens in at the shop.
 *
 * A constant rather than a settings table: this is the owner's own process,
 * not a figure only they can know, and a list in one place is one edit if a
 * bench is ever added. Changing it means a migration too, because the database
 * refuses a stage that is not on this list (`0018_phase12_production.sql`).
 */
export const PRODUCTION_STAGES = [
  "design",
  "colour_test",
  "pattern",
  "print",
  "heat_press",
  "fabric_cutting",
  "sewing",
  "quality_check",
  "packaging",
  "ready",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

/** Sentence case, like every other label in the system. */
export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  design: "Design",
  colour_test: "Colour test",
  pattern: "Pattern",
  print: "Print",
  heat_press: "Heat press",
  fabric_cutting: "Fabric cutting",
  sewing: "Sewing",
  quality_check: "Quality checking",
  packaging: "Packaging",
  ready: "Ready",
};

/** The last bench. Passing it is what "finished" means for an item. */
export const LAST_STAGE_INDEX = PRODUCTION_STAGES.length - 1;

export function isProductionStage(value: string): value is ProductionStage {
  return (PRODUCTION_STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: ProductionStage): number {
  return PRODUCTION_STAGES.indexOf(stage);
}

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

/** One bench, marked done for one item. */
export interface ProductionStep {
  lineId: string;
  stage: ProductionStage;
  /** When it was marked, in UTC. Shown in Manila time by the screen. */
  markedAt: string;
}

/** What the report needs to know about an item - a line on the job order. */
export interface ProductionItem {
  lineId: string;
  name: string;
  /** Roster entries if there are any, otherwise the typed quantity. */
  quantity: number;
}

export interface ItemProduction extends ProductionItem {
  /** The benches marked done, in bench order. */
  marked: ProductionStage[];
  /**
   * How far it has got with nothing skipped: the last bench such that every
   * bench before it is marked too. -1 when the first one is not marked.
   */
  reachedIndex: number;
  reached: ProductionStage | null;
  /** The last bench marked at all, however many gaps are behind it. */
  furthestIndex: number;
  furthest: ProductionStage | null;
  /** Benches left blank BEHIND a later tick. Reported, never assumed done. */
  missing: ProductionStage[];
  started: boolean;
  /** Every bench marked. Nothing is left to do on this item. */
  complete: boolean;
  /** When the last bench was marked, for "moved on Tuesday". */
  lastMarkedAt: string | null;
}

/**
 * Where one item has got to.
 *
 * `reachedIndex` is the conservative reading and it is the one the project
 * rolls up on; `furthestIndex` is what somebody has actually ticked. They are
 * the same number on a job that went through the shop in order, and when they
 * differ the difference is the thing worth showing.
 */
export function itemProduction(
  item: ProductionItem,
  steps: readonly ProductionStep[],
): ItemProduction {
  const own = steps.filter((step) => step.lineId === item.lineId);
  const done = new Set(own.map((step) => step.stage));

  const marked = PRODUCTION_STAGES.filter((stage) => done.has(stage));

  let reachedIndex = -1;
  while (
    reachedIndex + 1 < PRODUCTION_STAGES.length &&
    done.has(PRODUCTION_STAGES[reachedIndex + 1])
  ) {
    reachedIndex += 1;
  }

  const furthestIndex = marked.length
    ? stageIndex(marked[marked.length - 1])
    : -1;

  const missing = PRODUCTION_STAGES.filter(
    (stage, index) => index < furthestIndex && !done.has(stage),
  );

  // Sorted rather than assumed: the rows come back in whatever order the
  // database hands them over, and "last marked" has to be the latest moment,
  // not the last row read.
  const times = own.map((step) => step.markedAt).sort();

  return {
    ...item,
    marked,
    reachedIndex,
    reached: reachedIndex >= 0 ? PRODUCTION_STAGES[reachedIndex] : null,
    furthestIndex,
    furthest: furthestIndex >= 0 ? PRODUCTION_STAGES[furthestIndex] : null,
    missing,
    started: marked.length > 0,
    complete: marked.length === PRODUCTION_STAGES.length,
    lastMarkedAt: times.length ? times[times.length - 1] : null,
  };
}

// ---------------------------------------------------------------------------
// The project
// ---------------------------------------------------------------------------

export interface ProjectProduction {
  items: ItemProduction[];
  /**
   * Nothing is being made on this order yet.
   *
   * A real state of its own, and NOT the same as "not started": an order with
   * no items has nothing anybody could have started, and calling it either
   * "not started" or "ready" would be a claim about work that does not exist.
   */
  noItems: boolean;
  /** The bench EVERY item has passed. -1 when one of them has not started. */
  stageIndex: number;
  stage: ProductionStage | null;
  /** Every item through every bench. */
  complete: boolean;
  /** The items sitting at the back - the ones holding the project up. */
  behind: ItemProduction[];
  /** Items with a bench left blank behind a later tick. */
  withMissing: ItemProduction[];
  itemsComplete: number;
  marksDone: number;
  marksTotal: number;
  /** Marks made out of marks possible, 0-100. Zero when there are no items. */
  percentMarked: number;
  /** The latest moment anybody marked anything on this project. */
  lastMarkedAt: string | null;
}

/**
 * The project's own status, summed from its items.
 *
 * The sum is a MINIMUM (see the top of this file). `behind` names the items
 * that minimum came from, because "at Pattern" is only actionable once the
 * shop knows which item is still at the pattern bench.
 */
export function projectProduction(options: {
  items: readonly ProductionItem[];
  steps: readonly ProductionStep[];
}): ProjectProduction {
  const items = options.items.map((item) => itemProduction(item, options.steps));

  const marksDone = items.reduce((total, item) => total + item.marked.length, 0);
  const marksTotal = items.length * PRODUCTION_STAGES.length;

  const times = items
    .map((item) => item.lastMarkedAt)
    .filter((at): at is string => at !== null)
    .sort();

  if (items.length === 0) {
    return {
      items,
      noItems: true,
      stageIndex: -1,
      stage: null,
      complete: false,
      behind: [],
      withMissing: [],
      itemsComplete: 0,
      marksDone: 0,
      marksTotal: 0,
      percentMarked: 0,
      lastMarkedAt: null,
    };
  }

  const lowest = items.reduce(
    (least, item) => Math.min(least, item.reachedIndex),
    LAST_STAGE_INDEX,
  );

  return {
    items,
    noItems: false,
    stageIndex: lowest,
    stage: lowest >= 0 ? PRODUCTION_STAGES[lowest] : null,
    complete: lowest === LAST_STAGE_INDEX,
    behind: items.filter((item) => item.reachedIndex === lowest),
    withMissing: items.filter((item) => item.missing.length > 0),
    itemsComplete: items.filter((item) => item.complete).length,
    marksDone,
    marksTotal,
    percentMarked: Math.round((marksDone / marksTotal) * 100),
    lastMarkedAt: times.length ? times[times.length - 1] : null,
  };
}

// ---------------------------------------------------------------------------
// Saying it in words
// ---------------------------------------------------------------------------

/**
 * The project's status as a short label - what goes in a chip or a list.
 *
 * "Not started" and "Nothing being made yet" are different sentences on
 * purpose. The first says the work has not begun; the second says there is no
 * work on the order at all, which is the owner's cue to add the items rather
 * than to chase the shop floor.
 */
export function projectStatusLabel(project: ProjectProduction): string {
  if (project.noItems) return "Nothing being made yet";
  if (project.complete) return "Ready";
  if (project.stage === null) return "Not started";
  return PRODUCTION_STAGE_LABELS[project.stage];
}

/** The same for one item. */
export function itemStatusLabel(item: ItemProduction): string {
  if (item.complete) return "Ready";
  if (item.reached === null) return "Not started";
  return PRODUCTION_STAGE_LABELS[item.reached];
}

/**
 * The line under the status: what is holding the project up, in words.
 *
 * Empty when there is nothing to add - the label already said it. A cheerful
 * sentence on a finished project is noise, and a sentence that names no item
 * on an unfinished one tells nobody what to go and do.
 */
export function projectStatusNote(project: ProjectProduction): string {
  if (project.noItems) {
    return "Add what is being made and the benches will appear.";
  }
  if (project.complete) {
    return `All ${project.items.length} item${
      project.items.length === 1 ? "" : "s"
    } through every bench.`;
  }

  const names = project.behind.map((item) => item.name).join(", ");

  if (project.stage === null) {
    return project.behind.length === project.items.length
      ? "No bench has been marked yet."
      : `Waiting on ${names}, which has not started.`;
  }

  return project.behind.length === project.items.length
    ? `Every item is at ${PRODUCTION_STAGE_LABELS[project.stage].toLowerCase()}.`
    : `${names} ${project.behind.length === 1 ? "is" : "are"} the furthest behind.`;
}

/**
 * Where the shop's own marks and the order's workflow status disagree.
 *
 * Both are true statements by somebody: the counter moves an order to "Ready
 * for pickup", the shop floor ticks the benches, and nothing makes them agree.
 * So this reports the disagreement rather than resolving it - the same
 * instinct as a printed payslip adding up its own rows instead of trusting a
 * stored total. Null when there is nothing to say.
 */
export function statusDisagreement(options: {
  project: ProjectProduction;
  orderStatus: string;
  orderStatusLabel: string;
}): string | null {
  const { project, orderStatus, orderStatusLabel } = options;

  if (project.noItems) return null;
  if (orderStatus === "cancelled") return null;

  const collected = orderStatus === "ready" || orderStatus === "released";

  if (project.complete && !collected) {
    return `Every bench is marked done, but the order still says "${orderStatusLabel}".`;
  }

  if (!project.complete && collected) {
    const left = project.items.length - project.itemsComplete;
    return `The order says "${orderStatusLabel}", but ${left} item${
      left === 1 ? " has" : "s have"
    } benches that are not marked.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// The one line the Apparel screen shows about production
// ---------------------------------------------------------------------------

export interface ProductionSummary {
  /** Projects counted - the open ones, whatever the caller handed over. */
  projects: number;
  /** Through every bench. */
  ready: number;
  /** Has items, and not one bench marked on any of them. */
  notStarted: number;
  /** At least one item with a later bench ticked and an earlier one blank. */
  skipped: number;
  /** Job orders with nothing on them yet, which is not the same as not started. */
  noItems: number;
  marksDone: number;
  marksTotal: number;
}

export function summariseProduction(
  projects: readonly ProjectProduction[],
): ProductionSummary {
  return {
    projects: projects.length,
    ready: projects.filter((project) => project.complete).length,
    notStarted: projects.filter(
      (project) => !project.noItems && project.stage === null,
    ).length,
    skipped: projects.filter((project) => project.withMissing.length > 0).length,
    noItems: projects.filter((project) => project.noItems).length,
    marksDone: projects.reduce((total, project) => total + project.marksDone, 0),
    marksTotal: projects.reduce((total, project) => total + project.marksTotal, 0),
  };
}

/**
 * Production in one line, for the Apparel screen.
 *
 * Counts rather than reassurance, the same rule as the calendar's line: with
 * nothing marked it says nothing is marked, because "all on track" over an
 * empty report is the system claiming to know something nobody has told it.
 */
export function productionSummaryLine(summary: ProductionSummary): string {
  if (summary.projects === 0) return "No projects on the bench.";

  const parts: string[] = [];

  if (summary.ready > 0) parts.push(`${summary.ready} through every bench`);
  if (summary.notStarted > 0) parts.push(`${summary.notStarted} not started`);
  if (summary.skipped > 0) {
    parts.push(
      `${summary.skipped} with a bench skipped`,
    );
  }
  if (summary.noItems > 0) {
    parts.push(
      `${summary.noItems} with nothing on ${summary.noItems === 1 ? "it" : "them"} yet`,
    );
  }

  parts.push(`${summary.marksDone} of ${summary.marksTotal} benches marked`);

  return parts.join(" · ");
}
