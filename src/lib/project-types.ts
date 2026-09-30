/**
 * What a project IS, per type: the one place the Counter's Project tab, the
 * server's checks and the printed receipt all read from.
 *
 * The owner asked for the type list and each type's fields to live in one
 * config (30 Sep 2026), so adding a field, or a whole type, is an edit HERE and
 * nowhere else: the form draws its boxes from `fields`, `parseProjectDetails`
 * checks them, `projectLines` words them for the receipt, and the database
 * function `project_details_problem` (0024) repeats the two rules that must
 * hold even for a caller that skips this file - the type fits the division, and
 * an apparel size breakdown adds up to the pieces.
 *
 * A type also decides how the money is filed. The owner picks a TYPE, not a
 * division and a ledger category; both follow from it, so the two can never
 * disagree (the database has a constraint that refuses a category that does not
 * fit its division).
 */
import type { DivisionId } from "./divisions";
import { APPAREL_SIZES } from "./uniforms";

export const PROJECT_TYPE_IDS = [
  "tarpaulin",
  "apparel",
  "printing",
  "repair",
] as const;
export type ProjectTypeId = (typeof PROJECT_TYPE_IDS)[number];

export function isProjectTypeId(value: string): value is ProjectTypeId {
  return (PROJECT_TYPE_IDS as readonly string[]).includes(value);
}

export interface FieldOption {
  value: string;
  label: string;
  /** The ledger category the money is filed under, when the choice decides it. */
  category?: string;
}

export interface FieldDef {
  id: string;
  label: string;
  /**
   * number  - a size or amount, decimals allowed, more than zero
   * integer - a whole count of 1 or more
   * text    - one line
   * textarea - several lines
   * select  - one of `options`
   */
  kind: "number" | "integer" | "text" | "textarea" | "select";
  options?: readonly FieldOption[];
  placeholder?: string;
  hint?: string;
  /** Default true. */
  required?: boolean;
}

export interface ProjectTypeDef {
  id: ProjectTypeId;
  label: string;
  division: DivisionId;
  fields: readonly FieldDef[];
  /** A size breakdown that must add up to the field named here. */
  sizesSumTo?: string;
  /** The ledger category when it is the same for every job of this type. */
  category?: string;
  /** Or the select field whose chosen option carries it. */
  categoryFrom?: string;
}

export const PROJECT_TYPES: Record<ProjectTypeId, ProjectTypeDef> = {
  tarpaulin: {
    id: "tarpaulin",
    label: "Tarpaulin",
    division: "printshoppe",
    category: "tarpaulin",
    fields: [
      { id: "widthFeet", label: "Width (ft)", kind: "number", placeholder: "3" },
      { id: "heightFeet", label: "Height (ft)", kind: "number", placeholder: "5" },
      { id: "quantity", label: "Quantity", kind: "integer", placeholder: "1" },
    ],
  },
  apparel: {
    id: "apparel",
    label: "Apparel",
    division: "apparel",
    categoryFrom: "uniformKind",
    sizesSumTo: "pieces",
    fields: [
      {
        id: "uniformKind",
        label: "Kind of uniform",
        kind: "select",
        options: [
          {
            value: "sublimation_jersey",
            label: "Sublimation jersey",
            category: "sublimation_jerseys",
          },
          { value: "dtf_shirt", label: "DTF shirt", category: "dtf_prints" },
          { value: "jacket", label: "Jacket", category: "jackets" },
          {
            value: "long_sleeve",
            label: "Long sleeve",
            category: "long_sleeves",
          },
          { value: "other", label: "Other", category: "other_apparel" },
        ],
      },
      {
        id: "pieces",
        label: "Number of pieces",
        kind: "integer",
        placeholder: "15",
      },
    ],
  },
  printing: {
    id: "printing",
    label: "Printing",
    division: "printshoppe",
    categoryFrom: "item",
    fields: [
      {
        id: "item",
        label: "Item",
        kind: "select",
        options: [
          { value: "stickers", label: "Stickers", category: "stickers" },
          {
            value: "mugs_souvenirs",
            label: "Mugs and souvenirs",
            category: "mugs_souvenirs",
          },
          {
            value: "document_printing",
            label: "Document printing",
            category: "document_printing",
          },
          { value: "lamination", label: "Lamination", category: "lamination" },
          { value: "photocopy", label: "Photocopy", category: "photocopy" },
          {
            value: "other_print_jobs",
            label: "Other printing",
            category: "other_print_jobs",
          },
        ],
      },
      { id: "quantity", label: "Quantity", kind: "integer", placeholder: "100" },
      {
        id: "specs",
        label: "Specs",
        kind: "textarea",
        placeholder: "Size, paper or material, finish, file name",
      },
    ],
  },
  repair: {
    id: "repair",
    label: "Repair",
    division: "dabztech",
    categoryFrom: "deviceType",
    fields: [
      {
        id: "deviceType",
        label: "Device type",
        kind: "select",
        options: [
          { value: "laptop", label: "Laptop", category: "laptop_repair" },
          { value: "desktop", label: "Desktop", category: "desktop_repair" },
          {
            value: "printer",
            label: "Printer",
            category: "epson_printer_repair",
          },
        ],
      },
      {
        id: "brandModel",
        label: "Brand / model",
        kind: "text",
        placeholder: "e.g. Lenovo IdeaPad 3",
      },
      {
        id: "problem",
        label: "Problem",
        kind: "textarea",
        placeholder: "What the customer says is wrong",
      },
    ],
  },
};

