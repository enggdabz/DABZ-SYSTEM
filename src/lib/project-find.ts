/**
 * "Find project" on the Counter's Project tab: what a follow-up payment needs
 * to know about a project, and the search that picks one.
 *
 * Only projects that can still take a payment are findable - not cancelled and
 * with something owing. A fully paid project has nothing to ask for, and a
 * cancelled one must not take money at all; leaving both out is what stops a
 * payment being recorded against a job that cannot accept it. The server
 * checks again regardless (`recordProjectBalanceAction`).
 */
import { PROJECT_TYPES, projectLines } from "./project-types";
import {
  PROJECT_DIVISION_SHORT,
  projectMoney,
  type Project,
} from "./projects";

export interface FindableProject {
  id: string;
  number: string;
  customerName: string;
  contact: string | null;
  /** "Apparel", "Tarpaulin" ... - the type, or the division for an older project. */
  typeLabel: string;
  /** The job in words, ready to show read-only and to print. */
  lines: string[];
  totalCentavos: number;
  paidCentavos: number;
  balanceCentavos: number;
  dueOn: string | null;
}

/** Everything the follow-up form shows, taken from the project as read. */
export function toFindable(project: Project): FindableProject {
  const money = projectMoney(project);
  return {
    id: project.id,
    number: project.number,
    customerName: project.customerName,
    contact: project.contact,
    typeLabel: project.details
      ? PROJECT_TYPES[project.details.type].label
      : PROJECT_DIVISION_SHORT[project.division],
    // A project started before the details existed keeps its plain description.
    lines: project.details
      ? projectLines(project.details)
      : [project.description],
    totalCentavos: project.totalCentavos,
    paidCentavos: money.paidCentavos,
    balanceCentavos: money.balanceCentavos,
    dueOn: project.dueOn,
  };
}

/** The projects a payment can still be taken against, newest number first. */
export function payableProjects(projects: readonly Project[]): FindableProject[] {
  return projects
    .filter(
      (project) =>
        project.status !== "cancelled" && !projectMoney(project).fullyPaid,
    )
    .map(toFindable)
    .sort((a, b) => b.number.localeCompare(a.number));
}

/** How many results the search shows: a counter screen, not a report. */
export const FIND_LIMIT = 6;

/**
 * The projects matching what was typed - by customer name or project number,
 * ignoring case and the dashes in a number ("260930001" finds J-260930-001).
 * Nothing typed is no search, so it returns nothing rather than the whole list.
 */
export function searchProjects(
  projects: readonly FindableProject[],
  query: string,
): FindableProject[] {
  const compact = (text: string) => text.toLowerCase().replace(/[-\s]/g, "");
  // A word that is only dashes would match every number, so it is not a word.
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => compact(word) !== "");
  if (words.length === 0) return [];

  return projects
    .filter((project) => {
      const haystack = `${project.customerName} ${project.number}`.toLowerCase();
      const numberOnly = compact(project.number);
      // Every word has to be in there somewhere: "falcons 0930" narrows.
      return words.every(
        (word) =>
          haystack.includes(word) || numberOnly.includes(compact(word)),
      );
    })
    .slice(0, FIND_LIMIT);
}
