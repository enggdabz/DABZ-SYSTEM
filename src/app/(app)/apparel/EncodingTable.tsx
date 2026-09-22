"use client";

/**
 * The encoding table: one row per person on a project (Phase 13).
 *
 * "It is a team project, so everyone can have their own name, size and so on."
 *
 * WHAT MAKES THIS DIFFERENT FROM AN ORDINARY FORM
 *
 * It is for encoding fifteen to thirty people quickly, from a list somebody is
 * reading out or a message a team captain sent. So the whole table is held
 * here and saved in ONE go: add a row, duplicate the row above, remove a row,
 * tab and enter through the cells without ever reaching for the mouse.
 *
 * TYPING IS NOT SAVING, AND THE TABLE SAYS SO - the same pattern as the
 * production report's benches. The button counts the changes waiting in it and
 * a ⚠ sits beside it until they land. A table that looks filled in while
 * nothing has reached the database is how a team gets cut wrong.
 *
 * NOTHING IS GUESSED. The price box is PRE-FILLED from the price list plus the
 * size add-on, and what is saved is the figure in the box - so next month's
 * price rise cannot rewrite this project. A pre-fill only ever fills an EMPTY
 * box: a figure somebody typed, and a figure carried over from a project
 * written before Phase 13, are never overwritten by one the system worked out.
 *
 * Eight columns do not fit a phone, so below a wide screen each row is a card
 * with its own labels - never a sideways scroll, which is how a size gets
 * typed into the wrong column.
 */
import Link from "next/link";
import { useActionState, useRef, useState, type KeyboardEvent } from "react";

import { Button, Disclosure, Notice, TAP_AREA, buttonClasses } from "@/components/ui";
import { centavosToDecimalString, formatPesos, parsePesos } from "@/lib/money";
import {
  APPAREL_SIZES,
  UNIFORM_TYPES,
  UNIFORM_TYPE_LABELS,
  parseEncodingPaste,
  summariseUniforms,
  type ApparelSize,
  type EncodedRow,
  type UnencodedItem,
  type UniformType,
} from "@/lib/uniforms";

import { saveEncodingAction, type ApparelState } from "./actions";
import { UniformSummaryGrids } from "./UniformSummary";

/** A row as it sits on the screen: every box is text until it is saved. */
interface Draft {
  /** Stable across re-renders, so a row keeps its focus while it is edited. */
  key: string;
  /** Null on a row that has never been saved. */
  id: string | null;
  uniformType: UniformType | "";
  customTypeName: string;
  playerName: string;
  playerNumber: string;
  size: ApparelSize | "";
  /** False on a shorts-only row - chosen in the size box, not a stray tick. */
  upperIncluded: boolean;
  shortSize: ApparelSize | "";
  shortName: string;
  /** In pesos, as typed. Empty means nobody has priced this row. */
  price: string;
  note: string;
  quantity: string;
}

/** The marker in the size list that means "this person gets shorts only". */
const SHORTS_ONLY = "__shorts_only__";

let counter = 0;
const nextKey = () => `draft-${(counter += 1)}`;

export interface EncodingTableProps {
  orderId: string;
  /** What the database says. Save is measured against this. */
  rows: readonly EncodedRow[];
  /** What each row's item charges each, for a row with no price of its own. */
  itemPriceByLine: Record<string, number>;
  /** The price list, tagged by uniform type. Null where nobody has tagged one. */
  priceByType: Partial<Record<UniformType, number | null>>;
  /** What each size adds. Null where the owner has not said - never zero. */
  sizeExtras: Partial<Record<ApparelSize, number | null>>;
  /** Pieces on an item with no rows, for the summary to report honestly. */
  unencoded: readonly UnencodedItem[];
  /** A cancelled project keeps its people exactly as they were. */
  readOnly?: boolean;
}

