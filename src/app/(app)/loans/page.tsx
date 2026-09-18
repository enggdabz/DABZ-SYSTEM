import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getLoanPayments, getLoanSummaries } from "@/lib/data/money";
import { describeMonths } from "@/lib/loans";
import { formatPesos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday } from "@/lib/period";

import { LoanEditForm, RecordPaymentForm, UpdateFromStatementForm } from "./LoanForms";

export const metadata = { title: "Loans · Dabz System" };

export default async function LoansPage() {
  await connection();

  await requireOwnerOrAdmin();

  const [summaries, payments] = await Promise.all([
    getLoanSummaries(),
    getLoanPayments(),
  ]);

  const today = civilDateToISO(manilaToday());
  const active = summaries.filter((summary) => summary.loan.active);
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
          Across {active.length} loan{active.length === 1 ? "" : "s"}. The
          specification noted the real figure is likely closer to
          {" "}{formatPesos(200000000)}, so there are probably debts still to add.
        </p>
      </Card>

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

                <details>
                  <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                    Update from a statement, or edit this loan
                  </summary>
                  <div className="mt-4 space-y-6">
                    <UpdateFromStatementForm
                      loanId={loan.id}
                      balanceCentavos={loan.statementBalanceCentavos}
                      statementDate={civilDateToISO(loan.statementDate)}
                    />
                    <div className="border-t border-line/60 pt-5">
                      <LoanEditForm loan={loan} today={today} />
                    </div>
                  </div>
                </details>

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

      <Card
        title="Add a loan"
        description="The specification noted around PHP 660,000 of debts still to be entered."
      >
        <LoanEditForm today={today} />
      </Card>
    </div>
  );
}
