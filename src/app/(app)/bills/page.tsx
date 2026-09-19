import Link from "next/link";
import { connection } from "next/server";

import { DeleteButton } from "@/components/DeleteButton";
import { Card, Disclosure, Notice, TAP_AREA, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { billStatus, monthTotals, paidKey, type BillStatus } from "@/lib/bills";
import {
  getBillPayments,
  getBills,
  getBillsWithPayments,
  getLoans,
  paidKeysFrom,
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
  const totals = monthTotals({ bills, paidKeys, period, today });

  const active = bills.filter((bill) => bill.active);
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
        <h1 className="text-3xl font-semibold tracking-tight">Bills</h1>
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
          title={`${totals.missingDueDayCount} of ${active.length} bills have no due day yet`}
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

        <h2 className="mt-5 text-2xl font-semibold tracking-tight">
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
              {totals.paidCount} of {active.length} bills
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Still to pay</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.unpaid)}
            </dd>
            <dd className="text-xs text-muted">{totals.unpaidCount} bills</dd>
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

      <section className="space-y-4">
        {active.map((bill) => {
          const paid = paidKeys.has(paidKey(bill.id, period));
          const status = billStatus({
            dueDay: bill.dueDay,
            period,
            paid,
            today,
          });
          const payment = payments.find(
            (entry) =>
              entry.billId === bill.id &&
              entry.period.year === period.year &&
              entry.period.month === period.month,
          );

          return (
            <Card key={bill.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">{bill.name}</h3>
                    {bill.type === "loan_installment" ? (
                      <Tag tone="accent">Loan installment</Tag>
                    ) : null}
                  </div>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatPesos(bill.amountCentavos)}
                  </p>
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
                        {loans.find((loan) => loan.id === bill.loanId)?.lender ??
                          "its loan"}
                        .{" "}
                        <Link href="/loans" className={`underline ${TAP_AREA}`}>
                          See loans
                        </Link>
                      </p>
                    ) : (
                      /*
                        The silent case, said out loud. An installment bill with
                        no loan behind it is paid every month and reduces
                        nothing - the ledger shows the money gone and the debt
                        exactly where it was.
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
                    <UndoPaymentForm billId={bill.id} period={periodKey(period)} />
                  ) : (
                    <MarkPaidForm
                      billId={bill.id}
                      billName={bill.name}
                      period={periodKey(period)}
                      amountCentavos={bill.amountCentavos}
                    />
                  )}
                </div>
              </div>

              <Disclosure
                className="mt-5 border-t border-line/60 pt-4"
                label={
                  bill.dueDay === null
                    ? "Set the due day, edit or delete"
                    : "Edit or delete this bill"
                }
              >
                <div className="space-y-6">
                  <DueDayForm billId={bill.id} dueDay={bill.dueDay} />
                  <div className="border-t border-line/60 pt-4">
                    <BillEditForm bill={bill} loans={loanChoices} />
                  </div>
                  <div className="flex flex-wrap items-start gap-3 border-t border-line/60 pt-4">
                    <BillActiveForm billId={bill.id} billName={bill.name} active={bill.active} />
                    <DeleteButton
                      kind="bill"
                      name={bill.name}
                      idField="billId"
                      id={bill.id}
                      hasHistory={billsWithPayments.has(bill.id)}
                      action={deleteBillAction}
                    />
                  </div>
                </div>
              </Disclosure>
            </Card>
          );
        })}
      </section>

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
        <BillEditForm loans={loanChoices} />
      </Card>
    </div>
  );
}
