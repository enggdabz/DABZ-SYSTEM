import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getLedgerEntries, liveEntries } from "@/lib/data/money";
import { divisionName } from "@/lib/divisions";
import {
  CATEGORY_LABELS,
  MONEY_SOURCE_LABELS,
  totalsFor,
  type LedgerCategory,
  type MoneySource,
} from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { formatManilaDateTime } from "@/lib/datetime";
import {
  civilDateToISO,
  currentPeriod,
  formatPeriod,
  manilaMonthRangeUtc,
  manilaToday,
  parsePeriodKey,
} from "@/lib/period";

import { AddEntryForm, VoidEntryForm } from "./LedgerForms";

export const metadata = { title: "Money in and out · Dabz System" };

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await connection();

  const actor = await requireOwnerOrAdmin();

  const { month } = await searchParams;
  const period = parsePeriodKey(month ?? "") ?? currentPeriod();
  const range = manilaMonthRangeUtc(period);

  const entries = await getLedgerEntries({
    from: range.from,
    to: range.to,
    limit: 500,
  });

  // Voided entries stay visible but must never reach a total.
  const live = liveEntries(entries);
  const totals = totalsFor(live);
  const voidedCount = entries.length - live.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Money in and out</h1>
        <p className="mt-2 text-muted">
          Every peso that moved, for {formatPeriod(period)}. Most entries appear
          here by themselves when a bill is paid or a loan payment is recorded.
        </p>
      </div>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-muted">Income</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(totals.income)}
            </dd>
            <dd className="text-xs text-muted">Sales and services only</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Shop costs</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.expenses)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Profit</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                totals.profit < 0 ? "text-attention" : ""
              }`}
            >
              {totals.profit < 0 ? <span aria-hidden="true">{"⚠"} </span> : null}
              {formatPesos(totals.profit)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Not income</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.nonIncomeIn)}
            </dd>
            <dd className="text-xs text-muted">Borrowed money, owner capital</dd>
          </div>
        </dl>

        {totals.nonIncomeIn > 0 ? (
          <div className="mt-5">
            <Notice tone="info" title="Borrowed money is not counted as income">
              <p>
                {formatPesos(totals.nonIncomeIn)} came in this month from loans
                or your own pocket. It is real money in the drawer, but it is not
                earnings, so it is kept out of the profit figure.
              </p>
            </Notice>
          </div>
        ) : null}

        {totals.ownerWithdrawals > 0 ? (
          <p className="mt-4 text-sm text-muted">
            {formatPesos(totals.ownerWithdrawals)} was taken out by the owner
            this month. It is shown apart from the shop&apos;s costs.
          </p>
        ) : null}
      </Card>

      <Card
        title={`Entries (${entries.length})`}
        description={
          voidedCount > 0
            ? `${voidedCount} voided ${voidedCount === 1 ? "entry is" : "entries are"} shown but not counted.`
            : undefined
        }
      >
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing recorded for {formatPeriod(period)} yet. Marking a bill paid
            will add an entry here.
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {entries.map((entry) => {
              const voided = entry.voidedAt !== null;
              return (
                <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className={voided ? "opacity-60" : ""}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-lg font-semibold tracking-tight ${
                            entry.direction === "in" ? "text-success" : ""
                          } ${voided ? "line-through" : ""}`}
                        >
                          {entry.direction === "in" ? "+" : "−"}
                          {formatPesos(entry.amountCentavos)}
                        </span>
                        <Tag>
                          {CATEGORY_LABELS[entry.category as LedgerCategory] ??
                            entry.category}
                        </Tag>
                        {voided ? <Tag tone="attention">{"⚠"} Voided</Tag> : null}
                        {entry.sourceTable ? <Tag>Automatic</Tag> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {formatManilaDateTime(entry.occurredAt)} &middot;{" "}
                        {divisionName(entry.tag)} &middot;{" "}
                        {MONEY_SOURCE_LABELS[entry.source as MoneySource] ?? entry.source}
                      </p>
                      {entry.note ? (
                        <p className="mt-1 text-sm">{entry.note}</p>
                      ) : null}
                      {voided ? (
                        <p className="mt-1 text-xs text-attention">
                          Voided: {entry.voidReason}
                        </p>
                      ) : null}
                    </div>

                    {!voided ? <VoidEntryForm entryId={entry.id} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Add an entry by hand"
        description="For money the other screens do not cover yet - your own capital, a loan drawn down, or a withdrawal."
      >
        <AddEntryForm
          today={civilDateToISO(manilaToday())}
          canRecordOwnerWithdrawal={actor.role === "owner"}
        />
      </Card>
    </div>
  );
}
