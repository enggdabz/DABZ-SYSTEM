import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { DeleteButton } from "@/components/DeleteButton";
import { Card, Disclosure, Notice, TAP_AREA, Tag, HEADING_BOX } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  billAppliesTo,
  billStatus,
  carriedOverBills,
  compareByDueDate,
  monthTotals,
  paidKey,
  remainingFor,
  type Bill,
  type BillStatus,
} from "@/lib/bills";
import {
  getBillPayments,
  getBills,
  getBillsWithPayments,
  getLoans,
  paidKeysFrom,
  partPaidFrom,
} from "@/lib/data/money";
import { formatPesos } from "@/lib/money";
import {
  addMonths,
  currentPeriod,
  formatPeriod,
  manilaToday,
  parsePeriodKey,
  periodKey,
} from "@/lib/period";

import { deleteBillAction } from "./actions";
import {
  BillActiveForm,
  BillEditForm,
  DueDayForm,
  MarkPaidForm,
  UndoPaymentForm,
} from "./BillForms";

export const metadata = { title: "Bills · Dabz System" };

function StatusTag({ status }: { status: BillStatus }) {
  const tone =
    status.tone === "success" ? "success" : status.tone === "attention" ? "attention" : "neutral";

  return (
    <Tag tone={tone}>
      {/* A warning always carries the icon as well as the colour (spec 3.2). */}
      {status.warn ? <span aria-hidden="true" className="mr-1">{"⚠"}</span> : null}
      {status.kind === "paid" ? <span aria-hidden="true" className="mr-1">{"✓"}</span> : null}
      {status.label}
    </Tag>
  );
}

function FrequencyTag({ bill }: { bill: Bill }) {
  return bill.frequency === "one_time" ? (
    <Tag tone="neutral">One-time</Tag>
  ) : (
    <Tag tone="neutral">Monthly</Tag>
  );
}

function BillManagement({
  bill,
  loanChoices,
  defaultMonthKey,
  hasHistory,
}: {
  bill: Bill;
  loanChoices: { id: string; lender: string }[];
  defaultMonthKey: string;
  hasHistory: boolean;
}) {
  return (
    <div className="space-y-6">
      <DueDayForm billId={bill.id} dueDay={bill.dueDay} />
      <div className="border-t border-line/60 pt-4">
        <BillEditForm
          bill={{
            ...bill,
            startsMonthKey: bill.startsMonth ? periodKey(bill.startsMonth) : null,
          }}
          loans={loanChoices}
          defaultMonthKey={defaultMonthKey}
        />
      </div>
      <div className="flex flex-wrap items-start gap-3 border-t border-line/60 pt-4">
        <BillActiveForm billId={bill.id} billName={bill.name} active={bill.active} />
        <DeleteButton
          kind="bill"
          name={bill.name}
          idField="billId"
          id={bill.id}
          hasHistory={hasHistory}
          action={deleteBillAction}
        />
      </div>
    </div>
  );
}

/**
 * One bill for one month. Used for this month's bills and for the priority
 * bills carried in from earlier months, so the two can never look or pay
 * differently - a priority bill is paid against `periodKeyValue`, the month
 * it was owed in.
 */