/** Every type has an optional note, so nothing the customer said is lost. */
export const NOTES_FIELD: FieldDef = {
  id: "notes",
  label: "Notes",
  kind: "textarea",
  required: false,
  placeholder: "e.g. team Falcons, deliver to the barangay hall",
};

// ---------------------------------------------------------------------------
// What is stored
// ---------------------------------------------------------------------------

export type DetailValue = string | number;

/** The job as kept in `projects.details` - the type, its fields and any sizes. */
export interface ProjectDetails {
  type: ProjectTypeId;
  values: Record<string, DetailValue>;
  /** Apparel only: pieces per size. Sizes with none are left out. */
  sizes?: Record<string, number>;
  notes?: string;
}

/** The form's box names, so the browser and the server agree on them. */
export const detailInputName = (fieldId: string) => `detail_${fieldId}`;
export const sizeInputName = (size: string) => `size_${size}`;

// ---------------------------------------------------------------------------
// Checking what the form sent
// ---------------------------------------------------------------------------

const MAX_LINE = 200;
const MAX_TEXT = 1000;
const MAX_COUNT = 100_000;
const MAX_FEET = 1000;

export interface ParsedDetails {
  details: ProjectDetails | null;
  /** Keyed by field id; `sizes` for the size breakdown. */
  errors: Record<string, string>;
}

/** A whole number from a box, or null when it is empty or not one. */
function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * Reads the job out of a submitted form and checks it. `read` gives the text
 * typed into a named box ("" when there is none), so this runs the same way in
 * the browser, in the Server Action and in a test.
 *
 * A Server Action is a public endpoint: the type, every value and every size
 * are checked here whatever the form offered.
 */
export function parseProjectDetails(
  typeId: string,
  read: (name: string) => string,
): ParsedDetails {
  if (!isProjectTypeId(typeId)) {
    return { details: null, errors: { type: "Choose the type of project." } };
  }
  const type = PROJECT_TYPES[typeId];
  const errors: Record<string, string> = {};
  const values: Record<string, DetailValue> = {};

  for (const field of type.fields) {
    const text = read(detailInputName(field.id)).trim();
    const required = field.required !== false;

    if (text === "") {
      if (required) errors[field.id] = `Enter ${field.label.toLowerCase()}.`;
      continue;
    }

    switch (field.kind) {
      case "select": {
        if (!field.options?.some((option) => option.value === text)) {
          errors[field.id] = `Choose ${field.label.toLowerCase()}.`;
        } else {
          values[field.id] = text;
        }
        break;
      }
      case "integer": {
        const count = wholeNumber(text);
        if (count === null || count < 1 || count > MAX_COUNT) {
          errors[field.id] = "Enter a whole number of 1 or more.";
        } else {
          values[field.id] = count;
        }
        break;
      }
      case "number": {
        const amount = /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_FEET) {
          errors[field.id] = "Enter a size in feet, more than zero.";
        } else {
          values[field.id] = amount;
        }
        break;
      }
      case "text":
      case "textarea": {
        const limit = field.kind === "text" ? MAX_LINE : MAX_TEXT;
        if (text.length > limit) {
          errors[field.id] = `Keep this under ${limit} characters.`;
        } else {
          values[field.id] = text;
        }
        break;
      }
    }
  }

  const notes = read(detailInputName(NOTES_FIELD.id)).trim();
  if (notes.length > MAX_TEXT) {
    errors[NOTES_FIELD.id] = `Keep this under ${MAX_TEXT} characters.`;
  }

  let sizes: Record<string, number> | undefined;
  if (type.sizesSumTo) {
    sizes = {};
    let bad = false;
    for (const size of APPAREL_SIZES) {
      const text = read(sizeInputName(size)).trim();
      if (text === "") continue;
      const count = wholeNumber(text);
      if (count === null) {
        bad = true;
      } else if (count > 0) {
        sizes[size] = count;
      }
    }

    const pieces = values[type.sizesSumTo];
    const total = Object.values(sizes).reduce((sum, count) => sum + count, 0);
    if (bad) {
      errors.sizes = "Sizes are whole numbers, like 5.";
    } else if (typeof pieces === "number" && total !== pieces) {
      // Words that say which way it is off: "3 short" is what staff act on.
      errors.sizes =
        total < pieces
          ? `The sizes add up to ${total}, but ${pieces} pieces were ordered - ${pieces - total} short.`
          : `The sizes add up to ${total}, but only ${pieces} pieces were ordered - ${total - pieces} too many.`;
    } else if (typeof pieces !== "number" && total === 0) {
      errors.sizes = "Enter how many of each size.";
    }
  }

  if (Object.keys(errors).length > 0) return { details: null, errors };

  const details: ProjectDetails = { type: typeId, values };
  if (sizes) details.sizes = sizes;
  if (notes !== "") details.notes = notes;
  return { details, errors };
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