export function EncodingTable({
  orderId,
  rows,
  itemPriceByLine,
  priceByType,
  sizeExtras,
  unencoded,
  readOnly = false,
}: EncodingTableProps) {
  const [state, submit, pending] = useActionState<ApparelState, FormData>(
    saveEncodingAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  /*
    `savedKey` is how the table comes back into step after a save: the screen
    re-reads the rows and hands them down, this notices what was saved has
    moved, and the drafts are reset to the database's answer. The same shape as
    the production report's benches - adjusting state during a render is
    React's own answer to "a prop changed", and a remount by key would throw
    away the message the save just produced.
  */
  const savedKey = rows.map(signatureOfSaved).join("||");
  const [lastSaved, setLastSaved] = useState(savedKey);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    rows.map((row) => toDraft(row, itemPriceByLine[row.lineId] ?? 0)),
  );

  if (lastSaved !== savedKey) {
    setLastSaved(savedKey);
    setDrafts(rows.map((row) => toDraft(row, itemPriceByLine[row.lineId] ?? 0)));
  }

  const changes = countChanges(drafts, rows, itemPriceByLine);

  // ---- editing ----------------------------------------------------------

  const update = (key: string, patch: Partial<Draft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  };

  /**
   * A pre-fill only ever fills an EMPTY box.
   *
   * The price list plus the size add-on is a suggestion; the figure in the box
   * is the promise. Overwriting a typed figure - or one carried over from a
   * project written before Phase 13 - would rewrite what a customer agreed to.
   */
  const suggestPrice = (draft: Draft, next: Partial<Draft>): Partial<Draft> => {
    /*
      And never while somebody is IN the price box. Without this, clearing a
      price re-filled it from the price list on the next keystroke and the box
      could not be emptied at all - which is the one thing a row with no price
      needs to be able to say.
    */
    if ("price" in next) return next;

    const merged = { ...draft, ...next };
    if (merged.price.trim() !== "") return next;

    const base = merged.uniformType ? priceByType[merged.uniformType] : null;
    if (base === null || base === undefined) return next;

    const extra = merged.size ? sizeExtras[merged.size] ?? 0 : 0;
    return { ...next, price: centavosToDecimalString(base + extra) };
  };

  const addRow = (after?: Draft) => {
    // A new row starts with the type of the row above it: a team is one type
    // at a time, and choosing Jersey thirty times is thirty chances to slip.
    const above = after ?? drafts[drafts.length - 1];
    const fresh = blankDraft(above?.uniformType ?? "", above?.customTypeName ?? "");

    setDrafts((current) => {
      const filled = { ...fresh, ...suggestPrice(fresh, {}) };
      if (!after) return [...current, filled];
      const at = current.findIndex((draft) => draft.key === after.key);
      return [...current.slice(0, at + 1), filled, ...current.slice(at + 1)];
    });
  };

  const duplicate = (draft: Draft) => {
    /*
      Everything except the name, the number and the short name - the three
      things that are never the same twice. Duplicating those would have
      somebody deleting them on every row, and a name left behind by mistake
      goes on a shirt.
    */
    setDrafts((current) => {
      const at = current.findIndex((entry) => entry.key === draft.key);
      const copy: Draft = {
        ...draft,
        key: nextKey(),
        id: null,
        playerName: "",
        playerNumber: "",
        shortName: "",
      };
      return [...current.slice(0, at + 1), copy, ...current.slice(at + 1)];
    });
  };

  const remove = (draft: Draft) => {
    setDrafts((current) => current.filter((entry) => entry.key !== draft.key));
  };

  const addParsed = (text: string) => {
    const { rows: parsed } = parseEncodingPaste(text);
    if (parsed.length === 0) return 0;

    const last = drafts[drafts.length - 1];
    const type = last?.uniformType ?? "";
    const customName = last?.customTypeName ?? "";

    setDrafts((current) => [
      ...current,
      ...parsed.map((entry) => {
        const draft: Draft = {
          ...blankDraft(type, customName),
          playerName: entry.playerName ?? "",
          playerNumber: entry.playerNumber ?? "",
          size: entry.size ?? "",
          shortSize: entry.shortSize ?? "",
          note: entry.note ?? "",
        };
        return { ...draft, ...suggestPrice(draft, {}) };
      }),
    ]);

    return parsed.length;
  };

  // ---- moving through the cells without the mouse -----------------------

  /**
   * Enter moves down the column; shift+Enter moves up it.
   *
   * Down the COLUMN rather than along the row, because that is how a list is
   * read out: thirty names, then thirty sizes. Tab still moves along the row,
   * so both ways of working are there. On the last row, Enter adds one - a
   * list rarely ends where somebody guessed it would.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number, field: string) => {
    if (event.key !== "Enter") return;
    // Enter must never submit: half a team encoded and saved by accident is
    // worse than no shortcut at all.
    event.preventDefault();

    const step = event.shiftKey ? -1 : 1;
    const target = index + step;

    if (target < 0) return;
    if (target >= drafts.length) {
      if (event.shiftKey) return;
      addRow();
    }

    // After the state change, so the new row is on the page to be focused.
    requestAnimationFrame(() => {
      const next = formRef.current?.querySelector<HTMLElement>(
        `[data-cell="${target}:${field}"]`,
      );
      next?.focus();
      if (next instanceof HTMLInputElement) next.select();
    });
  };

  // ---- what the table says right now ------------------------------------

  // Whole centavos, added up the same way the server will add them up: a
  // preview of the figure, never the record of it (see `orderTotals`).
  const tableTotal = drafts.reduce((total, entry) => {
    const parsed = priceOf(entry);
    return total + (parsed === null ? 0 : parsed.centavos * pieces(entry));
  }, 0);

  const summary = summariseUniforms({
    rows: drafts.map(toEncodedForSummary),
    unencoded,
  });

  const problems = drafts.filter((entry) => priceOf(entry) === null).length;

  return (
    <div className="space-y-5">
      <form action={submit} ref={formRef}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="rows" value={JSON.stringify(drafts.map(toPayload))} />

        {drafts.length === 0 ? (
          <Notice tone="info" title="Nobody is encoded on this project yet">
            Add a row for each person, or paste the list the team sent.
          </Notice>
        ) : (
          <div className="space-y-3">
            <HeaderRow />
            {drafts.map((entry, index) => (
              <Row
                key={entry.key}
                draft={entry}
                index={index}
                readOnly={readOnly}
                itemPrice={entry.id === null ? 0 : itemPriceByLine[lineOf(rows, entry.id)] ?? 0}
                onChange={(patch) => update(entry.key, suggestPrice(entry, patch))}
                onKeyDown={onKeyDown}
                onDuplicate={() => duplicate(entry)}
                onRemove={() => remove(entry)}
                onAddBelow={() => addRow(entry)}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {readOnly ? null : (
            <>
              <Button type="button" variant="secondary" onClick={() => addRow()}>
                Add a row
              </Button>

              <Button type="submit" disabled={pending || changes === 0}>
                {pending
                  ? "Saving..."
                  : changes === 0
                    ? "Saved"
                    : `Save ${changes} change${changes === 1 ? "" : "s"}`}
              </Button>

              {changes > 0 && !pending ? (
                <span className="text-xs text-attention">
                  <span aria-hidden="true">{"⚠"} </span>
                  Not saved yet
                </span>
              ) : null}
            </>
          )}

          {/*
            The hard copy, reachable from where the encoding actually happens
            rather than only from the top of the screen.

            IT IS OFF WHILE ANYTHING IS UNSAVED, and that is the whole reason
            it needed building rather than just linking. The sheet is drawn on
            the server from what is SAVED, so printing it with five people
            still sitting in this table would hand somebody a list that is
            missing five shirts - and nothing on the paper would say so. A
            person cuts from that paper. The button says what to do instead,
            which is the same instinct as a total that adds up its own rows.
          */}
          {changes > 0 ? (
            <Button type="button" variant="secondary" disabled>
              Save first to print
            </Button>
          ) : (
            <Link
              href={`/apparel/${orderId}/sheet`}
              className={buttonClasses("secondary")}
            >
              Print the job order
            </Link>
          )}

          <span className="text-sm text-muted">
            {summary.upperTotal + summary.shortsTotal === 0
              ? "Nothing on the table"
              : `${summary.upperTotal} upper${
                  summary.upperTotal === 1 ? "" : "s"
                } · ${summary.shortsTotal} short${
                  summary.shortsTotal === 1 ? "" : "s"
                } · ${formatPesos(tableTotal)}`}
          </span>
        </div>

        {readOnly ? (
          <p className="mt-3 text-xs text-muted">
            This project was cancelled, so its people are kept as they were.
          </p>
        ) : null}

        {problems > 0 ? (
          <div className="mt-3">
            <Notice
              tone="attention"
              title={`${problems} price${problems === 1 ? "" : "s"} could not be read`}
            >
              Enter an amount like 650, or leave the box empty - an empty box is
              a row nobody has priced, which is a real state and is marked as
              one.
            </Notice>
          </div>
        ) : null}

        {state.error ? (
          <div className="mt-3">
            <Notice tone="attention" title={state.error} />
          </div>
        ) : null}
        {state.success ? (
          <div className="mt-3">
            <Notice tone="success" title={state.success} />
          </div>
        ) : null}
      </form>

      {!readOnly ? <PasteBox onAdd={addParsed} /> : null}

      <UniformSummaryGrids
        summary={summary}
        unsaved={changes > 0}
        title="What is being made"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------

