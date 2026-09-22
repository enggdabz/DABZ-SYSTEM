/**
 * Encoding a Dabz Apparel project, person by person (owner's request,
 * 21 September 2026).
 *
 *   "It is a team project, so everyone can have their own name, size and so
 *    on... After everything is encoded, show a summary: how many Jersey,
 *    T-Shirt, Polo Shirt, Longsleeve, Jacket and Custom there are per size,
 *    and the same for the shorts."
 *
 * So this file holds three things, and they are all PURE - given the same rows
 * they give the same answer, on a screen, on a printed sheet and in a test.
 *
 *   the six types   - our own list, fixed in code and in `0019`;
 *   what a row costs - its own price, or what its item charges each;
 *   the summary     - the grid that cutting and sewing work from.
 *
 * TWO RULES THAT MATTER MOST HERE
 *
 * 1. THE SUMMARY IS NEVER STORED. It is counted from the rows every time it is
 *    shown, exactly as an order's total is added up from its lines and a
 *    payslip from its days. A stored grid and a name list can disagree, and
 *    the person cutting the fabric will believe the grid.
 *
 * 2. NOTHING IS GUESSED. A row with no size is counted in a column that says
 *    "not set", not folded into M. A row with no price is marked, not priced.
 *    A type nobody recorded reads as "not recorded", not as Jersey. Each of
 *    those is a real state somebody can fix; a confident wrong answer is not.
 */
import type { Centavos } from "./money";

// ---------------------------------------------------------------------------
// The size ladder
// ---------------------------------------------------------------------------

/**
 * The standard size ladder, for the upper and for the shorts alike. The
 * surcharge on the big sizes is a figure only the owner can know, so every one
 * of these starts with NO extra (see `apparel_size_prices`).
 *
 * It lives here rather than in `apparel.ts` because it is vocabulary - what a
 * size can be - and the encoding table, the summary and the order totals all
 * need it. `apparel.ts` re-exports it, so nothing that already imports it from
 * there had to change.
 */
export const APPAREL_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
] as const;
export type ApparelSize = (typeof APPAREL_SIZES)[number];

export function isApparelSize(value: string): value is ApparelSize {
  return (APPAREL_SIZES as readonly string[]).includes(value);
}

export interface SizePrice {
  size: ApparelSize;
  /** Extra on top of the item price. Null means the owner has not said. */
  extraCentavos: Centavos | null;
}

/** What a size adds, or null while nobody has said. Never assumed to be zero. */
export function sizeExtra(
  sizes: readonly SizePrice[],
  size: ApparelSize,
): Centavos | null {
  const found = sizes.find((entry) => entry.size === size);
  return found ? found.extraCentavos : null;
}

// ---------------------------------------------------------------------------
// The six uniform types
// ---------------------------------------------------------------------------

/**
 * What the shop makes, in the owner's own words and the owner's own order.
 *
 * A constant rather than a settings table, for the same reason the ten
 * production benches are one: this is the shop's own list, not a figure only
 * the owner can know. Adding a seventh means editing this list AND the check
 * constraints in `0019_phase13_encoding.sql`; `uniforms.test.ts` reads that
 * migration and fails if the two ever stop agreeing about how a type is
 * spelled.
 */
export const UNIFORM_TYPES = [
  "jersey",
  "tshirt",
  "polo",
  "longsleeve",
  "jacket",
  "custom",
] as const;
export type UniformType = (typeof UNIFORM_TYPES)[number];

/** Sentence case, like every other label in the system. */
export const UNIFORM_TYPE_LABELS: Record<UniformType, string> = {
  jersey: "Jersey",
  tshirt: "T-shirt",
  polo: "Polo shirt",
  longsleeve: "Longsleeve",
  jacket: "Jacket",
  custom: "Custom",
};

/**
 * Which set of books a type's money lands in (spec 10.1).
 *
 * Fixed here and in the database (`uniform_income_category` in `0019`), never
 * passed in by the caller and never read off the price list. A Server Action
 * is a public endpoint and the books are not its to choose, and one type with
 * two possible categories is how two reports start disagreeing.
 *
 * Custom is `other_apparel` rather than jerseys. A custom cap is not a jersey,
 * and filing it as one would overstate the jersey book every time - quietly,
 * which is the worst way for a book to be wrong.
 */
