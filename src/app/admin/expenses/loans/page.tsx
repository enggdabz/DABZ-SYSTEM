import type { Metadata } from "next";

import { LoanForm, LoanPaymentForm } from "@/app/admin/expenses/expense-forms";
import {
  Card, CardHeader, EmptyState, PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { humanise } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Loans" };

export default async function LoansPage() {
  await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const [{ data: loans }, { data: payments }] = await Promise.all([
    supabase
      .from("loans")
      .select("id, lender, statement_balance_centavos, statement_date, monthly_payment_centavos, interest_percent_per_month, active")
      .order("lender"),
    supabase
      .from("loan_payments")
      .select("id, loan_id, amount_centavos, paid_on, origin, note")
      .order("paid_on", { ascending: false }),
  ]);

  // monthly_payment_centavos is nullable; an unset commitment counts as zero.
  const rows = (loans ?? [])
    .filter((l) => l.active)
    .map((l) => ({ ...l, monthly_payment_centavos: l.monthly_payment_centavos ?? 0 }));
  const paidByLoan = new Map<string, number>();
  for (const payment of payments ?? []) {
    paidByLoan.set(
      payment.loan_id,
      (paidByLoan.get(payment.loan_id) ?? 0) + payment.amount_centavos,
    );
  }

  const owed = rows.reduce(
    (sum, loan) =>
      sum + Math.max(0, loan.statement_balance_centavos - (paidByLoan.get(loan.id) ?? 0)),
    0,
  );
  const monthly = rows.reduce((sum, l) => sum + l.monthly_payment_centavos, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Money out"
        title="Loans"
        description="Remaining is the statement balance less what has been paid since."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active loans" value={rows.length} />
        <StatTile label="Remaining" value={formatCentavos(owed)} />
        <StatTile label="Monthly commitment" value={formatCentavos(monthly)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="New loan" />
        <LoanForm />
      </Card>

      {rows.length === 0 ? (
        <Card><EmptyState message="No loans recorded." /></Card>
      ) : (
        rows.map((loan) => {
          const paid = paidByLoan.get(loan.id) ?? 0;
          const loanPayments = (payments ?? []).filter((p) => p.loan_id === loan.id);
          return (
            <Card key={loan.id} className="mb-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
                <h3 className="text-sm font-semibold text-fg">{loan.lender}</h3>
                <span className="text-sm tabular-nums text-fg-muted">
                  {formatCentavos(Math.max(0, loan.statement_balance_centavos - paid))} remaining
                </span>
                <span className="text-xs text-fg-subtle">
                  statement {formatCentavos(loan.statement_balance_centavos)} on {loan.statement_date}
                  {" · "}{Number(loan.interest_percent_per_month)}% per month
                </span>
              </div>

              {loanPayments.length > 0 ? (
                <Table>
                  <thead>
                    <tr><Th>Paid on</Th><Th numeric>Amount</Th><Th>Origin</Th><Th>Note</Th></tr>
                  </thead>
                  <TBody>
                    {loanPayments.map((payment) => (
                      <tr key={payment.id}>
                        <Td muted>{payment.paid_on}</Td>
                        <Td numeric>{formatCentavos(payment.amount_centavos)}</Td>
                        <Td muted>{humanise(payment.origin)}</Td>
                        <Td muted>{payment.note ?? "—"}</Td>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState message="No payments yet." />
              )}

              <div className="border-t border-line p-5">
                <LoanPaymentForm loanId={loan.id} />
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
