import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { doorViewer, isOwnerOrAdmin } from "@/lib/auth/permissions";
import {
  DIVISION_DOOR_LABELS,
  collectedTotal,
  doorVisibility,
  filterCollections,
  liveCollections,
  partialReadWarning,
  paymentKindLabel,
  seesWholeDay,
  totalsByDivision,
  type CollectionRow,
} from "@/lib/collections";
import { getCollectionsForDay } from "@/lib/data/collections";
import { getVoidRequests } from "@/lib/data/pos";
import { formatManilaDateTime, formatManilaTime } from "@/lib/datetime";
import { DIVISION_IDS, type DivisionId } from "@/lib/divisions";
import { MONEY_SOURCES, MONEY_SOURCE_LABELS, type MoneySource } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import {
  civilDateFromTimestamp,
  civilDateToISO,
  formatCivilDate,
  manilaToday,
} from "@/lib/period";

import { DecideVoidForm, RequestVoidForm } from "./SalesForms";

export const metadata = { title: "Sales · Dabz System" };

/**
 * Everything the shop collected today, from all three doors (Phase 10).
 *
 * This screen used to list counter sales only, which meant a PHP 5,000 apparel
 * down payment taken an hour ago was nowhere on the screen called "Sales" -
 * and the owner had to open three screens to find out what the day had taken.
 *
 * Row Level Security still decides what each person sees: the feed is a
 * `security_invoker` view, so a staff member with only Add sales gets their own
 * counter sales and nothing from Apparel or DabzTech. When that is what is
 * happening, the screen says so rather than letting an incomplete total read as
 * the whole day's takings.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string; method?: string }>;
}) {
  await connection();

  const [user, params] = await Promise.all([requireUser(), searchParams]);

  const division = readDivision(params.division);
  const method = readMethod(params.method);

  const today = manilaToday();
  const [read, voidRequests] = await Promise.all([
    getCollectionsForDay(today),
    getVoidRequests(),
  ]);

  const rows = read.rows;
  const readWarning = partialReadWarning(read);

  const shown = filterCollections(rows, { division, source: method });
  const byDivision = totalsByDivision(rows);

  const pending = voidRequests.filter((request) => request.status === "pending");
  const canDecide = isOwnerOrAdmin(user);

  /*
    Which doors this person can see at all. Without this the totals strip would
    show "Apparel PHP 0.00" to a counter assistant who simply is not allowed to
    know, and a zero is a claim - it says no apparel money came in today.

    This mirrors the policies on apparel_payments and repair_payments rather
    than deciding anything: the rows are already gone by the time they reach
    here. It only changes whether the screen shows a figure or explains a gap.
  */
  /*
    How much of each door this person actually sees. The rule is in
    `doorVisibility` so this screen, the Overview card and the End of day
    action cannot drift apart - "own" is the case that used to be printed as
    if it were "all".
  */
  const viewer = doorViewer(user);
  const visibleDivisions = DIVISION_IDS.filter(
    (id) => doorVisibility(id, viewer) !== "none",
  );
  const hiddenDivisions = DIVISION_IDS.filter(
    (id) => doorVisibility(id, viewer) === "none",
  );
  const counterIsOwnSalesOnly = doorVisibility("printshoppe", viewer) === "own";
  const wholeDayShown = seesWholeDay(viewer) && !readWarning;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Sales</h1>
        <p className="mt-2 text-muted">
          {formatCivilDate(today)} &middot; everything taken at the counter, on a
          job order and on a repair ticket
          {canDecide ? "" : " that you are allowed to see"}
        </p>
      </div>

      {canDecide && pending.length > 0 ? (
        <Card
          title={`Void requests waiting (${pending.length})`}
          description="A staff member thinks one of these sales was a mistake. Nothing changes until you decide."
        >
          <ul className="space-y-5">
            {pending.map((request) => {
              const sale = rows.find(
                (entry) =>
                  entry.kind === "counter_sale" && entry.id === request.saleId,
              );
              return (
                <li
                  key={request.id}
                  className="border-t border-line/60 pt-4 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {sale ? sale.reference : "Sale"}{" "}
                      {sale ? `· ${formatPesos(sale.amountCentavos)}` : ""}
                    </span>
                    <span className="text-xs text-muted">
                      {formatManilaDateTime(request.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{request.reason}</p>
                  <div className="mt-3">
                    <DecideVoidForm requestId={request.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card title="Collected today">
        <p className="text-4xl font-semibold tracking-tight">
          {formatPesos(collectedTotal(rows))}
        </p>

        {/*
          One figure per door. Stacked on a phone, three across from `sm` up -
          the tablet-portrait width where a two-column grid would strand the
          third figure on a line of its own.
        */}
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {visibleDivisions.map((id) => (
            <div key={id}>
              <dt className="text-xs font-medium text-muted">
                {DIVISION_DOOR_LABELS[id]}
                {id === "printshoppe" && counterIsOwnSalesOnly
                  ? " (your sales)"
                  : ""}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {formatPesos(byDivision[id])}
              </dd>
            </div>
          ))}
        </dl>

        {readWarning ? (
          <p className="mt-5 flex items-start gap-1.5 text-xs text-attention">
            <span aria-hidden="true">{"⚠"}</span>
            <span>{readWarning}</span>
          </p>
        ) : null}

        {!wholeDayShown && !readWarning ? (
          <p className="mt-5 flex items-start gap-1.5 text-xs text-attention">
            <span aria-hidden="true">{"⚠"}</span>
            <span>
              Part of today is missing from this figure.{" "}
              {[
                counterIsOwnSalesOnly
                  ? "Only the counter sales you rang up yourself are shown"
                  : null,
                hiddenDivisions.length > 0
                  ? `${hiddenDivisions
                      .map((id) => DIVISION_DOOR_LABELS[id])
                      .join(" and ")} money is not shown to your account`
                  : null,
              ]
                .filter(Boolean)
                .join(", and ")}
              , so this is what you can see rather than what the shop took.
            </span>
          </p>
        ) : null}

        {liveCollections(rows).length !== rows.length ? (
          <p className="mt-3 text-xs text-muted">
            {rows.length - liveCollections(rows).length} voided{" "}
            {rows.length - liveCollections(rows).length === 1 ? "row is" : "rows are"}{" "}
            listed below and counted in none of these figures.
          </p>
        ) : null}
      </Card>

      <Card title="Show">
        <div className="space-y-4">
          <Chips
            legend="Which door"
            current={division}
            options={[
              { value: "all", label: "All" },
              ...visibleDivisions.map((id) => ({
                value: id,
                label: DIVISION_DOOR_LABELS[id],
              })),
            ]}
            hrefFor={(value) => filterHref({ division: value, method })}
          />
          <Chips
            legend="Paid with"
            current={method}
            options={[
              { value: "all", label: "All" },
              ...MONEY_SOURCES.map((source) => ({
                value: source,
                label:
                  source === "cash_drawer" ? "Cash" : MONEY_SOURCE_LABELS[source],
              })),
            ]}
            hrefFor={(value) => filterHref({ division, method: value })}
          />
        </div>
      </Card>

      <Card
        title={`${shown.length} ${shown.length === 1 ? "payment" : "payments"}`}
        description={
          division === "all" && method === "all"
            ? undefined
            : `Filtered. ${formatPesos(collectedTotal(shown))} of the day's total.`
        }
      >
        {shown.length === 0 ? (
          <p className="text-sm text-muted">
            {rows.length === 0 ? (
              <>
                Nothing has been taken yet today.{" "}
                <Link href="/pos" className={`underline ${TAP_AREA}`}>
                  Open the counter
                </Link>
                .
              </>
            ) : (
              <>
                Nothing matches that filter.{" "}
                <Link href="/sales" className={`underline ${TAP_AREA}`}>
                  Show everything
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {shown.map((row) => (
              <CollectionLine
                key={`${row.kind}:${row.id}`}
                row={row}
                voidRequested={voidRequests.some(
                  (request) =>
                    request.saleId === row.id && request.status === "pending",
                )}
                canDecide={canDecide}
              />
            ))}
          </ul>
        )}
      </Card>

      {!canDecide ? (
        <Notice tone="info" title="You cannot undo a payment yourself">
          <p>
            That is on purpose. If a counter sale was a mistake, ask to void it
            and the owner decides. An apparel or repair payment is voided from
            its own order or ticket, by the owner. Everything stands until then,
            so the books never disagree with the drawer.
          </p>
        </Notice>
      ) : null}
    </div>
  );
}

/** One money event. Voided rows stay, struck through, and count for nothing. */
function CollectionLine({
  row,
  voidRequested,
  canDecide,
}: {
  row: CollectionRow;
  voidRequested: boolean;
  canDecide: boolean;
}) {
  const voided = row.voidedAt !== null;
  /*
    A payment entered the morning after it was handed over is worth saying, and
    saying only when it is true. Both sides are Manila dates: comparing the
    typed date to the UTC half of the timestamp would call every evening
    payment backdated.
  */
  const backdated =
    row.recordedForISO !== civilDateToISO(civilDateFromTimestamp(row.takenAt));

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className={voided ? "opacity-60" : ""}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-lg font-semibold tracking-tight ${
                voided ? "line-through" : ""
              }`}
            >
              {formatPesos(row.amountCentavos)}
            </span>
            <Tag tone={row.division === "printshoppe" ? "neutral" : "accent"}>
              {DIVISION_DOOR_LABELS[row.division]}
            </Tag>
            <Tag>{paymentKindLabel(row)}</Tag>
            <Tag>
              {row.source === "cash_drawer"
                ? "Cash"
                : MONEY_SOURCE_LABELS[row.source]}
            </Tag>
            {voided ? <Tag tone="attention">{"⚠"} Voided</Tag> : null}
            {voidRequested && !voided ? (
              <Tag tone="attention">Void requested</Tag>
            ) : null}
          </div>

          <p className="mt-1 text-sm">
            {row.reference}
            {row.customerName ? ` · ${row.customerName}` : " · Walk-in"}
          </p>

          <p className="mt-0.5 text-xs text-muted">
            {formatManilaTime(row.takenAt)}
            {row.takenBy ? ` · ${row.takenBy}` : ""}
            {row.referenceNumber ? ` · Ref ${row.referenceNumber}` : ""}
            {backdated ? ` · recorded for ${row.recordedForISO}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Link href={row.href} className={`text-sm underline ${TAP_AREA}`}>
            {row.kind === "counter_sale" ? "Receipt" : "Open"}
          </Link>
          {/*
            Only a counter sale has a void REQUEST. Apparel and DabzTech
            payments are voided by the owner from the order or the ticket -
            building a second path to the same void is how two of them end up
            disagreeing.
          */}
          {row.kind === "counter_sale" && !voided && !voidRequested && !canDecide ? (
            <RequestVoidForm saleId={row.id} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** A row of filter pills. Links, so a filter survives a refresh and can be shared. */
function Chips({
  legend,
  current,
  options,
  hrefFor,
}: {
  legend: string;
  current: string;
  options: { value: string; label: string }[];
  hrefFor: (value: string) => string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{legend}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === current;
          return (
            <Link
              key={option.value}
              href={hrefFor(option.value)}
              aria-current={active ? "true" : undefined}
              /*
                py-2 with text-sm measures well over the 24px the design rules
                ask for, so these need no TAP_AREA: the padding is already on
                the pill itself.
              */
              className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors ${
                active
                  ? "bg-accent text-on-accent ring-accent"
                  : "bg-ink/5 text-ink ring-line hover:bg-ink/10"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function filterHref(filter: { division: string; method: string }): string {
  const query = new URLSearchParams();
  if (filter.division !== "all") query.set("division", filter.division);
  if (filter.method !== "all") query.set("method", filter.method);
  const search = query.toString();
  return search === "" ? "/sales" : `/sales?${search}`;
}

function readDivision(value: string | undefined): DivisionId | "all" {
  return (DIVISION_IDS as readonly string[]).includes(value ?? "")
    ? (value as DivisionId)
    : "all";
}

function readMethod(value: string | undefined): MoneySource | "all" {
  return (MONEY_SOURCES as readonly string[]).includes(value ?? "")
    ? (value as MoneySource)
    : "all";
}