export const UNIFORM_INCOME_CATEGORY: Record<UniformType, string> = {
  jersey: "sublimation_jerseys",
  tshirt: "shirts",
  polo: "shirts",
  longsleeve: "long_sleeves",
  jacket: "jackets",
  custom: "other_apparel",
};

export function isUniformType(value: string): value is UniformType {
  return (UNIFORM_TYPES as readonly string[]).includes(value);
}

/**
 * Two spellings of the same custom uniform, made comparable.
 *
 * "Bib shorts", "bib shorts" and "Bib  Shorts" are one line on the summary,
 * because they are one thing on the cutting table. What is SHOWN is the first
 * spelling anybody typed - correcting somebody's capitals on screen would be
 * this system deciding it knows better than the person who took the order.
 */
export function normaliseCustomName(name: string | null): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** How a row's uniform reads: the type, or the custom name that replaced it. */
export function uniformLabel(
  type: UniformType | null,
  customName: string | null,
): string {
  if (type === null) return "Type not recorded";
  if (type === "custom") {
    const typed = (customName ?? "").trim().replace(/\s+/g, " ");
    return typed === "" ? "Custom (not named)" : typed;
  }
  return UNIFORM_TYPE_LABELS[type];
}

// ---------------------------------------------------------------------------
// One person on the project
// ---------------------------------------------------------------------------

/** One encoded row: one person, or one nameless block of identical pieces. */
export interface EncodedRow {
  id: string;
  /** The item it hangs off - one item per uniform type (see `0019`). */
  lineId: string;
  /** Null on a row written before Phase 13. "Not recorded", never guessed. */
  uniformType: UniformType | null;
  customTypeName: string | null;
  playerName: string | null;
  playerNumber: string | null;
  /** Null while nobody has said. A real state, not an error. */
  size: ApparelSize | null;
  /** Set means this row is a SET and counts as one short of that size. */
  shortSize: ApparelSize | null;
  shortName: string | null;
  /** What this row costs, one piece. Null falls back to the item's price. */
  priceCentavos: Centavos | null;
  note: string | null;
  /** One for a person. Fifty for a nameless block of fifty plain shirts. */
  quantity: number;
  /** False on a shorts-only row. Said, never inferred from an empty size. */
  upperIncluded: boolean;
  /**
   * The size surcharge copied on to this row before Phase 13. It is half of
   * what such a row costs, so it is never rewritten - see `rowPrice`.
   */
  sizeExtraCentavos: Centavos;
}

/** What `rowPrice` needs to know about the item a row hangs off. */
export interface RowPricingItem {
  unitPriceCentavos: Centavos;
}

/**
 * What one piece on this row costs.
 *
 * THE FALLBACK IS THE WHOLE POINT OF IT. Every roster entry written before
 * Phase 13 was totalled as "the item's price each, plus this entry's copied
 * size add-on" - so a row with no price of its own is totalled that way still,
 * and every project already in the system comes to the same figure, to the
 * centavo, with nothing rewritten and no data migration.
 *
 * A row encoded from today carries its own price, add-on included, because the
 * add-on was in the figure the counter pre-filled and the person typed over.
 */
export function rowPrice(row: EncodedRow, item: RowPricingItem): Centavos {
  if (row.priceCentavos !== null) return row.priceCentavos;
  return item.unitPriceCentavos + row.sizeExtraCentavos;
}

/** The whole row: its price times however many pieces it stands for. */
export function rowTotal(row: EncodedRow, item: RowPricingItem): Centavos {
  return rowPrice(row, item) * row.quantity;
}

/**
 * Has anybody actually priced this row?
 *
 * Zero typed on the row IS a price - a sponsor's shirt is free, and the shop
 * meant it. What is not a price is nobody having said anything: no figure on
 * the row, and nothing on the item to fall back to.
 */
export function rowIsPriced(row: EncodedRow, item: RowPricingItem): boolean {
  if (row.priceCentavos !== null) return true;
  return item.unitPriceCentavos > 0 || row.sizeExtraCentavos > 0;
}

/** What a row is missing, in the words the screen and the sheet both use. */
export interface RowWarning {
  kind: "no_type" | "no_price" | "no_size" | "short_name_without_size";
  label: string;
}