function optionLabel(type: ProjectTypeDef, fieldId: string, value: DetailValue) {
  const field = type.fields.find((entry) => entry.id === fieldId);
  return (
    field?.options?.find((option) => option.value === value)?.label ??
    String(value)
  );
}

/** "S:5 M:7 L:3", in the size ladder's order. */
export function sizeBreakdownText(sizes: Record<string, number>): string {
  return APPAREL_SIZES.filter((size) => (sizes[size] ?? 0) > 0)
    .map((size) => `${size}:${sizes[size]}`)
    .join(" ");
}

/**
 * The job in words, one line per thing worth reading off a receipt:
 * "Tarpaulin 3x5 ft x2", "Sublimation jersey, 15 pcs, S:5 M:7 L:3".
 */
export function projectLines(details: ProjectDetails): string[] {
  const type = PROJECT_TYPES[details.type];
  const v = details.values;
  const lines: string[] = [];

  switch (details.type) {
    case "tarpaulin":
      lines.push(
        `Tarpaulin ${v.widthFeet}x${v.heightFeet} ft x${v.quantity}`,
      );
      break;
    case "apparel":
      lines.push(
        [
          optionLabel(type, "uniformKind", v.uniformKind),
          `${v.pieces} pcs`,
          details.sizes ? sizeBreakdownText(details.sizes) : "",
        ]
          .filter((part) => part !== "")
          .join(", "),
      );
      break;
    case "printing":
      lines.push(`${optionLabel(type, "item", v.item)} x${v.quantity}`);
      if (v.specs) lines.push(String(v.specs));
      break;
    case "repair":
      lines.push(
        `${optionLabel(type, "deviceType", v.deviceType)}: ${v.brandModel}`,
      );
      lines.push(`Problem: ${v.problem}`);
      break;
  }

  if (details.notes) lines.push(`Note: ${details.notes}`);
  return lines;
}

/** One line for lists, the calendar and `projects.description`. */
export function projectSummary(details: ProjectDetails): string {
  return projectLines(details).join("; ");
}

/** The ledger category the money is filed under, or null if it cannot be told. */
export function projectCategory(details: ProjectDetails): string | null {
  const type = PROJECT_TYPES[details.type];
  if (type.category) return type.category;
  if (!type.categoryFrom) return null;
  const chosen = details.values[type.categoryFrom];
  const field = type.fields.find((entry) => entry.id === type.categoryFrom);
  return (
    field?.options?.find((option) => option.value === chosen)?.category ?? null
  );
}

/**
 * Details as read back from the database. Anything that is not the shape this
 * file writes - an older project with no details, or a type this build does
 * not know - is null, so a screen falls back to the plain description.
 */
export function readProjectDetails(raw: unknown): ProjectDetails | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.type !== "string" || !isProjectTypeId(record.type)) {
    return null;
  }
  if (typeof record.values !== "object" || record.values === null) return null;

  const details: ProjectDetails = {
    type: record.type,
    values: record.values as Record<string, DetailValue>,
  };
  if (typeof record.sizes === "object" && record.sizes !== null) {
    details.sizes = record.sizes as Record<string, number>;
  }
  if (typeof record.notes === "string") details.notes = record.notes;
  return details;
}
