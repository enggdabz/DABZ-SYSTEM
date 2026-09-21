import Link from "next/link";
import { connection } from "next/server";

import { Button, Card, Field, Input, Notice, TAP_AREA, Tag } from "@/components/ui";
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
  salesDay,
  seesWholeDay,
  totalsByDivision,
  type CollectionRow,
  type SalesDay,
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
  searchParams: Promise<{ division?: string; method?: string; on?: string }>;
}) {
  await connection();

  const [user, params] = await Promise.all([requireUser(), searchParams]);

  const division = readDivision(params.division);
  const method = readMethod(params.method);

  /*
    Which day is being shown. `on` is absent almost always, and then this is
    today - but the screen is no longer PINNED to today, which is what made an
    ordinary quiet morning look like the system had been wiped.
  */
  const today = manilaToday();
  const todayISO = civilDateToISO(today);
  const day = salesDay(params.on, today);

  const [read, voidRequests] = await Promise.all([
    getCollectionsForDay(day.date),
    getVoidRequests(),
  ]);

  const rows = read.rows;
  const readWarning = partialReadWarning(read);

  const shown = filterCollections(rows, { division, source: method });
  const byDivision = totalsByDivision(rows);

  const pending = voidRequests.filter((request) => request.status === "pending");
  const canDecide = isOwnerOrAdmin(user);

  /*
    Every link on this screen keeps the other two choices. Changing the method
    must not throw away the day the person navigated to, and picking a day must
    not silently clear a filter - either one reads as the screen forgetting.
  */
  const hrefFor = (over: {
    dayISO?: string;
    division?: string;
    method?: string;
  }): string =>
    salesHref({
      dayISO: over.dayISO ?? day.iso,
      todayISO,
      division: over.division ?? division,
      method: over.method ?? method,
    });

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
          {formatCivilDate(day.date)} &middot; everything taken at the counter, on
          a job order and on a repair ticket
          {canDecide ? "" : " that you are allowed to see"}
        </p>
      </div>

      {/*
        Which day.

        The screen had none of this. It read today and only today, so at nine in
        the morning every figure on it was PHP 0.00 with no way to look at the
        day that had just ended - which is indistinguishable, from the outside,
        from the shop's takings having been wiped.
      */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={hrefFor({ dayISO: civilDateToISO(day.previous) })}
              className="rounded-control bg-ink/5 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ink/10"
            >
              {"←"} {formatCivilDate(day.previous)}
            </Link>
            {/*
              No forward arrow on today: tomorrow cannot have taken anything,
              and a button that leads nowhere is tapped once and trusted less
              afterwards.
            */}
            {day.next ? (
              <Link
                href={hrefFor({ dayISO: civilDateToISO(day.next) })}
                className="rounded-control bg-ink/5 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ink/10"
              >
                {formatCivilDate(day.next)} {"→"}
              </Link>
            ) : null}
          </div>
          {day.isToday ? null : (
            <Link
              href={hrefFor({ dayISO: todayISO })}
              className={`text-sm text-muted underline ${TAP_AREA}`}
            >
              Back to today
            </Link>
          )}
        </div>

        {/*
          A plain GET form, so a week ago is one tap rather than seven. The two
          filters ride along as hidden fields - picking a day must not quietly
          undo the door or the method the person had chosen.
        */}
        <form action="/sales" method="get" className="mt-4 flex flex-wrap items-end gap-2">
          {division === "all" ? null : (
            <input type="hidden" name="division" value={division} />
          )}
          {method === "all" ? null : (
            <input type="hidden" name="method" value={method} />
          )}
          <div className="w-44">
            <Field label="Go to a day">
              <Input type="date" name="on" defaultValue={day.iso} max={todayISO} />
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </form>
      </Card>

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
                      {sale
                        ? `${sale.reference} · ${formatPesos(sale.amountCentavos)}`
                        : "Sale not shown on this day"}
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

      <Card
        title={
          day.isToday
            ? "Collected today"
            : `Collected on ${formatCivilDate(day.date)}`
        }
      >
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
              Part of this day is missing from this figure.{" "}
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
            hrefFor={(value) => hrefFor({ division: value })}
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
            hrefFor={(value) => hrefFor({ method: value })}
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
          readWarning ? (
            <p className="flex items-start gap-1.5 text-sm text-attention">
              <span aria-hidden="true">{"⚠"}</span>
              <span>{readWarning}</span>
            </p>
          ) : rows.length === 0 ? (
            <EmptyDay day={day} canOpenReports={canDecide} />
          ) : (
            <p className="text-sm text-muted">
              Nothing matches that filter.{" "}
              <Link
                href={hrefFor({ division: "all", method: "all" })}
                className={`underline ${TAP_AREA}`}
              >
                Show everything
              </Link>
              .
            </p>
          )
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

/**
 * A day with nothing on it.
 *
 * Three different states, and wording them as one is what caused the alarm
 * this screen was fixed for. Today may simply be early. A past day may
 * genuinely have taken nothing. A day in the future cannot have taken
 * anything at all, and saying "nothing was taken" about it would be a claim
 * about the shop rather than about the calendar.
 *
 * The second paragraph is the one that matters. PHP 0.00 across a screen
 * called "Sales" reads as lost money unless something says out loud that this
 * is ONE DAY of a book that still has all its other days in it.
 */
function EmptyDay({
  day,
  canOpenReports,
}: {
  day: SalesDay;
  canOpenReports: boolean;
}) {
  return (
    <div className="text-sm text-muted">
      {day.isFuture ? (
        <p>{formatCivilDate(day.date)} has not happened yet.</p>
      ) : day.isToday ? (
        <p>
          Nothing has been taken yet today.{" "}
          <Link href="/pos" className={`underline ${TAP_AREA}`}>
            Open the counter
          </Link>
          .
        </p>
      ) : (
        <p>Nothing was taken on {formatCivilDate(day.date)}.</p>
      )}

      {day.isFuture ? null : (
        <p className="mt-2">
          This screen shows one day at a time. Takings from an earlier day are
          still there, on that day &mdash; use the arrows above to open one
          {canOpenReports ? (
            <>
              , or{" "}
              <Link href="/reports" className={`underline ${TAP_AREA}`}>
                Reports
              </Link>{" "}
              for a whole month at once
            </>
          ) : null}
          .
        </p>
      )}
    </div>
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

/**
 * The URL for a given day, door and method.
 *
 * Today carries no `on` at all, so the bare /sales URL always means today: a
 * link saved this morning still opens on the right day tomorrow, and the
 * sidebar needs no special case.
 */
function salesHref(state: {
  dayISO: string;
  todayISO: string;
  division: string;
  method: string;
}): string {
  const query = new URLSearchParams();
  if (state.dayISO !== state.todayISO) query.set("on", state.dayISO);
  if (state.division !== "all") query.set("division", state.division);
  if (state.method !== "all") query.set("method", state.method);
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