function BillCard({
  bill,
  periodKeyValue,
  status,
  remainingCentavos,
  paid = false,
  payment,
  priorityFrom,
  loans,
  manage,
}: {
  bill: Bill;
  periodKeyValue: string;
  status: BillStatus;
  /** The bill less its part payments for this month. */
  remainingCentavos: number;
  paid?: boolean;
  payment?: { amountCentavos: number; paidOn: string; source: string };
  /** Set on a priority bill: the month it was not paid in. */
  priorityFrom?: string;
  loans: { id: string; lender: string }[];
  manage?: ReactNode;
}) {
  const partlyPaid = !paid && remainingCentavos < bill.amountCentavos;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{bill.name}</h3>
            {priorityFrom ? (
              <Tag tone="attention">
                <span aria-hidden="true" className="mr-1">{"⚠"}</span>
                Priority &middot; from {priorityFrom}
              </Tag>
            ) : null}
            <FrequencyTag bill={bill} />
            {bill.type === "loan_installment" ? (
              <Tag tone="accent">Loan installment</Tag>
            ) : null}
          </div>
          {/*
            Once part of it is paid, the card shows only what is left - the
            owner's request. The usual amount and what was paid stay below it
            in small print, so the figure can always be explained.
          */}
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatPesos(partlyPaid ? remainingCentavos : bill.amountCentavos)}
            {partlyPaid ? (
              <span className="ml-2 text-sm font-normal text-muted">remaining</span>
            ) : null}
          </p>
          {partlyPaid ? (
            <p className="text-xs text-muted">
              {formatPesos(bill.amountCentavos - remainingCentavos)} paid so far of{" "}
              {formatPesos(bill.amountCentavos)}
            </p>
          ) : null}
          <div className="mt-2">
            <StatusTag status={status} />
          </div>
          {payment ? (
            <p className="mt-2 text-xs text-muted">
              Paid {formatPesos(payment.amountCentavos)} on {payment.paidOn} from{" "}
              {payment.source.replace(/_/g, " ")}
            </p>
          ) : null}
          {bill.type === "loan_installment" ? (
            bill.loanId ? (
              <p className="mt-2 text-xs text-muted">
                Paying this also pays down{" "}
                {loans.find((loan) => loan.id === bill.loanId)?.lender ?? "its loan"}
                .{" "}
                <Link href="/loans" className={`underline ${TAP_AREA}`}>
                  See loans
                </Link>
              </p>
            ) : (
              /*
                The silent case, said out loud. An installment bill with no
                loan behind it is paid every month and reduces nothing - the
                ledger shows the money gone and the debt exactly where it was.
              */
              <p className="mt-2 flex items-start gap-1.5 text-xs text-attention">
                <span aria-hidden="true">{"⚠"}</span>
                <span>
                  Not linked to a loan, so paying it will not reduce any
                  balance. Choose the loan under Edit.
                </span>
              </p>
            )
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-3">
          {paid ? (
            <UndoPaymentForm billId={bill.id} period={periodKeyValue} />
          ) : (
            <>
              <MarkPaidForm
                billId={bill.id}
                billName={bill.name}
                period={periodKeyValue}
                amountCentavos={remainingCentavos}
              />
              {partlyPaid ? (
                <UndoPaymentForm
                  billId={bill.id}
                  period={periodKeyValue}
                  label="Undo last part payment"
                />
              ) : null}
            </>
          )}
        </div>
      </div>
      {manage}
    </Card>
  );
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await connection();

  await requireOwnerOrAdmin();

  const { month } = await searchParams;
  const period = parsePeriodKey(month ?? "") ?? currentPeriod();
  const today = manilaToday();

  const [bills, payments, billsWithPayments, loans] = await Promise.all([
    getBills(),
    getBillPayments(period),
    // Which bills have ever been paid, and so may only be stopped rather than
    // deleted. All time, not this month.
    getBillsWithPayments(),
    /*
      So an installment bill can be pointed at the loan it pays down. That
      link used to arrive with the seeded bills and had no form of its own; a
      bill typed in without it says "Loan installment" and then takes money
      out of the ledger every month while the balance sits still.
    */
    getLoans(),
  ]);

  const loanChoices = loans
    .filter((loan) => loan.active)
    .map((loan) => ({ id: loan.id, lender: loan.lender }));
  const paidKeys = paidKeysFrom(payments);
  const partPaid = partPaidFrom(payments);
  const totals = monthTotals({ bills, paidKeys, partPaid, period, today });

  const active = bills.filter((bill) => bill.active);
  // Owed this month, earliest due date first (the owner's request, 2 Oct 2026).
  const owed = active
    .filter((bill) => billAppliesTo(bill, period))
    .sort(compareByDueDate);
  // Still counted, just not in this month - a one-time bill for another month,
  // or a monthly one that starts later. Listed so they can still be found.
  const notOwed = active.filter((bill) => !billAppliesTo(bill, period));
  // Unpaid from months that have ended: priority bills (owner, 2 Oct 2026).
  const priority = carriedOverBills({ bills, paidKeys, partPaid, period, today });
  const stopped = bills.filter((bill) => !bill.active);
  const unlinkedInstallments = active.filter(
    (bill) => bill.type === "loan_installment" && bill.loanId === null,
  );

  const previous = periodKey(addMonths(period, -1));
  const next = periodKey(addMonths(period, 1));
  const isThisMonth = periodKey(period) === periodKey(currentPeriod());

  return (
    <div className="space-y-8">
      <div>
        <h1 className={`${HEADING_BOX} text-3xl font-semibold tracking-tight`}>Bills</h1>
        <p className="mt-2 text-muted">
          The fixed costs that have to be covered every month, and whether each
          one is settled.
        </p>
      </div>

      {bills.length === 0 ? (
        <Notice tone="info" title="No bills yet">
          <p>
            Nothing has been entered, so the monthly total is zero and the daily
            target does not yet know what the shop has to cover. Add them one at
            a time at the bottom of this screen - electricity, water, rent,
            internet, each loan installment. The due day can be left blank until
            you are sure of it.
          </p>
        </Notice>
      ) : null}

      {unlinkedInstallments.length > 0 ? (
        <Notice
          tone="attention"
          title={`${unlinkedInstallments.length} loan installment${
            unlinkedInstallments.length === 1 ? " is" : "s are"
          } not linked to a loan`}
        >
          <p>
            {unlinkedInstallments.map((bill) => bill.name).join(", ")} &mdash;
            marking {unlinkedInstallments.length === 1 ? "it" : "them"} paid
            records the money leaving, but reduces no balance, so the debt will
            look like it is not moving. Open Edit on each one and choose the
            loan it pays down.
          </p>
        </Notice>
      ) : null}

      {totals.missingDueDayCount > 0 ? (
        <Notice
          tone="attention"
          title={`${totals.missingDueDayCount} of ${owed.length} bills have no due day yet`}
        >
          <p>
            Without a due day the system cannot warn you before a bill is late,
            and cannot include it in the reminder. Fill in the day of the month
            beside each one below - nothing has been guessed for you.
          </p>
        </Notice>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/bills?month=${previous}`}
              className="rounded-control bg-ink/5 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ink/10"
            >
              {"←"} {formatPeriod(addMonths(period, -1))}
            </Link>
            <Link
              href={`/bills?month=${next}`}
              className="rounded-control bg-ink/5 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-ink/10"
            >
              {formatPeriod(addMonths(period, 1))} {"→"}
            </Link>
          </div>
          {!isThisMonth ? (
            <Link href="/bills" className={`text-sm text-muted underline ${TAP_AREA}`}>
              Back to this month
            </Link>
          ) : null}
        </div>

        <h2 className={`${HEADING_BOX} mt-5 text-2xl font-semibold tracking-tight`}>
          {formatPeriod(period)}
        </h2>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-muted">Total this month</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.total)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Paid</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(totals.paid)}
            </dd>
            <dd className="text-xs text-muted">
              {totals.paidCount} of {owed.length} bills
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Still to pay</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.unpaid)}
            </dd>
            <dd className="text-xs text-muted">{totals.unpaidCount} bills</dd>
            {totals.carriedOverCount > 0 ? (
              <dd className="mt-1 flex items-start gap-1 text-xs text-attention">
                <span aria-hidden="true">{"⚠"}</span>
                <span>
                  Plus {formatPesos(totals.carriedOver)} in{" "}
                  {totals.carriedOverCount} priority bill
                  {totals.carriedOverCount === 1 ? "" : "s"} from earlier months
                </span>
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Needing attention</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
              {totals.attentionCount > 0 ? (
                <span aria-hidden="true" className="text-attention">{"⚠"}</span>
              ) : null}
              <span className={totals.attentionCount > 0 ? "text-attention" : ""}>
                {totals.attentionCount}
              </span>
            </dd>
            <dd className="text-xs text-muted">Overdue or due within 5 days</dd>
          </div>
        </dl>
      </Card>

      {priority.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className={`${HEADING_BOX} text-2xl font-semibold tracking-tight`}>
              Priority bills
            </h2>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-attention">
              <span aria-hidden="true">{"⚠"}</span>
              <span>
                Not paid in the month they were owed, so they have moved here.
                Pay these first. Marking one paid records it against the month
                it was owed in.
              </span>
            </p>
          </div>
          {priority.map((entry) => (
            <BillCard
              key={`${entry.bill.id}:${periodKey(entry.period)}`}
              bill={entry.bill}
              periodKeyValue={periodKey(entry.period)}
              status={entry.status}
              remainingCentavos={entry.remainingCentavos}
              priorityFrom={formatPeriod(entry.period)}
              loans={loans}
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-4">
        {priority.length > 0 && owed.length > 0 ? (
          <h2 className={`${HEADING_BOX} text-2xl font-semibold tracking-tight`}>
            Bills for {formatPeriod(period)}
          </h2>
        ) : null}
        {owed.map((bill) => {
          const paid = paidKeys.has(paidKey(bill.id, period));
          const status = billStatus({
            dueDay: bill.dueDay,
            period,
            paid,
            today,
          });
          // The settling payment, not a part payment, is the one shown as "Paid".
          const payment = payments.find(
            (entry) =>
              entry.billId === bill.id &&
              !entry.isPartial &&
              entry.period.year === period.year &&
              entry.period.month === period.month,
          );

          return (
            <BillCard
              key={bill.id}
              bill={bill}
              periodKeyValue={periodKey(period)}
              status={status}
              remainingCentavos={remainingFor(bill, period, partPaid)}
              paid={paid}
              payment={payment}
              loans={loans}
              manage={
                <Disclosure
                  className="mt-5 border-t border-line/60 pt-4"
                  label={
                    bill.dueDay === null
                      ? "Set the due day, edit or delete"
                      : "Edit or delete this bill"
                  }
                >
                  <BillManagement
                    bill={bill}
                    loanChoices={loanChoices}
                    defaultMonthKey={periodKey(period)}
                    hasHistory={billsWithPayments.has(bill.id)}
                  />
                </Disclosure>
              }
            />
          );
        })}
      </section>

      {notOwed.length > 0 ? (
        <Card
          title={`Not owed in ${formatPeriod(period)} (${notOwed.length})`}
          description="One-time bills for another month, and monthly bills that start later."
        >
          <ul className="space-y-4">
            {notOwed.map((bill) => (
              <li key={bill.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {bill.name} &middot; {formatPesos(bill.amountCentavos)}
                  </span>
                  <FrequencyTag bill={bill} />
                  {bill.startsMonth ? (
                    <Link
                      href={`/bills?month=${periodKey(bill.startsMonth)}`}
                      className={`text-muted underline ${TAP_AREA}`}
                    >
                      {bill.frequency === "one_time" ? "For" : "Starts"}{" "}
                      {formatPeriod(bill.startsMonth)}
                    </Link>
                  ) : null}
                </div>
                <Disclosure label="Edit or delete this bill">
                  <BillManagement
                    bill={bill}
                    loanChoices={loanChoices}
                    defaultMonthKey={periodKey(period)}
                    hasHistory={billsWithPayments.has(bill.id)}
                  />
                </Disclosure>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {stopped.length > 0 ? (
        <Card
          title={`No longer counted (${stopped.length})`}
          description="Kept for their history. They are not part of the monthly total or the daily target."
        >
          <ul className="space-y-4">
            {stopped.map((bill) => (
              <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  {bill.name} &middot; {formatPesos(bill.amountCentavos)}
                </span>
                <div className="flex flex-wrap items-start gap-3">
                  <BillActiveForm billId={bill.id} billName={bill.name} active={false} />
                  <DeleteButton
                    kind="bill"
                    name={bill.name}
                    idField="billId"
                    id={bill.id}
                    hasHistory={billsWithPayments.has(bill.id)}
                    action={deleteBillAction}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Add a bill">
        <BillEditForm loans={loanChoices} defaultMonthKey={periodKey(period)} />
      </Card>
    </div>
  );
}
