import { connection } from "next/server";

import { DeleteButton } from "@/components/DeleteButton";
import { Card, Disclosure, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  getBills,
  getLoanPayments,
  getLoanSummaries,
  getLoansWithPayments,
} from "@/lib/data/money";
import { describeMonths } from "@/lib/loans";
import { formatPesos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday } from "@/lib/period";

import { deleteLoanAction } from "./actions";
import {
  LoanActiveForm,
  LoanEditForm,
  RecordPaymentForm,
  UpdateFromStatementForm,
} from "./LoanForms";

export const metadata = { title: "Loans · Dabz System" };

export default async function LoansPage() {
  await connection();

  await requireOwnerOrAdmin();

  const [summaries, payments, loansWithPayments, bills] = await Promise.all([
    getLoanSummaries(),
    getLoanPayments(),
    // Which loans have a payment behind them, and so may only be stopped.
    getLoansWithPayments(),
    // Only to warn, before a loan goes, about an installment bill that would
    // be left pointing at nothing.
    getBills(),
  ]);

  /*
    An installment bill points at a loan, and that key is `on delete set null`
    - so deleting the loan does not take the bill with it, it quietly stops the
    bill paying anything down. Said out loud before the button is pressed, not
    discovered next month when the balance has not moved.
  */
  function linkedBillNames(loanId: string): string | undefined {
    const linked = bills.filter((bill) => bill.loanId === loanId);
    if (linked.length === 0) return undefined;
    return `${linked.map((bill) => bill.name).join(", ")} ${
      linked.length === 1 ? "is a bill" : "are bills"
    } that pays this loan down. ${
      linked.length === 1 ? "It stays" : "They stay"
    } on the Bills screen, but will stop reducing any balance.`;
  }

  const today = civilDateToISO(manilaToday());
  const active = summaries.filter((summary) => summary.loan.active);
  const stopped = summaries.filter((summary) => !summary.loan.active);
  const totalDebt = active.reduce((sum, summary) => sum + summary.remainingCentavos, 0);
  const growing = active.filter((summary) => summary.balanceGrowing);
  const missingRates = active.filter(
    (summary) => summary.loan.interestPercentPerMonth === null,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Loans</h1>
        <p className="mt-2 text-muted">
          What the shop owes, and whether each debt is actually shrinking.
        </p>
      </div>

      <Card>
        <p className="text-xs font-medium text-muted">Total still owed</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">
          {formatPesos(totalDebt)}
        </p>
        <p className="mt-2 text-sm text-muted">
          {active.length === 0
            ? "No loans are being counted, so this is zero rather than true."
            : `Across ${active.length} loan${active.length === 1 ? "" : "s"}, from the statement balances you entered less the payments recorded since.`}
        </p>
      </Card>

      {summaries.length === 0 ? (
        <Notice tone="info" title="No loans yet">
          <p>
            Nothing has been entered, so the total above is zero rather than
            true. Add each debt below with the balance printed on its most
            recent statement and the date that statement was issued - the system
            works from that figure and subtracts the payments you record after
            it, so it can always be tied back to a piece of paper. The interest
            rate can wait until you have one to hand.
          </p>
        </Notice>
      ) : null}

      {growing.length > 0 ? (
        <Notice
          tone="attention"
          title={`${growing.length} loan${growing.length === 1 ? "" : "s"} growing rather than shrinking`}
        >
          <p>
            The monthly payment on{" "}
            {growing.map((summary) => summary.loan.lender).join(", ")} is not
            covering the interest, so the balance goes up every month even when
            the payment is made on time. Paying more than the interest is the
            only thing that changes this.
          </p>
        </Notice>
      ) : null}

      {missingRates.length > 0 ? (
        <Notice
          tone="attention"
          title={`${missingRates.length} loan${missingRates.length === 1 ? "" : "s"} have no interest rate yet`}
        >
          <p>
            Without the rate the system cannot work out the real payoff time, or
            warn you when a balance is growing. The figures below leave interest
            out entirely, so they are the best case, not the likely one. Fill in
            the monthly rate from each statement -{" "}
            {missingRates.map((summary) => summary.loan.lender).join(", ")}.
          </p>
        </Notice>
      ) : null}

      <section className="space-y-5">
        {active.map((summary) => {
          const { loan } = summary;
          const loanPayments = payments.filter((payment) => payment.loanId === loan.id);

          return (
            <Card key={loan.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">{loan.lender}</h2>
                    {summary.balanceGrowing ? (
                      <Tag tone="attention">{"⚠"} Balance growing</Tag>
                    ) : null}
                    {loan.interestPercentPerMonth === null ? (
                      <Tag tone="attention">{"⚠"} Interest rate unknown</Tag>
                    ) : null}
                  </div>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {formatPesos(summary.remainingCentavos)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    From a statement of {formatPesos(loan.statementBalanceCentavos)} dated{" "}
                    {formatCivilDate(loan.statementDate)}
                    {loanPayments.length > 0
                      ? `, less ${loanPayments.length} recorded payment${loanPayments.length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                  {loan.note ? (
                    <p className="mt-2 text-sm text-muted">{loan.note}</p>
                  ) : null}
                </div>

                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted">Monthly payment</dt>
                    <dd className="mt-0.5 font-semibold">
                      {loan.monthlyPaymentCentavos === null
                        ? "None set"
                        : formatPesos(loan.monthlyPaymentCentavos)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted">Interest a month</dt>
                    <dd className="mt-0.5 font-semibold">
                      {summary.monthlyInterestCentavos === null
                        ? "Unknown"
                        : `${formatPesos(summary.monthlyInterestCentavos)} (${loan.interestPercentPerMonth}%)`}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-muted">Time to clear it</dt>
                    <dd className="mt-0.5 font-semibold">
                      {summary.payoff.neverPaysOff ? (
                        <span className="text-attention">
                          {"⚠"}{" "}
                          {loan.monthlyPaymentCentavos === null
                            ? "Never - no monthly payment set"
                            : "Never at this payment"}
                        </span>
                      ) : (
                        describeMonths(summary.payoff.months ?? 0)
                      )}
                    </dd>
                    {summary.payoff.ignoresInterest && !summary.payoff.neverPaysOff ? (
                      <dd className="text-xs text-muted">
                        Ignores interest, because the rate is not known yet.
                      </dd>
                    ) : null}
                    {summary.payoff.totalInterestCentavos !== null ? (
                      <dd className="text-xs text-muted">
                        {formatPesos(summary.payoff.totalInterestCentavos)} of that is
                        interest.
                      </dd>
                    ) : null}
                  </div>
                </dl>
              </div>

              <div className="mt-6 space-y-6 border-t border-line/60 pt-5">
                <RecordPaymentForm
                  loanId={loan.id}
                  lender={loan.lender}
                  suggestedAmountCentavos={loan.monthlyPaymentCentavos}
                  today={today}
                />

                <Disclosure label="Update from a statement, edit or delete">
                  <div className="space-y-6">
                    <UpdateFromStatementForm
                      loanId={loan.id}
                      balanceCentavos={loan.statementBalanceCentavos}
                      statementDate={civilDateToISO(loan.statementDate)}
                    />
                    <div className="border-t border-line/60 pt-5">
                      <LoanEditForm loan={loan} today={today} />
                    </div>
                    <div className="flex flex-wrap items-start gap-3 border-t border-line/60 pt-5">
                      <LoanActiveForm
                        loanId={loan.id}
                        lender={loan.lender}
                        active={loan.active}
                      />
                      <DeleteButton
                        kind="loan"
                        name={loan.lender}
                        idField="loanId"
                        id={loan.id}
                        hasHistory={loansWithPayments.has(loan.id)}
                        action={deleteLoanAction}
                        consequence={linkedBillNames(loan.id)}
                      />
                    </div>
                  </div>
                </Disclosure>

                {loanPayments.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                      Payment history ({loanPayments.length})
                    </summary>
                    <ul className="mt-3 divide-y divide-line/60 text-sm">
                      {loanPayments.map((payment) => (
                        <li
                          key={payment.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                        >
                          <span className="font-medium">
                            {formatPesos(payment.amountCentavos)}
                          </span>
                          <span className="text-xs text-muted">
                            {formatCivilDate(payment.paidOn)}
                            {payment.origin === "bill" ? " · from a bill" : ""}
                            {payment.note ? ` · ${payment.note}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </Card>
          );
        })}
      </section>

      {stopped.length > 0 ? (
        <Card
          title={`No longer counted (${stopped.length})`}
          description="Kept for their payment history. They are not part of the total owed."
        >
          <ul className="space-y-4">
            {stopped.map(({ loan }) => (
              <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  {loan.lender} &middot; {formatPesos(loan.statementBalanceCentavos)}
                </span>
                <div className="flex flex-wrap items-start gap-3">
                  <LoanActiveForm loanId={loan.id} lender={loan.lender} active={false} />
                  <DeleteButton
                    kind="loan"
                    name={loan.lender}
                    idField="loanId"
                    id={loan.id}
                    hasHistory={loansWithPayments.has(loan.id)}
                    action={deleteLoanAction}
                    consequence={linkedBillNames(loan.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title="Add a loan"
        description="The balance as printed on the most recent statement, and the date it was true."
      >
        <LoanEditForm today={today} />
      </Card>
    </div>
  );
}
