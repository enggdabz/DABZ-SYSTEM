import type { Metadata } from "next";

import { BillForm, MarkBillPaidForm, UndoBillPaymentForm } from "@/app/admin/expenses/expense-forms";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, StatTile,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { humanise } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bills" };

export default async function BillsPage() {
  await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: bills }, { data: payments }, { data: loans }] = await Promise.all([
    supabase
      .from("bills")
      .select("id, name, amount_centavos, due_day, type, loan_id, active")
      .order("due_day"),
    supabase
      .from("bill_payments")
      .select("id, bill_id, period_month, amount_centavos, paid_on")
      .eq("period_month", month),
    supabase.from("loans").select("id, lender").eq("active", true).order("lender"),
  ]);

  const rows = (bills ?? []).filter((b) => b.active);
  const paidThisMonth = new Set((payments ?? []).map((p) => p.bill_id));
  const monthlyTotal = rows.reduce((sum, b) => sum + b.amount_centavos, 0);
  const outstanding = rows
    .filter((b) => !paidThisMonth.has(b.id))
    .reduce((sum, b) => sum + b.amount_centavos, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Money out"
        title="Recurring bills"
        description="Paying a bill linked to a loan pays the loan down too."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active bills" value={rows.length} />
        <StatTile label="Monthly total" value={formatCentavos(monthlyTotal)} />
        <StatTile label="Unpaid this month" value={formatCentavos(outstanding)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="New bill" />
        <BillForm loans={loans ?? []} />
      </Card>

      <Card>
        <CardHeader title="Bills" />
        {rows.length === 0 ? (
          <EmptyState message="No bills set up yet." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((bill) => {
              const paid = paidThisMonth.has(bill.id);
              return (
                <li key={bill.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-fg">{bill.name}</p>
                    <span className="text-sm tabular-nums text-fg-muted">
                      {formatCentavos(bill.amount_centavos)}
                    </span>
                    <span className="text-xs text-fg-subtle">due day {bill.due_day}</span>
                    <Badge>{humanise(bill.type)}</Badge>
                    {paid ? <Badge tone="good">Paid this month</Badge> : <Badge tone="warn">Unpaid</Badge>}
                  </div>
                  {paid ? (
                    <UndoBillPaymentForm billId={bill.id} />
                  ) : (
                    <MarkBillPaidForm
                      billId={bill.id}
                      amount={(bill.amount_centavos / 100).toFixed(2)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
