import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { billStatus, monthTotals, paidKey, type BillStatus } from "@/lib/bills";
import { getBillPayments, getBills, paidKeysFrom } from "@/lib/data/money";
import { formatPesos } from "@/lib/money";
import {
  addMonths,
  currentPeriod,
  formatPeriod,
  manilaToday,
  parsePeriodKey,
  periodKey,
} from "@/lib/period";

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

  const [bills, payments] = await Promise.all([
    getBills(),
    getBillPayments(period),
  ]);
  const paidKeys = paidKeysFrom(payments);
  const totals = monthTotals({ bills, paidKeys, period, today });

  const active = bills.filter((bill) => bill.active);
  const stopped = bills.filter((bill) => !bill.active);

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
            <Link href="/bills" className="text-sm text-muted underline">
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
                  {bill.loanId ? (
                    <p className="mt-2 text-xs text-muted">
                      Paying this also pays down its loan.{" "}
                      <Link href="/loans" className="underline">
                        See loans
                      </Link>
                    </p>
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

              <details className="mt-5 border-t border-line/60 pt-4">
                <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                  {bill.dueDay === null ? "Set the due day, or edit this bill" : "Edit this bill"}
                </summary>
                <div className="mt-4 space-y-6">
                  <DueDayForm billId={bill.id} dueDay={bill.dueDay} />
                  <div className="border-t border-line/60 pt-4">
                    <BillEditForm bill={bill} />
                  </div>
                  <div className="border-t border-line/60 pt-4">
                    <BillActiveForm billId={bill.id} billName={bill.name} active={bill.active} />
                  </div>
                </div>
              </details>
            </Card>
          );
        })}
      </section>

      {stopped.length > 0 ? (
        <Card
          title={`No longer counted (${stopped.length})`}
          description="Kept for their history. They are not part of the monthly total or the daily target."
        >
          <ul className="space-y-3">
            {stopped.map((bill) => (
              <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  {bill.name} &middot; {formatPesos(bill.amountCentavos)}
                </span>
                <BillActiveForm billId={bill.id} billName={bill.name} active={false} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Add a bill">
        <BillEditForm />
      </Card>
    </div>
  );
}