/**
 * The grid every row and the header share.
 *
 * BELOW 1360px A ROW IS A CARD: each box keeps its own label and they wrap.
 * Nine columns on a 390px phone would be a sideways scroll, and a sideways
 * scroll is how a size gets typed into the short size box.
 *
 * `wide` is 85rem (1360px at the usual font size), declared in globals.css,
 * and the number came from measuring rather than from taste. The rail is 15rem
 * and the page is capped at 72rem, so the room a row actually gets is
 * `min(viewport - 15rem, 72rem) - 6rem`. At Tailwind's `xl` that is 59rem
 * against a row that wants 60.75rem - four pixels of slack at the default font
 * size and an overflow at any larger one. At 85rem it is 64rem. A laptop at
 * 1366 gets the table; a narrower screen gets the cards, which lose nothing
 * but height.
 */
const GRID =
  "grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 " +
  "wide:grid-cols-[8.5rem_3.25rem_minmax(6.5rem,1.4fr)_3.5rem_5.5rem_5.5rem_minmax(5.5rem,1fr)_6rem_minmax(5.5rem,1.2fr)_6.5rem] " +
  "wide:items-start wide:gap-x-2 wide:gap-y-0";

function HeaderRow() {
  const heads = [
    "Type",
    "Pcs",
    "Name",
    "No.",
    "Size",
    "Short size",
    "Short name",
    "Price",
    "Notes",
    "",
  ];

  return (
    <div className={`${GRID} hidden wide:grid`} aria-hidden="true">
      {heads.map((head, index) => (
        <span key={index} className="text-xs font-medium text-muted">
          {head}
        </span>
      ))}
    </div>
  );
}