export function rowWarnings(row: EncodedRow, item: RowPricingItem): RowWarning[] {
  const warnings: RowWarning[] = [];

  if (row.uniformType === null) {
    warnings.push({ kind: "no_type", label: "No type of uniform" });
  }
  if (!rowIsPriced(row, item)) {
    warnings.push({ kind: "no_price", label: "No price" });
  }
  if (row.upperIncluded && row.size === null) {
    warnings.push({ kind: "no_size", label: "No size" });
  }
  /*
    A short name with no short size is the one combination that quietly loses
    something. The short size is what makes a row a set, so without it no
    shorts are counted, printed or cut - while the row plainly says somebody
    expects a name on a pair.
  */
  if (row.shortSize === null && (row.shortName ?? "").trim() !== "") {
    warnings.push({
      kind: "short_name_without_size",
      label: "Short name, but no short size - no shorts are counted",
    });
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

/** One row of the uppers grid: a uniform type, counted across the sizes. */
export interface SummaryLine {
  key: string;
  type: UniformType | null;
  /** The first spelling anybody typed, for a custom uniform. */
  customName: string | null;
  label: string;
  /** Counts in `APPAREL_SIZES` order. */
  bySize: number[];
  /** Pieces whose size nobody has typed yet. */
  noSize: number;
  total: number;
}

/** An item with no encoded rows at all - pieces nobody has been named for. */
export interface UnencodedItem {
  lineId: string;
  name: string;
  quantity: number;
}

export interface UniformSummary {
  uppers: SummaryLine[];
  /** Column totals of the uppers grid, in `APPAREL_SIZES` order. */
  upperBySize: number[];
  upperNoSize: number;
  upperTotal: number;
  shortsBySize: number[];
  shortsTotal: number;
  /** Pieces on an item nobody has encoded rows for. Counted, never hidden. */
  unencoded: UnencodedItem[];
  unencodedTotal: number;
  /** True when anything landed in a "not set" column, so the screen warns. */
  sizeMissing: boolean;
  /** Rows carrying a short name with no short size. No shorts are counted. */
  shortNameWithoutSize: number;
}

function emptyCounts(): number[] {
  return APPAREL_SIZES.map(() => 0);
}

/**
 * The grid that cutting and sewing work from.
 *
 * Counted from the rows every time (see the top of this file). Two things in
 * here are choices worth knowing about.
 *
 * EACH DISTINCT CUSTOM NAME IS ITS OWN LINE, matched on capitals and spacing
 * so "Bib shorts" and "bib  shorts" are one line rather than two halves of one
 * order.
 *
 * A ROW COUNTS `quantity` PIECES, not one. That is what lets fifty plain
 * shirts be one row saying fifty rather than fifty empty rows nobody would
 * type - and the summary still counts fifty.
 */
export function summariseUniforms(options: {
  rows: readonly EncodedRow[];
  /** Items with no encoded rows - a plain block written before Phase 13. */
  unencoded?: readonly UnencodedItem[];
}): UniformSummary {
  const lines = new Map<string, SummaryLine>();
  const upperBySize = emptyCounts();
  const shortsBySize = emptyCounts();
  let upperNoSize = 0;
  let upperTotal = 0;
  let shortsTotal = 0;
  let shortNameWithoutSize = 0;

  for (const row of options.rows) {
    const pieces = row.quantity;

    if ((row.shortName ?? "").trim() !== "" && row.shortSize === null) {
      shortNameWithoutSize += 1;
    }

    if (row.shortSize !== null) {
      shortsBySize[APPAREL_SIZES.indexOf(row.shortSize)] += pieces;
      shortsTotal += pieces;
    }

    // A shorts-only row has no upper at all, so it belongs in neither the
    // grid nor the "not set" column. It is not a missing size; it is a row
    // that never had one.
    if (!row.upperIncluded) continue;

    const custom =
      row.uniformType === "custom" ? normaliseCustomName(row.customTypeName) : "";
    const key = `${row.uniformType ?? ""}|${custom}`;

    let line = lines.get(key);
    if (!line) {
      line = {
        key,
        type: row.uniformType,
        customName: row.uniformType === "custom" ? row.customTypeName : null,
        label: uniformLabel(row.uniformType, row.customTypeName),
        bySize: emptyCounts(),
        noSize: 0,
        total: 0,
      };
      lines.set(key, line);
    }

    if (row.size === null) {
      line.noSize += pieces;
      upperNoSize += pieces;
    } else {
      const index = APPAREL_SIZES.indexOf(row.size);
      line.bySize[index] += pieces;
      upperBySize[index] += pieces;
    }

    line.total += pieces;
    upperTotal += pieces;
  }

  const unencoded = [...(options.unencoded ?? [])];

  return {
    uppers: [...lines.values()].sort(compareSummaryLines),
    upperBySize,
    upperNoSize,
    upperTotal,
    shortsBySize,
    shortsTotal,
    unencoded,
    unencodedTotal: unencoded.reduce((sum, item) => sum + item.quantity, 0),
    sizeMissing: upperNoSize > 0,
    shortNameWithoutSize,
  };
}

/**
 * The owner's own order of types first, then custom uniforms alphabetically,
 * and anything with no type recorded at the bottom - it is the line that needs
 * fixing, and a list is read from the top.
 */
function compareSummaryLines(a: SummaryLine, b: SummaryLine): number {
  if (a.type === null) return b.type === null ? 0 : 1;
  if (b.type === null) return -1;

  const byType =
    UNIFORM_TYPES.indexOf(a.type) - UNIFORM_TYPES.indexOf(b.type);
  if (byType !== 0) return byType;

  return normaliseCustomName(a.customName).localeCompare(
    normaliseCustomName(b.customName),
  );
}

// ---------------------------------------------------------------------------
// The paste-in shortcut
// ---------------------------------------------------------------------------

/** One line of a pasted list, read into the shape of a row. */
export interface ParsedRow {
  playerName: string | null;
  playerNumber: string | null;
  size: ApparelSize | null;
  shortSize: ApparelSize | null;
  note: string | null;
}

export interface ParsedPaste {
  rows: ParsedRow[];
  /** Lines nothing could be read from, named so they can be fixed. */
  problems: string[];
}

/**
 * A captain's list, read into rows of the encoding table.
 *
 * A team captain still sends a list, and typing thirty names into thirty
 * little forms is how a shop ends up keeping the list on paper instead. So
 * this fills the TABLE - it does not save anything. Typing is not saving, and
 * a paste is typing.
 *
 * Each line is split on commas and each part classified rather than counted by
 * position, so all of these read correctly:
 *
 *   Dela Cruz, 7, M           name, number, upper size
 *   Reyes, L                  name, upper size
 *   Santos, 23, 2XL, M        ... and a short size, because two sizes means
 *                             the second is the shorts
 *   M                         a size on its own - a nameless piece
 *   Dela Cruz, 7, M, no logo  anything left over becomes the note
 *
 * A part that IS a size is read as one, so somebody actually called "M" comes
 * out as a size. That is said in the hint on the box rather than guessed at:
 * the alternative is a parser that sometimes ignores a size, which is worse.
 */
export function parseEncodingPaste(text: string): ParsedPaste {
  const rows: ParsedRow[] = [];
  const problems: string[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const parts = trimmed.split(",").map((part) => part.trim());

    const sizes: ApparelSize[] = [];
    const rest: string[] = [];

    for (const part of parts) {
      if (part === "") continue;
      const upper = part.toUpperCase();
      if (isApparelSize(upper) && sizes.length < 2) sizes.push(upper);
      else rest.push(part);
    }

    if (sizes.length === 0 && rest.length === 0) return;

    // The number is only read as one when it looks like one. "Reyes, captain"
    // has a captain, not player number "captain".
    const isNumber = (value: string | undefined) =>
      value !== undefined && /^\d{1,3}$/.test(value);

    const playerName = rest[0] ?? null;
    const playerNumber = isNumber(rest[1]) ? rest[1] : null;
    const leftover = rest.slice(playerNumber === null ? 1 : 2).join(", ");

    if (playerName === null && sizes.length === 0) {
      problems.push(`Line ${index + 1}: "${trimmed}" could not be read.`);
      return;
    }

    rows.push({
      playerName,
      playerNumber,
      size: sizes[0] ?? null,
      shortSize: sizes[1] ?? null,
      note: leftover === "" ? null : leftover,
    });
  });

  return { rows, problems };
}