/** A box with its own label below `xl`, and a bare cell at `xl` and up. */
function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-xs font-medium text-muted wide:hidden">{label}</span>
      <span className="mt-0.5 block wide:mt-0">{children}</span>
    </label>
  );
}

const BOX =
  "w-full rounded-control bg-surface-sunken px-2 py-1.5 text-sm text-ink ring-1 ring-line " +
  "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50";

function Row({
  draft,
  index,
  readOnly,
  itemPrice,
  onChange,
  onKeyDown,
  onDuplicate,
  onRemove,
  onAddBelow,
}: {
  draft: Draft;
  index: number;
  readOnly: boolean;
  itemPrice: number;
  onChange: (patch: Partial<Draft>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, index: number, field: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddBelow: () => void;
}) {
  const price = priceOf(draft);
  const badPrice = price === null;
  const noPrice = price !== null && draft.price.trim() === "" && itemPrice <= 0;

  const sizeValue = draft.upperIncluded ? draft.size : SHORTS_ONLY;

  return (
    <fieldset
      disabled={readOnly}
      className={`${GRID} rounded-card p-3 ring-1 ring-line/60 wide:rounded-none wide:p-0 wide:ring-0`}
    >
      <legend className="sr-only">
        Row {index + 1}
        {draft.playerName ? `: ${draft.playerName}` : ""}
      </legend>

      <Cell label="Type of uniform" className="col-span-2 sm:col-span-1">
        <select
          className={BOX}
          data-cell={`${index}:type`}
          value={draft.uniformType}
          onChange={(event) =>
            onChange({ uniformType: event.target.value as UniformType | "" })
          }
          onKeyDown={(event) => onKeyDown(event, index, "type")}
        >
          <option value="">Choose...</option>
          {UNIFORM_TYPES.map((type) => (
            <option key={type} value={type}>
              {UNIFORM_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {/* Custom opens a box to type the uniform in, exactly as asked for. */}
        {draft.uniformType === "custom" ? (
          <input
            className={`${BOX} mt-1`}
            data-cell={`${index}:customName`}
            placeholder="What is it?"
            value={draft.customTypeName}
            onChange={(event) => onChange({ customTypeName: event.target.value })}
            onKeyDown={(event) => onKeyDown(event, index, "customName")}
          />
        ) : null}
      </Cell>

      <Cell label="Pieces">
        <input
          className={BOX}
          data-cell={`${index}:quantity`}
          inputMode="numeric"
          value={draft.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, index, "quantity")}
        />
      </Cell>

      <Cell label="Name" className="col-span-2 sm:col-span-2 wide:col-span-1">
        <input
          className={BOX}
          data-cell={`${index}:name`}
          value={draft.playerName}
          placeholder="e.g. Dela Cruz"
          onChange={(event) => onChange({ playerName: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, index, "name")}
        />
      </Cell>

      <Cell label="Jersey number">
        <input
          className={BOX}
          data-cell={`${index}:number`}
          inputMode="numeric"
          value={draft.playerNumber}
          onChange={(event) => onChange({ playerNumber: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, index, "number")}
        />
      </Cell>

      <Cell label="Size">
        <select
          className={BOX}
          data-cell={`${index}:size`}
          value={sizeValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value === SHORTS_ONLY) onChange({ upperIncluded: false, size: "" });
            else onChange({ upperIncluded: true, size: value as ApparelSize | "" });
          }}
          onKeyDown={(event) => onKeyDown(event, index, "size")}
        >
          <option value="">Not set</option>
          {APPAREL_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value={SHORTS_ONLY}>Shorts only</option>
        </select>
      </Cell>

      <Cell label="Short size">
        <select
          className={BOX}
          data-cell={`${index}:shortSize`}
          value={draft.shortSize}
          onChange={(event) =>
            onChange({ shortSize: event.target.value as ApparelSize | "" })
          }
          onKeyDown={(event) => onKeyDown(event, index, "shortSize")}
        >
          <option value="">None</option>
          {APPAREL_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </Cell>

      <Cell label="Short name">
        <input
          className={BOX}
          data-cell={`${index}:shortName`}
          value={draft.shortName}
          onChange={(event) => onChange({ shortName: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, index, "shortName")}
        />
      </Cell>

      <Cell label="Price">
        <input
          className={BOX}
          data-cell={`${index}:price`}
          inputMode="decimal"
          value={draft.price}
          placeholder="e.g. 650"
          onChange={(event) => onChange({ price: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, index, "price")}
        />
      </Cell>

      <Cell label="Notes / remarks" className="col-span-2 sm:col-span-3 wide:col-span-1">
        <input
          className={BOX}
          data-cell={`${index}:note`}
          value={draft.note}
          onChange={(event) => onChange({ note: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, index, "note")}
        />
      </Cell>

      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-1 wide:pt-1.5">
        <button
          type="button"
          onClick={onDuplicate}
          className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={`text-xs text-muted underline hover:text-ink ${TAP_AREA}`}
        >
          Remove
        </button>
        <button
          type="button"
          onClick={onAddBelow}
          className={`text-xs text-muted underline hover:text-ink wide:hidden ${TAP_AREA}`}
        >
          Add below
        </button>
      </div>

      {/*
        Warnings carry an icon and words, never colour alone (spec 3.2). They
        sit under the row rather than inside a cell, so a card on a phone and a
        line on a desktop read the same way.
      */}
      {badPrice || noPrice || (draft.shortName.trim() !== "" && draft.shortSize === "") ? (
        <p className="col-span-2 text-xs text-attention sm:col-span-4 wide:col-span-10">
          <span aria-hidden="true">{"⚠"} </span>
          {badPrice
            ? "That price could not be read."
            : noPrice
              ? "Nobody has priced this row, so it adds nothing to the project."
              : "A short name with no short size - no shorts are counted for this row."}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// The paste-in shortcut
// ---------------------------------------------------------------------------

function PasteBox({ onAdd }: { onAdd: (text: string) => number }) {
  const [text, setText] = useState("");
  const [added, setAdded] = useState<number | null>(null);

  return (
    <Disclosure label="Paste a list">
      <div className="space-y-3 rounded-card bg-surface-sunken p-4 ring-1 ring-line/60">
        <label className="block">
          <span className="text-sm font-medium">The list the team sent</span>
          <span className="mt-0.5 block text-xs text-muted">
            One person per line: name, number, size. A second size is read as
            the short size, and anything left over becomes the note. Nothing is
            saved until you press Save above.
          </span>
          <textarea
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"Dela Cruz, 7, M\nReyes, 10, L\nSantos, 23, 2XL, M"}
            className="mt-1.5 w-full rounded-control bg-surface px-3 py-2 font-mono text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const count = onAdd(text);
              setAdded(count);
              if (count > 0) setText("");
            }}
          >
            Put them on the table
          </Button>
          {added !== null ? (
            <span className="text-sm text-muted">
              {added === 0
                ? "Nothing could be read from that."
                : `${added} row${added === 1 ? "" : "s"} added to the table - check them, then Save.`}
            </span>
          ) : null}
        </div>
      </div>
    </Disclosure>
  );
}

// ---------------------------------------------------------------------------
// Drafts in and out
// ---------------------------------------------------------------------------

function blankDraft(type: UniformType | "", customName: string): Draft {
  return {
    key: nextKey(),
    id: null,
    uniformType: type,
    customTypeName: type === "custom" ? customName : "",
    playerName: "",
    playerNumber: "",
    size: "",
    upperIncluded: true,
    shortSize: "",
    shortName: "",
    price: "",
    note: "",
    quantity: "1",
  };
}

/**
 * A saved row, in the boxes.
 *
 * The price box carries what the row actually costs TODAY - its own price, or
 * what its item charges each plus its copied size add-on. That is what makes
 * encoding a project written before Phase 13 safe: saving without touching the
 * price stores the same figure it was already being totalled at, to the
 * centavo. A row nobody has priced at all stays empty, and is warned about.
 */
function toDraft(row: EncodedRow, itemPrice: number): Draft {
  const effective =
    row.priceCentavos !== null ? row.priceCentavos : itemPrice + row.sizeExtraCentavos;
  const priced = row.priceCentavos !== null || itemPrice > 0 || row.sizeExtraCentavos > 0;

  return {
    key: nextKey(),
    id: row.id,
    uniformType: row.uniformType ?? "",
    customTypeName: row.customTypeName ?? "",
    playerName: row.playerName ?? "",
    playerNumber: row.playerNumber ?? "",
    size: row.size ?? "",
    upperIncluded: row.upperIncluded,
    shortSize: row.shortSize ?? "",
    shortName: row.shortName ?? "",
    price: priced ? centavosToDecimalString(effective) : "",
    note: row.note ?? "",
    quantity: String(row.quantity),
  };
}

function toPayload(draft: Draft) {
  return {
    id: draft.id,
    uniformType: draft.uniformType,
    customTypeName: draft.customTypeName,
    playerName: draft.playerName,
    playerNumber: draft.playerNumber,
    size: draft.size,
    shortSize: draft.shortSize,
    shortName: draft.shortName,
    price: draft.price,
    note: draft.note,
    quantity: draft.quantity,
    upperIncluded: draft.upperIncluded,
  };
}

/** The summary is counted from what is ON THE TABLE, so it follows typing. */
function toEncodedForSummary(draft: Draft): EncodedRow {
  const parsed = priceOf(draft);
  return {
    id: draft.key,
    lineId: draft.key,
    uniformType: draft.uniformType === "" ? null : draft.uniformType,
    customTypeName: draft.customTypeName || null,
    playerName: draft.playerName || null,
    playerNumber: draft.playerNumber || null,
    size: draft.size === "" ? null : draft.size,
    shortSize: draft.shortSize === "" ? null : draft.shortSize,
    shortName: draft.shortName || null,
    priceCentavos: parsed?.centavos ?? null,
    note: draft.note || null,
    quantity: pieces(draft),
    upperIncluded: draft.upperIncluded,
    sizeExtraCentavos: 0,
  };
}

/** How many pieces this row stands for. Anything unreadable counts as one. */
function pieces(draft: Draft): number {
  const value = Number(draft.quantity);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/**
 * The price in the box, in centavos - or null when it cannot be read.
 *
 * An EMPTY box is not an error: it is a row nobody has priced, which is a real
 * state. `{ centavos: 0 }` with an empty box is what the row contributes, and
 * the screen marks it.
 */
function priceOf(draft: Draft): { centavos: number } | null {
  const text = draft.price.trim();
  if (text === "") return { centavos: 0 };
  try {
    const centavos = parsePesos(text);
    return centavos < 0 ? null : { centavos };
  } catch {
    return null;
  }
}

/** Which item a saved row hangs off, so its fallback price can be found. */
function lineOf(rows: readonly EncodedRow[], id: string): string {
  return rows.find((row) => row.id === id)?.lineId ?? "";
}

/** Everything about a saved row that the table can change. */
function signatureOfSaved(row: EncodedRow): string {
  return [
    row.id,
    row.uniformType ?? "",
    row.customTypeName ?? "",
    row.playerName ?? "",
    row.playerNumber ?? "",
    row.size ?? "",
    row.shortSize ?? "",
    row.shortName ?? "",
    row.priceCentavos ?? "",
    row.note ?? "",
    row.quantity,
    row.upperIncluded,
  ].join("|");
}

function signatureOfDraft(draft: Draft, itemPrice: number): string {
  const parsed = priceOf(draft);
  // A row whose price is exactly what its item already charges is unchanged
  // only if it had no price of its own; otherwise it carries one now.
  return [
    draft.id,
    draft.uniformType,
    draft.customTypeName,
    draft.playerName,
    draft.playerNumber,
    draft.size,
    draft.shortSize,
    draft.shortName,
    parsed === null ? "?" : parsed.centavos,
    draft.note,
    pieces(draft),
    draft.upperIncluded,
    itemPrice,
  ].join("|");
}

/**
 * How many changes are waiting in the table.
 *
 * Counted rather than a plain "something changed", because the button says the
 * number and the number is what makes somebody check before pressing it.
 */
function countChanges(
  drafts: readonly Draft[],
  rows: readonly EncodedRow[],
  itemPriceByLine: Record<string, number>,
): number {
  const saved = new Map(rows.map((row) => [row.id, row]));
  let changes = 0;

  for (const draft of drafts) {
    if (draft.id === null) {
      changes += 1;
      continue;
    }
    const row = saved.get(draft.id);
    if (!row) {
      changes += 1;
      continue;
    }
    const itemPrice = itemPriceByLine[row.lineId] ?? 0;
    if (signatureOfDraft(draft, itemPrice) !== signatureOfDraft(toDraft(row, itemPrice), itemPrice)) {
      changes += 1;
    }
  }

  const stillHere = new Set(drafts.map((draft) => draft.id));
  for (const row of rows) if (!stillHere.has(row.id)) changes += 1;

  return changes;
}
